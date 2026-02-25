-- Migration: 002_email_reminders
-- Adds email reminders support, email retry tracking

-- Add email reminders toggle to practitioners
ALTER TABLE practitioners
  ADD COLUMN email_reminders_enabled BOOLEAN DEFAULT false;

-- Add email retry counter to bookings
ALTER TABLE bookings
  ADD COLUMN email_retry_count INT DEFAULT 0;

-- NOTE: pg_cron setup (run manually in Supabase dashboard)
-- Requires pg_cron + pg_net extensions. Enable both in the Supabase dashboard
-- under Database → Extensions before running these.
--
-- These cron jobs call the Vercel API endpoints on a schedule.
-- Replace {APP_URL} and {CRON_SECRET} with your actual values.
--
-- SELECT cron.schedule(
--   'send-reminders',
--   '0 * * * *',
--   $$
--     SELECT net.http_post(
--       url := '{APP_URL}/api/send-reminders',
--       headers := '{"Authorization": "Bearer {CRON_SECRET}", "Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb
--     )
--   $$
-- );
--
-- SELECT cron.schedule(
--   'retry-emails',
--   '*/15 * * * *',
--   $$
--     SELECT net.http_post(
--       url := '{APP_URL}/api/retry-emails',
--       headers := '{"Authorization": "Bearer {CRON_SECRET}", "Content-Type": "application/json"}'::jsonb,
--       body := '{}'::jsonb
--     )
--   $$
-- );
