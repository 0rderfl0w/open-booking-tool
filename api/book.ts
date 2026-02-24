import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { nanoid } from 'nanoid';
import { sendConfirmationEmail, sendPractitionerNotificationEmail } from '../src/lib/email';
import { RATE_LIMITS, BOOKING_TOKEN_LENGTH } from '../src/lib/constants';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Rate limiting (simplified - in production use @upstash/ratelimit)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only POST method is allowed' },
    });
  }

  // Rate limit check
  const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(clientIp, RATE_LIMITS.book.limit, 60000)) {
    return res.status(429).json({
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
    });
  }

  const { username, session_type_id, starts_at, guest_name, guest_email, guest_timezone, notes } = req.body || {};
  
  // Basic validation
  if (!username || !session_type_id || !starts_at || !guest_name || !guest_email || !guest_timezone) {
    return res.status(422).json({
      error: { code: 'INVALID_INPUT', message: 'Missing required fields' },
    });
  }

  // Validate guest_timezone
  try {
    Intl.DateTimeFormat(undefined, { timeZone: guest_timezone });
  } catch {
    return res.status(422).json({
      error: { code: 'INVALID_INPUT', message: 'Invalid timezone' },
    });
  }

  try {
    // 1. Look up practitioner by username
    const { data: practitioner, error: practitionerError } = await supabase
      .from('practitioners')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .single();

    if (practitionerError || !practitioner) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Practitioner not found' },
      });
    }

    // 2. Look up session type
    const { data: sessionType, error: sessionTypeError } = await supabase
      .from('session_types')
      .select('*')
      .eq('id', session_type_id)
      .eq('practitioner_id', practitioner.id)
      .eq('is_active', true)
      .single();

    if (sessionTypeError || !sessionType) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Session type not found' },
      });
    }

    // 3. Verify slot availability (simplified - full implementation would re-run slot calculation)
    // Check if there's already a booking at this time
    const { data: existingBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('practitioner_id', practitioner.id)
      .eq('starts_at', starts_at)
      .neq('status', 'cancelled')
      .single();

    if (existingBooking) {
      return res.status(409).json({
        error: { code: 'SLOT_TAKEN', message: 'That slot is no longer available — please choose another.' },
      });
    }

    // 4. Calculate end time
    const startDate = new Date(starts_at);
    const endDate = new Date(startDate.getTime() + sessionType.duration_minutes * 60 * 1000);

    // 5. Generate booking token
    const bookingToken = nanoid(BOOKING_TOKEN_LENGTH);

    // 6. Insert booking
    const { data: booking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        booking_token: bookingToken,
        session_type_id: sessionType.id,
        practitioner_id: practitioner.id,
        guest_name: guest_name.trim(),
        guest_email: guest_email.trim().toLowerCase(),
        guest_timezone,
        starts_at: starts_at,
        ends_at: endDate.toISOString(),
        buffer_minutes: sessionType.buffer_minutes,
        status: 'confirmed',
        notes: notes?.trim() || null,
      })
      .select()
      .single();

    if (insertError) {
      // Check for exclusion constraint violation
      if (insertError.code === '23P01') {
        return res.status(409).json({
          error: { code: 'SLOT_TAKEN', message: 'That slot is no longer available — please choose another.' },
        });
      }
      console.error('Booking insert error:', insertError);
      return res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: 'Failed to create booking' },
      });
    }

    // 7. Send confirmation emails (async - don't wait)
    const appUrl = process.env.APP_URL || '';
    
    // Send guest confirmation email
    sendConfirmationEmail(booking.guest_email, { booking, sessionType, practitioner }).catch((err) => {
      console.error('Failed to send confirmation email:', err);
    });

    // Send practitioner notification email
    sendPractitionerNotificationEmail(practitioner.email, { booking, sessionType, practitioner }).catch((err) => {
      console.error('Failed to send practitioner notification:', err);
    });

    // 8. Return success
    return res.status(201).json({
      booking_token: booking.booking_token,
      booking_url: `${appUrl}/booking/${booking.booking_token}`,
      starts_at: booking.starts_at,
      ends_at: booking.ends_at,
    });
  } catch (err) {
    console.error('Booking error:', err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
}
