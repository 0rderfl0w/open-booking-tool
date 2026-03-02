/**
 * Apple Calendar (CalDAV/iCloud) operations: create/delete/fetch events + circuit breaker.
 * Server-side only — never import from React/frontend code.
 *
 * Uses CalDAV protocol via tsdav library (same approach as Cal.com).
 * Auth: Apple ID + app-specific password (Basic Auth, no OAuth).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { createDAVClient, type DAVCalendar, type DAVObject } from 'tsdav';
import type { Booking, SessionType, Practitioner } from '../types/database';

// ─── Circuit breaker thresholds ───────────────────────────────────────────────

const CB_MAX_FAILURES = 5;
const CB_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const REQUEST_TIMEOUT_MS = 4000; // 4 seconds per CalDAV call
const MAX_CALENDARS = 10;

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppleCredentials {
  apple_caldav_username: string;
  apple_caldav_password: string;
  apple_calendar_id: string | null;
  apple_caldav_server_url: string | null;
  apple_calendars_json: string | null;
}

interface BusyPeriod {
  start: string;
  end: string;
}

// ─── CalDAV Client ────────────────────────────────────────────────────────────

/**
 * Create an authenticated CalDAV client for iCloud.
 * Uses cached shard URL if available, falls back to discovery.
 */
async function createAppleClient(credentials: AppleCredentials) {
  const serverUrl = credentials.apple_caldav_server_url || 'https://caldav.icloud.com';

  return createDAVClient({
    serverUrl,
    credentials: {
      username: credentials.apple_caldav_username,
      password: credentials.apple_caldav_password,
    },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
}

// ─── Fetch busy periods (for conflict checking) ──────────────────────────────

/**
 * Fetch busy periods from Apple Calendar using CalDAV.
 * Queries all calendars, fetches events in time range (server-side RRULE expansion),
 * and returns merged busy periods.
 *
 * Returns empty array on error (graceful degradation).
 * Uses AbortController with 4s timeout to prevent blocking slot calculation.
 */
export async function fetchAppleBusyPeriods(
  practitionerId: string,
  timeMin: string,
  timeMax: string,
  supabase: SupabaseClient,
): Promise<BusyPeriod[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const credentials = await getAppleCredentials(practitionerId, supabase);
    if (!credentials) return [];

    const client = await createAppleClient(credentials);

    // Use cached calendars if available, otherwise fetch
    let calendars: DAVCalendar[];
    if (credentials.apple_calendars_json) {
      try {
        calendars = JSON.parse(credentials.apple_calendars_json);
      } catch {
        calendars = await client.fetchCalendars();
      }
    } else {
      calendars = await client.fetchCalendars();
    }

    // Guard against unbounded calendar enumeration
    const calendarSlice = calendars.slice(0, MAX_CALENDARS);

    // Fetch events from all calendars with server-side time-range expansion
    // This handles recurring events (RRULE) — iCloud expands them server-side
    const allBusy: BusyPeriod[] = [];

    for (const calendar of calendarSlice) {
      if (controller.signal.aborted) break;

      try {
        const objects = await client.fetchCalendarObjects({
          calendar,
          timeRange: {
            start: timeMin,
            end: timeMax,
          },
        });

        for (const obj of objects) {
          const periods = parseVEventBusyPeriods(obj);
          allBusy.push(...periods);
        }
      } catch (calErr) {
        // Skip individual calendar failures, continue with others
        console.warn(`[AppleCalendar] Failed to fetch calendar "${calendar.displayName}":`, calErr);
      }
    }

    // Reset circuit breaker on success
    await resetAppleCircuitBreaker(practitionerId, supabase);

    return allBusy;
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[AppleCalendar] Timeout — degrading gracefully');
    } else {
      console.warn('[AppleCalendar] fetchAppleBusyPeriods error — degrading gracefully:', err);
      await handleAppleError(err, practitionerId, supabase);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Parse VEVENT data ────────────────────────────────────────────────────────

/**
 * Parse a CalDAV object's ICS data to extract busy periods.
 * Handles VEVENT DTSTART/DTEND extraction.
 */
function parseVEventBusyPeriods(obj: DAVObject): BusyPeriod[] {
  const periods: BusyPeriod[] = [];

  if (!obj.data) return periods;

  const icsData = typeof obj.data === 'string' ? obj.data : '';
  if (!icsData) return periods;

  // Simple ICS parser for VEVENT DTSTART/DTEND
  // Since we use server-side time-range expansion, each object is a single occurrence
  const lines = icsData.split(/\r?\n/);
  let inEvent = false;
  let dtstart: string | null = null;
  let dtend: string | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      dtstart = null;
      dtend = null;
    } else if (line === 'END:VEVENT') {
      if (inEvent && dtstart) {
        const start = parseICSDateTime(dtstart);
        const end = dtend ? parseICSDateTime(dtend) : start;
        if (start && end) {
          periods.push({ start, end });
        }
      }
      inEvent = false;
    } else if (inEvent) {
      if (line.startsWith('DTSTART')) {
        dtstart = line.split(':').pop() || null;
      } else if (line.startsWith('DTEND')) {
        dtend = line.split(':').pop() || null;
      }
    }
  }

  return periods;
}

/**
 * Parse an ICS date-time string to ISO 8601.
 * Handles: 20260228T150000Z (UTC) and 20260228T150000 (floating/local).
 */
function parseICSDateTime(icsDate: string): string | null {
  if (!icsDate || icsDate.length < 8) return null;

  // Remove any parameters before the value
  const value = icsDate.includes(';') ? icsDate.split(';').pop()! : icsDate;

  const cleaned = value.replace(/[^0-9TZ]/g, '');

  // Format: YYYYMMDD or YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  if (cleaned.length >= 15) {
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6);
    const day = cleaned.substring(6, 8);
    const hour = cleaned.substring(9, 11);
    const min = cleaned.substring(11, 13);
    const sec = cleaned.substring(13, 15);
    const isUtc = cleaned.endsWith('Z');
    return `${year}-${month}-${day}T${hour}:${min}:${sec}${isUtc ? 'Z' : 'Z'}`; // Treat floating as UTC for safety
  }

  // Date-only (all-day events): YYYYMMDD
  if (cleaned.length >= 8) {
    const year = cleaned.substring(0, 4);
    const month = cleaned.substring(4, 6);
    const day = cleaned.substring(6, 8);
    return `${year}-${month}-${day}T00:00:00Z`;
  }

  return null;
}

