/**
 * GET /api/available-dates
 *
 * Returns which dates in a given month have at least one bookable slot.
 * Checks availability windows, existing bookings, date overrides, AND
 * Google Calendar busy periods — all in one call.
 *
 * Query params:
 *   username         - practitioner username
 *   session_type_id  - UUID of session type
 *   month            - YYYY-MM format
 *   timezone         - optional, IANA timezone (default: practitioner's)
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Availability, DateOverride } from '../src/types/database';
import { createServiceClient, apiResponse, apiError } from '../src/lib/api-helpers';
import { calculateSlots } from '../src/lib/slots';
import { fetchBusyPeriods } from '../src/lib/google-calendar';
import { z } from 'zod';

const querySchema = z.object({
  username: z.string().min(1),
  session_type_id: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be YYYY-MM format'),
});

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== 'GET') {
    return apiError(res, 405, 'INVALID_INPUT', 'Method not allowed');
  }

  const parseResult = querySchema.safeParse(req.query);
  if (!parseResult.success) {
    const message = parseResult.error.errors.map(e => e.message).join(', ');
    return apiError(res, 400, 'INVALID_INPUT', message);
  }

  const { username, session_type_id, month } = parseResult.data;
  const [yearStr, monthStr] = month.split('-');
  const year = Number(yearStr);
  const monthNum = Number(monthStr); // 1-based

  const supabase = createServiceClient();

  // ── Look up practitioner ────────────────────────────────────────────────
  const { data: practitioner, error: pErr } = await supabase
    .from('public_practitioners')
    .select('id, username, timezone, is_active, google_calendar_connected')
    .eq('username', username)
    .single();

  if (pErr || !practitioner) {
    return apiError(res, 404, 'NOT_FOUND', 'Practitioner not found');
  }

  const isGoogleConnected = (practitioner as { google_calendar_connected?: boolean }).google_calendar_connected ?? false;

  // ── Look up session type ────────────────────────────────────────────────
  const { data: sessionType, error: stErr } = await supabase
    .from('session_types')
    .select('id, practitioner_id, duration_minutes, buffer_minutes, min_notice_hours, max_advance_days, is_active')
    .eq('id', session_type_id)
    .eq('practitioner_id', practitioner.id)
    .eq('is_active', true)
    .single();

  if (stErr || !sessionType) {
    return apiError(res, 404, 'NOT_FOUND', 'Session type not found');
  }

  // ── Date range for this month ───────────────────────────────────────────
  const firstDay = `${month}-01`;
  const lastDayDate = new Date(year, monthNum, 0); // last day of month
  const lastDay = `${month}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
  const rangeStart = `${firstDay}T00:00:00Z`;
  const rangeEnd = `${lastDay}T23:59:59Z`;

  // ── Parallel fetch: availability, overrides, bookings, Google busy ────
  const [availResult, overridesResult, bookingsResult, googleBusy] = await Promise.all([
    supabase
      .from('availability')
      .select('id, practitioner_id, day_of_week, start_time, end_time, is_active')
      .eq('practitioner_id', practitioner.id)
      .eq('is_active', true),

    supabase
      .from('date_overrides')
      .select('id, practitioner_id, date, is_blocked, start_time, end_time')
      .eq('practitioner_id', practitioner.id)
      .gte('date', firstDay)
      .lte('date', lastDay),

    supabase
      .from('bookings')
      .select('starts_at, ends_at, buffer_minutes')
      .eq('practitioner_id', practitioner.id)
      .neq('status', 'cancelled')
      .gte('ends_at', rangeStart)
      .lt('starts_at', rangeEnd),

    isGoogleConnected
      ? fetchBusyPeriods(practitioner.id, rangeStart, rangeEnd, supabase)
      : Promise.resolve([]),
  ]);

  const availability = (availResult.data ?? []) as Availability[];
  const allOverrides = (overridesResult.data ?? []) as DateOverride[];
  const allBookings = (bookingsResult.data ?? []) as Array<{ starts_at: string; ends_at: string; buffer_minutes: number }>;

  // Convert Google busy periods to booking-like format
  const googleBookings = googleBusy.map(p => ({
    starts_at: p.start,
    ends_at: p.end,
    buffer_minutes: 0,
  }));

  // ── Check each day ──────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const availableDates: string[] = [];
  const totalDays = lastDayDate.getDate();

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(year, monthNum - 1, day);

    // Skip past dates
    if (dateObj < today) continue;

    // Filter overrides and bookings for this specific date
    const dayOverrides = allOverrides.filter(o => o.date === dateStr);
    const dayStart = `${dateStr}T00:00:00Z`;
    const dayEnd = `${dateStr}T23:59:59Z`;

    const dayBookings = [
      ...allBookings.filter(b => b.starts_at < dayEnd && b.ends_at > dayStart),
      ...googleBookings.filter(b => b.starts_at < dayEnd && b.ends_at > dayStart),
    ];

    const result = calculateSlots(
      { timezone: practitioner.timezone, is_active: practitioner.is_active },
      {
        duration_minutes: sessionType.duration_minutes,
        buffer_minutes: sessionType.buffer_minutes,
        min_notice_hours: sessionType.min_notice_hours,
        max_advance_days: sessionType.max_advance_days,
      },
      dateStr,
      dayBookings,
      availability,
      dayOverrides,
    );

    if (result.slots.length > 0) {
      availableDates.push(dateStr);
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=120');

  return apiResponse(res, 200, { available_dates: availableDates, month });
}
