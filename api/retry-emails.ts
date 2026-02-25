import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendConfirmationEmail } from '../src/lib/email';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const MAX_RETRY_COUNT = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST (Vercel cron) or GET (manual trigger in dev)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate cron secret
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  try {
    // Query bookings that need email retry
    const { data: bookings, error: queryError } = await supabase
      .from('bookings')
      .select(`
        *,
        session_types!inner(*),
        practitioners!inner(*)
      `)
      .eq('status', 'confirmed')
      .is('confirmation_email_sent_at', null)
      .gte('created_at', cutoff24h.toISOString())
      .lt('email_retry_count', MAX_RETRY_COUNT);

    if (queryError) {
      console.error('[retry-emails] Query error:', queryError);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!bookings || bookings.length === 0) {
      return res.status(200).json({ retried: 0, succeeded: 0, failed: 0, message: 'No emails to retry' });
    }

    let succeeded = 0;
    let failed = 0;

    for (const row of bookings) {
      const booking = {
        id: row.id,
        booking_token: row.booking_token,
        session_type_id: row.session_type_id,
        practitioner_id: row.practitioner_id,
        guest_name: row.guest_name,
        guest_email: row.guest_email,
        guest_timezone: row.guest_timezone,
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        buffer_minutes: row.buffer_minutes,
        status: row.status,
        notes: row.notes,
        google_event_id: row.google_event_id,
        cancelled_at: row.cancelled_at,
        cancellation_reason: row.cancellation_reason,
        confirmation_email_sent_at: row.confirmation_email_sent_at,
        reminder_sent_at: row.reminder_sent_at,
        email_retry_count: row.email_retry_count,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const sessionType = row.session_types;
      const practitioner = row.practitioners;

      try {
        await sendConfirmationEmail(booking.guest_email, { booking, sessionType, practitioner });

        await supabase
          .from('bookings')
          .update({ confirmation_email_sent_at: new Date().toISOString() })
          .eq('id', booking.id);

        succeeded++;
      } catch (err) {
        console.error(`[retry-emails] Retry failed for booking ${booking.id} (attempt ${booking.email_retry_count + 1}):`, err);

        await supabase
          .from('bookings')
          .update({ email_retry_count: booking.email_retry_count + 1 })
          .eq('id', booking.id);

        failed++;
      }
    }

    return res.status(200).json({
      retried: bookings.length,
      succeeded,
      failed,
    });
  } catch (err) {
    console.error('[retry-emails] Unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
