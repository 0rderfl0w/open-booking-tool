/**
 * Google Calendar operations: create/delete/fetch events + circuit breaker.
 * Server-side only — never import from React/frontend code.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshAccessToken, googleFetch } from './google';
import type { Booking, SessionType, Practitioner } from '../types/database';

// ─── Circuit breaker thresholds ───────────────────────────────────────────────

const CB_MAX_FAILURES = 5;
const CB_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ─── Access token management ──────────────────────────────────────────────────

/**
 * Get a fresh access token for the practitioner.
 * Reads the stored refresh token, calls Google to get a new access token,
 * and updates the expiry timestamp in the database.
 *
 * Throws if no refresh token is configured.
 */
export async function getAccessToken(
  practitionerId: string,
  supabase: SupabaseClient,
): Promise<string> {
  const { data: creds, error } = await supabase
    .from('practitioner_credentials')
    .select('google_refresh_token, google_token_expiry')
    .eq('practitioner_id', practitionerId)
    .single();

  if (error || !creds) {
    throw new Error(`[GoogleCalendar] No credentials found for practitioner ${practitionerId}`);
  }

  const refreshToken = (creds as { google_refresh_token: string | null }).google_refresh_token;
  if (!refreshToken) {
    throw new Error(`[GoogleCalendar] No refresh token for practitioner ${practitionerId}`);
  }

  const { access_token, expires_in } = await refreshAccessToken(refreshToken);

  // Update expiry record (best-effort, don't block on failure)
  const expiry = new Date(Date.now() + expires_in * 1000).toISOString();
  await supabase
    .from('practitioner_credentials')
    .update({ google_token_expiry: expiry })
    .eq('practitioner_id', practitionerId);

  return access_token;
}

// ─── Create event ─────────────────────────────────────────────────────────────

/**
 * Create a Google Calendar event for a confirmed booking.
 * Saves the google_event_id back to the booking record.
 * Errors are caught and handled via the circuit breaker — never throw to caller.
 */
export async function createCalendarEvent(
  practitionerId: string,
  booking: Booking,
  sessionType: SessionType,
  practitioner: Practitioner,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const accessToken = await getAccessToken(practitionerId, supabase);

    // Resolve which calendar to use
    const { data: creds } = await supabase
      .from('practitioner_credentials')
      .select('google_calendar_id')
      .eq('practitioner_id', practitionerId)
      .single();

    const calendarId = (creds as { google_calendar_id: string } | null)?.google_calendar_id ?? 'primary';

    const event = {
      summary: `${sessionType.name} — ${booking.guest_name}`,
      description: [
        `Session type: ${sessionType.name}`,
        sessionType.description ? `Description: ${sessionType.description}` : null,
        `Guest: ${booking.guest_name} <${booking.guest_email}>`,
        booking.notes ? `Notes: ${booking.notes}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      start: {
        dateTime: booking.starts_at,
        timeZone: practitioner.timezone,
      },
      end: {
        dateTime: booking.ends_at,
        timeZone: practitioner.timezone,
      },
      attendees: [{ email: booking.guest_email, displayName: booking.guest_name }],
    };

    const response = await googleFetch(
      accessToken,
      'POST',
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      event,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Calendar event creation failed (${response.status}): ${text}`);
    }

    const created = await response.json() as { id: string };

    // Save the event ID back to the booking
    await supabase
      .from('bookings')
      .update({ google_event_id: created.id })
      .eq('id', booking.id);

    // Reset circuit breaker on success
    await supabase
      .from('practitioner_credentials')
      .update({ google_cb_failures: 0, google_cb_first_failure_at: null })
      .eq('practitioner_id', practitionerId);
  } catch (err) {
    console.error('[GoogleCalendar] createCalendarEvent error:', err);
    await handleGoogleError(err, practitionerId, supabase);
  }
}

// ─── Delete event ─────────────────────────────────────────────────────────────

/**
 * Delete a Google Calendar event when a booking is cancelled.
 * 404 responses (already deleted) are silently ignored.
 * Errors are caught and handled via the circuit breaker — never throw to caller.
 */
