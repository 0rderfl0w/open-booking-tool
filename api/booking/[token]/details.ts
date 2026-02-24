import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createServiceClient } from '../../../src/lib/supabase-server';
import type { BookingDetails } from '../../../src/types/api';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // Only allow GET
  if (request.method !== 'GET') {
    return response.status(405).json({
      error: { code: 'INVALID_INPUT', message: 'Method not allowed' },
    });
  }

  // Get token from URL params
  const { token } = request.query;

  if (!token || typeof token !== 'string' || token.length < 1) {
    return response.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Booking token is required' },
    });
  }

  // Rate limiting would go here (30/min per IP) - for now, skip implementation
  // since it requires Upstash Redis setup

  try {
    const supabase = createServiceClient();

    // Fetch booking by token with joined data
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
        cancelled_at,
        cancellation_reason,
        session_type:session_types!inner(
          name,
          description,
          duration_minutes
        ),
        practitioner:practitioners!inner(
          username,
          display_name,
          photo_url,
          timezone
        )
      `)
      .eq('booking_token', token)
      .single();

    if (bookingError || !booking) {
      // Generic 404 - don't reveal if token format is wrong
      return response.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Booking not found' },
      });
    }

    // TypeScript doesn't know the shape, so we cast
    const result: BookingDetails = {
      booking_token: booking.booking_token,
      guest_name: booking.guest_name,
      guest_email: booking.guest_email,
      guest_timezone: booking.guest_timezone,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
      status: booking.status,
      notes: booking.notes,
      cancelled_at: booking.cancelled_at,
      cancellation_reason: booking.cancellation_reason,
      session_type: {
        name: (booking.session_type as unknown as { name: string }).name,
        description: (booking.session_type as unknown as { description: string | null }).description,
        duration_minutes: (booking.session_type as unknown as { duration_minutes: number }).duration_minutes,
      },
      practitioner: {
        username: (booking.practitioner as unknown as { username: string }).username,
        display_name: (booking.practitioner as unknown as { display_name: string }).display_name,
        photo_url: (booking.practitioner as unknown as { photo_url: string | null }).photo_url,
        timezone: (booking.practitioner as unknown as { timezone: string }).timezone,
      },
    };

    return response.status(200).json(result);
  } catch (err) {
    console.error('Booking details error:', err);
    return response.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
  }
}
