import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient, createRateLimiter, apiResponse, apiError, getClientIp, isBodyTooLarge } from '../src/lib/api-helpers';
import { cancelRequestSchema } from '../src/lib/validation';
import { sanitizeText } from '../src/lib/sanitize';
import { RATE_LIMITS } from '../src/lib/constants';
import { sendCancellationEmail } from '../src/lib/email';
import { deleteCalendarEvent } from '../src/lib/google-calendar';
import type { Booking, SessionType, Practitioner } from '../src/types/database';

// Rate limiter for cancel endpoint
const cancelRateLimiter = createRateLimiter(
  'cancel',
  RATE_LIMITS.cancel.limit,
  RATE_LIMITS.cancel.window
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return apiError(res, 405, 'INVALID_INPUT', 'Method not allowed');
  }

  // Check body size (max 10KB)
  if (req.body && isBodyTooLarge(req.body)) {
    return apiError(res, 413, 'INVALID_INPUT', 'Request body too large');
  }

  // Rate limiting by IP
  const clientIp = getClientIp(req);
  const rateLimitResult = await cancelRateLimiter.limit(clientIp);
  const allowed = 'success' in rateLimitResult ? rateLimitResult.success : rateLimitResult.allowed;
  
  if (!allowed) {
    res.setHeader('Retry-After', '60');
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  // Parse and validate request body
  const parseResult = cancelRequestSchema.safeParse(req.body);
  
  if (!parseResult.success) {
    const message = parseResult.error.errors.map(e => e.message).join(', ');
    return apiError(res, 422, 'INVALID_INPUT', message);
  }

  const { booking_token, reason } = parseResult.data;
  const sanitizedReason = sanitizeText(reason) || null;

  const supabase = createServiceClient();

  // Look up booking by token (with related data for email)
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_token,
      status,
      starts_at,
      ends_at,
      cancelled_at,
      guest_name,
      guest_email,
      guest_timezone,
      google_event_id,
      session_types!inner(
        id,
        name,
        description,
        duration_minutes,
        practitioner_id
      ),
      practitioners!inner(
        id,
        username,
        display_name,
        email,
        timezone,
        google_calendar_connected
      )
    `)
    .eq('booking_token', booking_token)
    .single();

  if (bookingError || !booking) {
    // Generic error - don't reveal if token exists or not
    return apiError(res, 404, 'NOT_FOUND', 'Booking not found');
  }

  const now = new Date();
  const startsAt = new Date(booking.starts_at);
  const endsAt = new Date(booking.ends_at);

  // Already cancelled - idempotent response
  if (booking.status === 'cancelled') {
    return apiResponse(res, 200, {
      status: 'cancelled',
      cancelled_at: booking.cancelled_at,
    });
  }

  // Cannot cancel completed or no_show bookings
  if (booking.status === 'completed' || booking.status === 'no_show') {
    return apiError(res, 422, 'INVALID_INPUT', 'Cannot cancel a completed booking');
  }

  // Cannot cancel past bookings
  if (endsAt < now) {
    return apiError(res, 422, 'INVALID_INPUT', 'Cannot cancel a past booking');
  }

  // Cannot cancel bookings in progress
  if (startsAt <= now && now < endsAt) {
    return apiError(res, 422, 'INVALID_INPUT', 'Cannot cancel a session that is currently in progress');
  }

  // Update booking status to cancelled
  const { data: updatedBooking, error: updateError } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: now.toISOString(),
      cancellation_reason: sanitizedReason,
    })
    .eq('booking_token', booking_token)
    .select('cancelled_at')
    .single();

  if (updateError) {
    console.error('[Cancel] Database error:', updateError);
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel booking');
  }

  if (!updatedBooking) {
    return apiError(res, 500, 'INTERNAL_ERROR', 'Failed to cancel booking');
  }

  console.log(`[Cancel] Processing cancellation for booking ${booking_token}`);

  // Send cancellation email to guest (async - don't block response)
  // We need to reconstruct the booking, sessionType, and practitioner objects from the joined query
  if (booking) {
    // Extract nested data from Supabase join
    const sessionTypeData = (booking as unknown as {
      'session_types': { id: string; name: string; description: string | null; duration_minutes: number; practitioner_id: string };
    })['session_types'];
    
    const practitionerData = (booking as unknown as {
      'practitioners': { id: string; username: string; display_name: string; email: string; timezone: string };
    })['practitioners'];

    const bookingForEmail = {
      id: booking.id,
      booking_token: booking.booking_token,
      guest_name: (booking as unknown as { guest_name: string }).guest_name,
      guest_email: (booking as unknown as { guest_email: string }).guest_email,
      guest_timezone: (booking as unknown as { guest_timezone: string | null }).guest_timezone,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      status: 'cancelled' as const,
      cancelled_at: updatedBooking.cancelled_at,
      cancellation_reason: sanitizedReason,
    };

    sendCancellationEmail(bookingForEmail.guest_email, { booking: bookingForEmail as unknown as Booking, sessionType: sessionTypeData as unknown as SessionType, practitioner: practitionerData as unknown as Practitioner }).catch((err) => {
      console.error('[Cancel] Failed to send cancellation email:', err);
    });

    // Delete Google Calendar event (async - don't block response)
    const practitionerId = practitionerData.id;
    const googleEventId = (booking as unknown as { google_event_id: string | null }).google_event_id;
    if (googleEventId) {
      deleteCalendarEvent(practitionerId, googleEventId, supabase).catch((err) => {
        console.error('[Google Calendar] Failed to delete event:', err);
      });
    }
  }

  return apiResponse(res, 200, {
    status: 'cancelled',
    cancelled_at: updatedBooking.cancelled_at,
  });
}