export async function deleteCalendarEvent(
  practitionerId: string,
  googleEventId: string,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const accessToken = await getAccessToken(practitionerId, supabase);

    const { data: creds } = await supabase
      .from('practitioner_credentials')
      .select('google_calendar_id')
      .eq('practitioner_id', practitionerId)
      .single();

    const calendarId = (creds as { google_calendar_id: string } | null)?.google_calendar_id ?? 'primary';

    const response = await googleFetch(
      accessToken,
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(googleEventId)}`,
    );

    if (response.status === 404 || response.status === 410) {
      // Already deleted — idempotent
      return;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Calendar event deletion failed (${response.status}): ${text}`);
    }

    // Reset circuit breaker on success
    await supabase
      .from('practitioner_credentials')
      .update({ google_cb_failures: 0, google_cb_first_failure_at: null })
      .eq('practitioner_id', practitionerId);
  } catch (err) {
    console.error('[GoogleCalendar] deleteCalendarEvent error:', err);
    await handleGoogleError(err, practitionerId, supabase);
  }
}

// ─── Fetch events (for conflict checking) ────────────────────────────────────

export interface GoogleCalendarEvent {
  id: string;
  summary?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  status?: string;
}

/**
 * Fetch Google Calendar events within a time range for conflict checking.
 * Returns an empty array on error (graceful degradation).
 */
export async function fetchCalendarEvents(
  practitionerId: string,
  timeMin: string,
  timeMax: string,
  supabase: SupabaseClient,
): Promise<GoogleCalendarEvent[]> {
  try {
    const accessToken = await getAccessToken(practitionerId, supabase);

    const { data: creds } = await supabase
      .from('practitioner_credentials')
      .select('google_calendar_id')
      .eq('practitioner_id', practitionerId)
      .single();

    const calendarId = (creds as { google_calendar_id: string } | null)?.google_calendar_id ?? 'primary';

    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const response = await googleFetch(
      accessToken,
      'GET',
      `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Calendar events fetch failed (${response.status}): ${text}`);
    }

    const data = await response.json() as { items?: GoogleCalendarEvent[] };

    // Reset circuit breaker on success
    await supabase
      .from('practitioner_credentials')
      .update({ google_cb_failures: 0, google_cb_first_failure_at: null })
      .eq('practitioner_id', practitionerId);

    return data.items ?? [];
  } catch (err) {
    console.warn('[GoogleCalendar] fetchCalendarEvents error — degrading gracefully:', err);
    await handleGoogleError(err, practitionerId, supabase);
    return [];
  }
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

/**
 * Track Google API failures. After CB_MAX_FAILURES in CB_WINDOW_MS,
 * disable the integration by setting google_calendar_connected = false.
 */
export async function handleGoogleError(
  _err: unknown,
  practitionerId: string,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const { data: creds } = await supabase
      .from('practitioner_credentials')
      .select('google_cb_failures, google_cb_first_failure_at')
      .eq('practitioner_id', practitionerId)
      .single();

    if (!creds) return;

    const now = Date.now();
    const cbCreds = creds as { google_cb_failures: number; google_cb_first_failure_at: string | null };
    const firstFailureAt = cbCreds.google_cb_first_failure_at
      ? new Date(cbCreds.google_cb_first_failure_at).getTime()
      : null;

    // Reset window if first failure was more than CB_WINDOW_MS ago
    const withinWindow = firstFailureAt && now - firstFailureAt < CB_WINDOW_MS;
    const newFailures = withinWindow ? cbCreds.google_cb_failures + 1 : 1;
    const newFirstFailureAt = withinWindow
      ? cbCreds.google_cb_first_failure_at
      : new Date(now).toISOString();

    await supabase
      .from('practitioner_credentials')
      .update({
        google_cb_failures: newFailures,
        google_cb_first_failure_at: newFirstFailureAt,
      })
      .eq('practitioner_id', practitionerId);

    // Trip the circuit breaker
    if (newFailures >= CB_MAX_FAILURES) {
      console.warn(
        `[GoogleCalendar] Circuit breaker tripped for practitioner ${practitionerId} ` +
          `after ${newFailures} failures. Disabling Google Calendar integration.`,
      );
      await supabase
        .from('practitioners')
        .update({ google_calendar_connected: false })
        .eq('id', practitionerId);
    }
  } catch (cbErr) {
    // Don't throw from error handler
    console.error('[GoogleCalendar] handleGoogleError itself failed:', cbErr);
  }
}
