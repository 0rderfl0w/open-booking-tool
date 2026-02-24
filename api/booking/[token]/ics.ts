import type { VercelRequest, VercelResponse } from '@vercel/node';
import ical, { ICalCalendarMethod } from 'ical-generator';
import { createServiceClient, createRateLimiter, apiError, getClientIp, isBodyTooLarge } from '../../../src/lib/api-helpers';
import { RATE_LIMITS } from '../../../src/lib/constants';

// Rate limiter for ICS endpoint
const icsRateLimiter = createRateLimiter(
  'ics',
  RATE_LIMITS.ics.limit,
  RATE_LIMITS.ics.window
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return apiError(res, 405, 'INVALID_INPUT', 'Method not allowed');
  }

  // Check body size (max 10KB)
  if (isBodyTooLarge(req)) {
    return apiError(res, 413, 'INVALID_INPUT', 'Request body too large');
  }

  // Rate limiting by IP
  const clientIp = getClientIp(req);
  const rateLimitResult = await icsRateLimiter.limit(clientIp);
  const allowed = 'success' in rateLimitResult ? rateLimitResult.success : rateLimitResult.allowed;
  
  if (!allowed) {
    res.setHeader('Retry-After', '3600'); // 1 hour
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  // Get token from query params (Vercel API route: /api/booking/[token]/ics.ts)
  const token = req.query.token;
  
  if (!token || typeof token !== 'string') {
    // Generic 404 - don't reveal enumeration info
    return apiError(res, 404, 'NOT_FOUND', 'Booking not found');
  }

  const supabase = createServiceClient();

  // Look up booking with session type and practitioner info
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .select(`
      id,
      booking_token,
      guest_name,
      guest_email,
      guest_timezone,
      starts_at,
      ends_at,
      status,
      notes,
      session_types!inner(
        name,
        description,
        duration_minutes
      ),
      practitioners!inner(
        username,
        display_name,
        email,
        timezone
      )
    `)
    .eq('booking_token', token)
    .single();

  if (bookingError || !booking) {
    // Generic 404 - don't reveal if token exists
    return apiError(res, 404, 'NOT_FOUND', 'Booking not found');
  }

  // Extract nested data
  // Note: Supabase returns these with the table prefix due to the join
  const sessionType = (booking as unknown as {
    'session_types': { name: string; description: string | null; duration_minutes: number };
  })['session_types'];
  
  const practitioner = (booking as unknown as {
    'practitioners': { username: string; display_name: string; email: string; timezone: string };
  })['practitioners'];

  // Use guest timezone for ICS, fallback to practitioner's timezone
  const icsTimezone = booking.guest_timezone ?? practitioner.timezone;

  // Build app URL for links
  const appUrl = process.env.APP_URL ?? 'http://localhost:5173';
  const bookingUrl = `${appUrl}/booking/${booking.booking_token}`;
  const cancelUrl = `${bookingUrl}/cancel`;

  // Create calendar
  const calendar = ical({
    name: 'Booking Invitation',
    method: ICalCalendarMethod.REQUEST,
    timezone: icsTimezone,
  });

  // Format description with booking details
  const description = [
    sessionType.description ?? '',
    '',
    '---',
    `Booking Reference: ${booking.booking_token}`,
    `View booking: ${bookingUrl}`,
    `Cancel booking: ${cancelUrl}`,
    booking.notes ? `\nNotes: ${booking.notes}` : '',
  ].filter(Boolean).join('\n');

  // Create event
  calendar.createEvent({
    start: new Date(booking.starts_at),
    end: new Date(booking.ends_at),
    summary: `${sessionType.name} with ${practitioner.display_name}`,
    description,
    location: 'Virtual',
    organizer: {
      name: practitioner.display_name,
      email: practitioner.email,
    },
    attendees: [
      {
        name: booking.guest_name,
        email: booking.guest_email,
      },
    ],
  });
  
  // Generate ICS content
  const icsContent = calendar.toString();

  // Set response headers
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="booking-${booking.booking_token}.ics"`);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  return res.send(icsContent);
}