// ─── Create event ─────────────────────────────────────────────────────────────

/**
 * Create an Apple Calendar event for a confirmed booking.
 * Saves the apple_event_id back to the booking record.
 * Errors are caught and handled via the circuit breaker — never throw to caller.
 */
export async function createAppleCalendarEvent(
  practitionerId: string,
  booking: Booking,
  sessionType: SessionType,
  _practitioner: Practitioner,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const credentials = await getAppleCredentials(practitionerId, supabase);
    if (!credentials || !credentials.apple_calendar_id) return;

    const client = await createAppleClient(credentials);

    // Build ICS VEVENT
    const uid = crypto.randomUUID();
    const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const startICS = new Date(booking.starts_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const endICS = new Date(booking.ends_at).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

    const description = [
      `Session type: ${sessionType.name}`,
      sessionType.description ? `Description: ${sessionType.description}` : null,
      `Guest: ${booking.guest_name} <${booking.guest_email}>`,
      booking.notes ? `Notes: ${booking.notes}` : null,
    ].filter(Boolean).join('\\n');

    const icsData = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//OpenBookingTool//EN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${now}`,
      `DTSTART:${startICS}`,
      `DTEND:${endICS}`,
      `SUMMARY:${sessionType.name} — ${booking.guest_name}`,
      `DESCRIPTION:${description}`,
      `ATTENDEE;CN=${booking.guest_name}:mailto:${booking.guest_email}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    // Find the target calendar
    const calendars = await client.fetchCalendars();
    const targetCalendar = calendars.find(c => c.url === credentials.apple_calendar_id);

    if (!targetCalendar) {
      throw new Error(`[AppleCalendar] Target calendar not found: ${credentials.apple_calendar_id}`);
    }

    await client.createCalendarObject({
      calendar: targetCalendar,
      filename: `${uid}.ics`,
      iCalString: icsData,
    });

    // Save the event UID back to the booking
    await supabase
      .from('bookings')
      .update({ apple_event_id: uid })
      .eq('id', booking.id);

    // Reset circuit breaker on success
    await resetAppleCircuitBreaker(practitionerId, supabase);
  } catch (err) {
    console.error('[AppleCalendar] createAppleCalendarEvent error:', err);
    await handleAppleError(err, practitionerId, supabase);
  }
}

// ─── Delete event ─────────────────────────────────────────────────────────────

/**
 * Delete an Apple Calendar event when a booking is cancelled.
 * Errors are caught and handled via the circuit breaker — never throw to caller.
 */
export async function deleteAppleCalendarEvent(
  practitionerId: string,
  appleEventId: string,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const credentials = await getAppleCredentials(practitionerId, supabase);
    if (!credentials || !credentials.apple_calendar_id) return;

    const client = await createAppleClient(credentials);

    // Find the target calendar
    const calendars = await client.fetchCalendars();
    const targetCalendar = calendars.find(c => c.url === credentials.apple_calendar_id);

    if (!targetCalendar) return;

    // Fetch objects to find the one with matching UID
    const objects = await client.fetchCalendarObjects({ calendar: targetCalendar });
    const targetObj = objects.find(obj => {
      if (!obj.data || typeof obj.data !== 'string') return false;
      return obj.data.includes(`UID:${appleEventId}`);
    });

    if (!targetObj) {
      // Already deleted — idempotent
      return;
    }

    await client.deleteCalendarObject({
      calendarObject: targetObj,
    });

    // Reset circuit breaker on success
    await resetAppleCircuitBreaker(practitionerId, supabase);
  } catch (err) {
    console.error('[AppleCalendar] deleteAppleCalendarEvent error:', err);
    await handleAppleError(err, practitionerId, supabase);
  }
}

// ─── Test connection ──────────────────────────────────────────────────────────

/**
 * Test Apple Calendar connection and discover shard URL + calendars.
 * Used during the settings connect flow.
 * Returns calendar list on success, or error details on failure.
 */
export async function testAppleConnection(
  username: string,
  password: string,
): Promise<{ success: true; serverUrl: string; calendars: Array<{ url: string; displayName: string }> } | { success: false; error: string }> {
  try {
    const client = await createDAVClient({
      serverUrl: 'https://caldav.icloud.com',
      credentials: { username, password },
      authMethod: 'Basic',
      defaultAccountType: 'caldav',
    });

    const calendars = await client.fetchCalendars();

    // Extract the resolved server URL (shard-specific)
    // tsdav stores the account info after connection
    const serverUrl = (client as unknown as { account?: { serverUrl?: string } }).account?.serverUrl || 'https://caldav.icloud.com';

    return {
      success: true,
      serverUrl,
      calendars: calendars.map(c => ({
        url: c.url,
        displayName: (typeof c.displayName === 'string' ? c.displayName : String(c.displayName || '')) || 'Unnamed Calendar',
      })),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    // Check for auth failure
    if (message.includes('401') || message.includes('Unauthorized') || message.includes('auth')) {
      return { success: false, error: 'Invalid Apple ID or app-specific password. Make sure you generated an app-specific password at appleid.apple.com.' };
    }

    return { success: false, error: `Connection failed: ${message}` };
  }
}

// ─── Credential helpers ───────────────────────────────────────────────────────

/**
 * Fetch Apple CalDAV credentials for a practitioner.
 * Returns null if not configured.
 */
async function getAppleCredentials(
  practitionerId: string,
  supabase: SupabaseClient,
): Promise<AppleCredentials | null> {
  const { data: creds, error } = await supabase
    .from('practitioner_credentials')
    .select('apple_caldav_username, apple_caldav_password, apple_calendar_id, apple_caldav_server_url, apple_calendars_json')
    .eq('practitioner_id', practitionerId)
    .single();

  if (error || !creds) return null;

  const appleCreds = creds as unknown as AppleCredentials;
  if (!appleCreds.apple_caldav_username || !appleCreds.apple_caldav_password) return null;

  return appleCreds;
}

// ─── Circuit breaker ──────────────────────────────────────────────────────────

/**
 * Reset circuit breaker counters on successful CalDAV operation.
 */
async function resetAppleCircuitBreaker(
  practitionerId: string,
  supabase: SupabaseClient,
): Promise<void> {
  await supabase
    .from('practitioner_credentials')
    .update({ apple_cb_failures: 0, apple_cb_first_failure_at: null })
    .eq('practitioner_id', practitionerId);
}

/**
 * Handle Apple CalDAV errors with HTTP status-specific logic.
 * - 401: Immediate disconnect (credentials revoked/changed)
 * - 429: Rate limited, don't count toward CB
 * - 5xx/timeout: Count toward circuit breaker
 */
export async function handleAppleError(
  err: unknown,
  practitionerId: string,
  supabase: SupabaseClient,
): Promise<void> {
  try {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // 401 — credentials revoked or Apple ID password changed
    // Immediately disconnect, do NOT count toward circuit breaker
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      console.warn(`[AppleCalendar] Auth failure for practitioner ${practitionerId} — disconnecting`);
      await supabase
        .from('practitioners')
        .update({ apple_calendar_connected: false })
        .eq('id', practitionerId);
      await supabase
        .from('practitioner_credentials')
        .update({ apple_last_auth_error_at: new Date().toISOString() })
        .eq('practitioner_id', practitionerId);
      return;
    }

    // 429 — rate limited, don't count toward CB
    if (errorMessage.includes('429') || errorMessage.includes('Rate')) {
      console.warn(`[AppleCalendar] Rate limited for practitioner ${practitionerId}`);
      return;
    }

    // All other errors: circuit breaker
    const { data: creds } = await supabase
      .from('practitioner_credentials')
      .select('apple_cb_failures, apple_cb_first_failure_at')
      .eq('practitioner_id', practitionerId)
      .single();

    if (!creds) return;

    const now = Date.now();
    const cbCreds = creds as unknown as { apple_cb_failures: number; apple_cb_first_failure_at: string | null };
    const firstFailureAt = cbCreds.apple_cb_first_failure_at
      ? new Date(cbCreds.apple_cb_first_failure_at).getTime()
      : null;

    const withinWindow = firstFailureAt && now - firstFailureAt < CB_WINDOW_MS;
    const newFailures = withinWindow ? cbCreds.apple_cb_failures + 1 : 1;
    const newFirstFailureAt = withinWindow
      ? cbCreds.apple_cb_first_failure_at
      : new Date(now).toISOString();

    await supabase
      .from('practitioner_credentials')
      .update({
        apple_cb_failures: newFailures,
        apple_cb_first_failure_at: newFirstFailureAt,
      })
      .eq('practitioner_id', practitionerId);

    // Trip the circuit breaker
    if (newFailures >= CB_MAX_FAILURES) {
      console.warn(
        `[AppleCalendar] Circuit breaker tripped for practitioner ${practitionerId} ` +
          `after ${newFailures} failures. Disabling Apple Calendar integration.`,
      );
      await supabase
        .from('practitioners')
        .update({ apple_calendar_connected: false })
        .eq('id', practitionerId);
    }
  } catch (cbErr) {
    console.error('[AppleCalendar] handleAppleError itself failed:', cbErr);
  }
}
