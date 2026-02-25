-- ============================================================================
-- Open Booking Tool — Initial Schema
-- Phase 1: Core Booking MVP
-- ============================================================================

-- Required for exclusion constraint with UUID columns.
-- ⚠️ DEPLOYMENT: Enable btree_gist in Supabase Dashboard → Database → Extensions
-- BEFORE running this migration. Or run this line in the SQL Editor:
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- Tables
-- ============================================================================

-- The practitioner (one per deployment, but cleanly scoped)
CREATE TABLE practitioners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  username TEXT UNIQUE NOT NULL CHECK (username ~ '^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$'),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  bio TEXT,
  photo_url TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  is_active BOOLEAN DEFAULT true,
  google_calendar_connected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Separate table for OAuth credentials (owner-only RLS, never public)
CREATE TABLE practitioner_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES practitioners(id) ON DELETE CASCADE UNIQUE NOT NULL,
  google_refresh_token_vault_id UUID,
  google_token_expiry TIMESTAMPTZ,
  google_calendar_id TEXT DEFAULT 'primary',
  google_cb_failures INT DEFAULT 0,
  google_cb_first_failure_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Session types (e.g., "Free Discovery Call", "1-Hour Strategy Session")
CREATE TABLE session_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES practitioners(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INT NOT NULL DEFAULT 30 CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  buffer_minutes INT NOT NULL DEFAULT 15 CHECK (buffer_minutes >= 0 AND buffer_minutes <= 120),
  min_notice_hours INT NOT NULL DEFAULT 2 CHECK (min_notice_hours >= 0 AND min_notice_hours <= 8760),
  max_advance_days INT NOT NULL DEFAULT 30 CHECK (max_advance_days > 0 AND max_advance_days <= 365),
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Weekly recurring availability
CREATE TABLE availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES practitioners(id) ON DELETE CASCADE NOT NULL,
  day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_active BOOLEAN DEFAULT true,
  CHECK (start_time < end_time)
);

-- Specific date overrides (block a day, or replace hours)
CREATE TABLE date_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  practitioner_id UUID REFERENCES practitioners(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  is_blocked BOOLEAN NOT NULL DEFAULT false,
  start_time TIME,
  end_time TIME,
  CHECK (is_blocked = true OR (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < end_time)),
  CHECK (NOT (is_blocked = true AND (start_time IS NOT NULL OR end_time IS NOT NULL))),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Actual bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_token TEXT UNIQUE NOT NULL,
  session_type_id UUID REFERENCES session_types(id) ON DELETE RESTRICT NOT NULL,
  practitioner_id UUID REFERENCES practitioners(id) ON DELETE CASCADE NOT NULL,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_timezone TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  buffer_minutes INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'cancelled', 'completed', 'no_show')),
  notes TEXT,
  google_event_id TEXT,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,
  confirmation_email_sent_at TIMESTAMPTZ,
  reminder_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CHECK (starts_at < ends_at)
);

-- ============================================================================
-- Auto-update Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_practitioners_updated BEFORE UPDATE ON practitioners FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_credentials_updated BEFORE UPDATE ON practitioner_credentials FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_session_types_updated BEFORE UPDATE ON session_types FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_date_overrides_updated BEFORE UPDATE ON date_overrides FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_bookings_updated BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- Email Sync Trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_practitioner_email()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE practitioners SET email = NEW.email WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE TRIGGER trg_sync_email
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_practitioner_email();

-- ============================================================================
-- Double-Booking Prevention
-- ============================================================================

-- Prevents any overlapping confirmed bookings for the same practitioner
-- Uses starts_at/ends_at range only (buffer is enforced at application level in slot calculation)
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    practitioner_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&
  )
  WHERE (status != 'cancelled');

-- Fast point lookup for slot calculation
CREATE UNIQUE INDEX idx_bookings_no_double_book
  ON bookings(practitioner_id, starts_at)
  WHERE status != 'cancelled';

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE UNIQUE INDEX idx_practitioners_username ON practitioners(username);

CREATE INDEX idx_bookings_practitioner_status
  ON bookings(practitioner_id, starts_at, status)
  WHERE status != 'cancelled';

CREATE INDEX idx_bookings_guest_email ON bookings(guest_email);

CREATE UNIQUE INDEX idx_bookings_token ON bookings(booking_token);

CREATE INDEX idx_availability_practitioner_day
  ON availability(practitioner_id, day_of_week);

CREATE INDEX idx_date_overrides_practitioner_date
  ON date_overrides(practitioner_id, date);

CREATE INDEX idx_session_types_practitioner_active
  ON session_types(practitioner_id, is_active);

-- ============================================================================
-- Public View (excludes sensitive fields)
-- ============================================================================

CREATE VIEW public_practitioners AS
  SELECT id, username, display_name, bio, photo_url, timezone, is_active,
         google_calendar_connected
  FROM practitioners;

GRANT SELECT ON public_practitioners TO anon;
GRANT SELECT ON public_practitioners TO authenticated;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE practitioners ENABLE ROW LEVEL SECURITY;
ALTER TABLE practitioner_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE date_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- Revoke direct anon access to practitioners (use public_practitioners view)
REVOKE ALL ON practitioners FROM anon;

-- Practitioners: owner read/write
CREATE POLICY practitioners_owner_select ON practitioners
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY practitioners_owner_update ON practitioners
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY practitioners_owner_insert ON practitioners
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Practitioner credentials: authenticated owner only, NO public access
CREATE POLICY credentials_owner_all ON practitioner_credentials
  FOR ALL TO authenticated
  USING (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()))
  WITH CHECK (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));

-- Session types: owner CRUD, public read active
CREATE POLICY session_types_owner_all ON session_types
  FOR ALL TO authenticated
  USING (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()))
  WITH CHECK (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));

CREATE POLICY session_types_public_read ON session_types
  FOR SELECT TO anon
  USING (is_active = true);

-- Availability: owner CRUD, public read active
CREATE POLICY availability_owner_all ON availability
  FOR ALL TO authenticated
  USING (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()))
  WITH CHECK (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));

CREATE POLICY availability_public_read ON availability
  FOR SELECT TO anon
  USING (is_active = true);

-- Date overrides: owner CRUD, public read
CREATE POLICY date_overrides_owner_all ON date_overrides
  FOR ALL TO authenticated
  USING (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()))
  WITH CHECK (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));

CREATE POLICY date_overrides_public_read ON date_overrides
  FOR SELECT TO anon
  USING (true);

-- Bookings: owner read all own (INSERT/UPDATE done via service role)
CREATE POLICY bookings_owner_read ON bookings
  FOR SELECT TO authenticated
  USING (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));

-- Bookings: owner can update own (for practitioner-initiated cancellation)
CREATE POLICY bookings_owner_update ON bookings
  FOR UPDATE TO authenticated
  USING (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()))
  WITH CHECK (practitioner_id IN (SELECT id FROM practitioners WHERE user_id = auth.uid()));
