import { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendReminderEmail, sendDailyDigestEmail } from '../src/lib/email';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

/** Daily email volume thresholds */
const VOLUME_WARN_THRESHOLD = 75;
const VOLUME_SKIP_DIGEST_THRESHOLD = 90;

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
  const window24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const window25h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  try {
    // --- Volume check ---
    const { count: emailsSentToday, error: volumeError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .not('reminder_sent_at', 'is', null)
      .gte('reminder_sent_at', todayStart.toISOString());

    if (volumeError) {
      console.error('[send-reminders] Volume check error:', volumeError);
    }

    const todayVolume = emailsSentToday ?? 0;

    if (todayVolume >= VOLUME_WARN_THRESHOLD) {
      console.warn(`[send-reminders] Email volume at ${todayVolume} today — approaching daily limit`);
    }

    // --- Query bookings needing reminders ---
    const { data: bookings, error: queryError } = await supabase
      .from('bookings')
      .select(`
        *,
        session_types!inner(*),
        practitioners!inner(*)
      `)
      .eq('status', 'confirmed')
      .is('reminder_sent_at', null)
      .gte('starts_at', window24h.toISOString())
      .lte('starts_at', window25h.toISOString())
      .eq('practitioners.email_reminders_enabled', true);

    if (queryError) {
      console.error('[send-reminders] Query error:', queryError);
      return res.status(500).json({ error: 'Database query failed' });
    }

    if (!bookings || bookings.length === 0) {
      return res.status(200).json({ sent: 0, digests: 0, message: 'No reminders to send' });
    }

    let remindersSent = 0;
    let remindersSkipped = 0;
    const bookingsForDigest: typeof bookings = [];

    // --- Send guest reminder emails ---
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
        await sendReminderEmail(booking.guest_email, { booking, sessionType, practitioner });

        await supabase
          .from('bookings')
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq('id', booking.id);

        remindersSent++;
        bookingsForDigest.push(row);
      } catch (err) {
        console.error(`[send-reminders] Failed for booking ${booking.id}:`, err);
        remindersSkipped++;
      }
    }

    // --- Build and send practitioner digests ---
    let digestsSent = 0;

    if (todayVolume + remindersSent >= VOLUME_SKIP_DIGEST_THRESHOLD) {
      console.warn('[send-reminders] Volume threshold reached — skipping practitioner digests');
    } else {
      // Group successful bookings by practitioner
      const byPractitioner = new Map<string, typeof bookings>();

      for (const row of bookingsForDigest) {
        const practitionerId = row.practitioner_id;
        if (!byPractitioner.has(practitionerId)) {
          byPractitioner.set(practitionerId, []);
        }
        byPractitioner.get(practitionerId)!.push(row);
      }

      // Tomorrow's date string (YYYY-MM-DD) for the digest
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const tomorrowDate = tomorrow.toISOString().split('T')[0] ?? '';

      for (const [, practitionerBookings] of byPractitioner) {
        const practitioner = practitionerBookings[0].practitioners;
        const digestBookings = practitionerBookings.map((row) => ({
          ...{
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
          },
          sessionType: row.session_types,
        }));

        try {
          await sendDailyDigestEmail(practitioner.email, {
            practitioner,
            bookings: digestBookings,
            date: tomorrowDate,
          });
          digestsSent++;
        } catch (err) {
          console.error(`[send-reminders] Digest failed for practitioner ${practitioner.id}:`, err);
        }
      }
    }

    return res.status(200).json({
      sent: remindersSent,
      skipped: remindersSkipped,
      digests: digestsSent,
      volumeToday: todayVolume + remindersSent,
    });
  } catch (err) {
    console.error('[send-reminders] Unexpected error:', err);
    return res.status(500).json({ error: 'Unexpected error' });
  }
}
