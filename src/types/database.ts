/**
 * Database types matching the Supabase schema.
 * These types represent the raw database rows.
 */

export interface Practitioner {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  email: string;
  bio: string | null;
  photo_url: string | null;
  timezone: string;
  is_active: boolean;
  google_calendar_connected: boolean;
  email_reminders_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Public view — excludes sensitive fields like email */
export interface PublicPractitioner {
  id: string;
  username: string;
  display_name: string;
  bio: string | null;
  photo_url: string | null;
  timezone: string;
  is_active: boolean;
  google_calendar_connected: boolean;
}

export interface PractitionerCredentials {
  id: string;
  practitioner_id: string;
  /** Vault UUID for the refresh token (production Supabase Vault approach). */
  google_refresh_token_vault_id: string | null;
  /** Direct refresh token storage (simpler for self-hosted; see migration 003). */
  google_refresh_token: string | null;
  google_token_expiry: string | null;
  google_calendar_id: string;
  google_cb_failures: number;
  google_cb_first_failure_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionType {
  id: string;
  practitioner_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_advance_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Availability {
  id: string;
  practitioner_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  start_time: string; // TIME format HH:MM:SS
  end_time: string;
  is_active: boolean;
}

export interface DateOverride {
  id: string;
  practitioner_id: string;
  date: string; // YYYY-MM-DD
  is_blocked: boolean;
  start_time: string | null;
  end_time: string | null;
  updated_at: string;
}

export type BookingStatus = 'confirmed' | 'cancelled' | 'completed' | 'no_show';

export interface Booking {
  id: string;
  booking_token: string;
  session_type_id: string;
  practitioner_id: string;
  guest_name: string;
  guest_email: string;
  guest_timezone: string | null;
  starts_at: string; // TIMESTAMPTZ
  ends_at: string;
  buffer_minutes: number;
  status: BookingStatus;
  notes: string | null;
  google_event_id: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  confirmation_email_sent_at: string | null;
  reminder_sent_at: string | null;
  email_retry_count: number;
  created_at: string;
  updated_at: string;
}
