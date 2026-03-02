-- Migration: Add Apple Calendar (CalDAV) support
-- Mirrors the Google Calendar pattern from 003_google_calendar.sql

-- Practitioners table: connection flag
ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS apple_calendar_connected BOOLEAN DEFAULT false;

-- Practitioner credentials: Apple CalDAV fields
ALTER TABLE practitioner_credentials
  ADD COLUMN IF NOT EXISTS apple_caldav_username TEXT,
  ADD COLUMN IF NOT EXISTS apple_caldav_password TEXT,
  ADD COLUMN IF NOT EXISTS apple_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS apple_caldav_server_url TEXT,
  ADD COLUMN IF NOT EXISTS apple_calendars_json TEXT,
  ADD COLUMN IF NOT EXISTS apple_cb_failures INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS apple_cb_first_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS apple_last_auth_error_at TIMESTAMPTZ;

-- Bookings table: Apple event UID
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS apple_event_id TEXT;

-- Update public_practitioners view to include apple_calendar_connected
CREATE OR REPLACE VIEW public_practitioners AS
  SELECT id, username, display_name, bio, photo_url, timezone, is_active,
         google_calendar_connected, apple_calendar_connected
  FROM practitioners;

-- Re-grant permissions on the recreated view
GRANT SELECT ON public_practitioners TO anon;
GRANT SELECT ON public_practitioners TO authenticated;
