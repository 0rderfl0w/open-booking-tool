/**
 * API request/response types for all endpoints.
 * Shared between frontend and API routes.
 */

// ─── Standard Error Response ─────────────────────────────────────────────────

export type ErrorCode =
  | 'SLOT_TAKEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
  };
}

// ─── GET /api/slots ──────────────────────────────────────────────────────────

export interface SlotsQuery {
  username: string;
  session_type_id: string;
  date: string; // YYYY-MM-DD
  timezone?: string; // visitor's IANA timezone
}

export type SlotState =
  | 'available'
  | 'no_availability'
  | 'fully_booked'
  | 'blocked'
  | 'misconfigured';

export interface Slot {
  starts_at: string; // ISO8601 UTC
  ends_at: string;
}

export interface SlotsResponse {
  slots: Slot[];
  state: SlotState;
  timezone: string;
  date: string;
}

// ─── POST /api/book ──────────────────────────────────────────────────────────

export interface BookRequest {
  username: string;
  session_type_id: string;
  starts_at: string; // ISO8601 UTC with Z suffix
  guest_name: string;
  guest_email: string;
  guest_timezone: string;
  notes?: string;
  turnstile_token: string;
}

export interface BookResponse {
  booking_token: string;
  booking_url: string;
  starts_at: string;
  ends_at: string;
}

// ─── POST /api/cancel ────────────────────────────────────────────────────────

export interface CancelRequest {
  booking_token: string;
  reason?: string;
}

export interface CancelResponse {
  status: 'cancelled';
  cancelled_at: string;
}

// ─── GET /api/health ─────────────────────────────────────────────────────────

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// ─── Booking Confirmation Page ───────────────────────────────────────────────

export interface BookingDetails {
  booking_token: string;
  guest_name: string;
  guest_email: string;
  guest_timezone: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  session_type: {
    name: string;
    description: string | null;
    duration_minutes: number;
  };
  practitioner: {
    username: string;
    display_name: string;
    photo_url: string | null;
    timezone: string;
  };
}
