import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Availability, DateOverride } from '../src/types/database';
import { createServiceClient, createRateLimiter, apiResponse, apiError, getClientIp, isBodyTooLarge } from '../src/lib/api-helpers';
import { slotsQuerySchema } from '../src/lib/validation';
import { calculateSlots } from '../src/lib/slots';
import { RATE_LIMITS } from '../src/lib/constants';
import { fetchCalendarEvents, type GoogleCalendarEvent } from '../src/lib/google-calendar';

// Rate limiter for slots endpoint
const slotsRateLimiter = createRateLimiter(
  'slots',
  RATE_LIMITS.slots.limit,
  RATE_LIMITS.slots.window
);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return apiError(res, 405, 'INVALID_INPUT', 'Method not allowed');
  }

  // Check body size (GET requests won't have a body, but guard anyway)
  if (req.body && isBodyTooLarge(req.body)) {
    return apiError(res, 413, 'INVALID_INPUT', 'Request body too large');
  }

  // Rate limiting
  const clientIp = getClientIp(req);
  const rateLimitResult = await slotsRateLimiter.limit(clientIp);
  const allowed = 'success' in rateLimitResult ? rateLimitResult.success : rateLimitResult.allowed;
  
  if (!allowed) {
    res.setHeader('Retry-After', '60');
    return apiError(res, 429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
  }

  // Validate query params
  const parseResult = slotsQuerySchema.safeParse(req.query);
  
  if (!parseResult.success) {
    const message = parseResult.error.errors.map(e => e.message).join(', ');
    return apiError(res, 400, 'INVALID_INPUT', message);
  }

  const { username, session_type_id, date } = parseResult.data;

  // Parse and validate date
  const requestedDate = new Date(date + 'T00:00:00Z');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (requestedDate < today) {
    return apiError(res, 422, 'INVALID_INPUT', 'Cannot query past dates');
  }

  const supabase = createServiceClient();

  // Step 1: Look up practitioner by username
  const { data: practitioner, error: practitionerError } = await supabase
    .from('public_practitioners')
    .select('id, username, timezone, is_active, google_calendar_connected')
    .eq('username', username)
    .single();

  if (practitionerError || !practitioner) {
    return apiError(res, 404, 'NOT_FOUND', 'Practitioner not found');
  }

  const isGoogleCalendarConnected = (practitioner as { google_calendar_connected?: boolean }).google_calendar_connected ?? false;

  // Step 2: Look up session type
  const { data: sessionType, error: sessionTypeError } = await supabase
    .from('session_types')
    .select('id, practitioner_id, duration_minutes, buffer_minutes, min_notice_hours, max_advance_days, is_active')
    .eq('id', session_type_id)
    .eq('practitioner_id', practitioner.id)
    .eq('is_active', true)
    .single();

  if (sessionTypeError || !sessionType) {
    return apiError(res, 404, 'NOT_FOUND', 'Session type not found');
  }

  // Parallel fetch: availability, date overrides, and bookings
  const [availabilityResult, dateOverridesResult, bookingsResult] = await Promise.all([
    // Availability windows for this practitioner
    supabase
      .from('availability')
      .select('id, practitioner_id, day_of_week, start_time, end_time, is_active')
      .eq('practitioner_id', practitioner.id)
      .eq('is_active', true),
    
    // Date overrides for this date
    supabase
      .from('date_overrides')
      .select('id, practitioner_id, date, is_blocked, start_time, end_time')
      .eq('practitioner_id', practitioner.id)
      .eq('date', date),
    
    // Existing bookings for this practitioner on this date
    supabase
      .from('bookings')
      .select('starts_at, ends_at, buffer_minutes')
      .eq('practitioner_id', practitioner.id)
      .neq('status', 'cancelled')
      .gte('ends_at', `${date}T00:00:00Z`)
      .lt('starts_at', `${date}T23:59:59Z`),
  ]);

  const availability = (availabilityResult.data ?? []) as Availability[];
  const dateOverrides = (dateOverridesResult.data ?? []) as DateOverride[];
  const existingBookings = (bookingsResult.data ?? []) as { starts_at: string; ends_at: string; buffer_minutes: number }[];

  // Step: Fetch Google Calendar events if connected (for conflict checking)
  if (isGoogleCalendarConnected) {
    const dateStart = `${date}T00:00:00Z`;
    const dateEnd = `${date}T23:59:59Z`;

    const googleEvents = await fetchCalendarEvents(
      (practitioner as { id: string }).id,
      dateStart,
      dateEnd,
      supabase,
    );

    // Merge Google events into busy periods
    if (googleEvents.length > 0) {
      const googleBusyPeriods = googleEvents
        .filter((e: GoogleCalendarEvent) => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime)
        .map((e: GoogleCalendarEvent) => ({
          starts_at: e.start!.dateTime!,
          ends_at: e.end!.dateTime!,
          buffer_minutes: 0,
        }));

      existingBookings.push(...googleBusyPeriods);
    }
  }

  // Calculate slots
  const response = calculateSlots(
    {
      timezone: practitioner.timezone,
      is_active: practitioner.is_active,
    },
    {
      duration_minutes: sessionType.duration_minutes,
      buffer_minutes: sessionType.buffer_minutes,
      min_notice_hours: sessionType.min_notice_hours,
      max_advance_days: sessionType.max_advance_days,
    },
    date,
    existingBookings,
    availability,
    dateOverrides
  );

  // Set cache headers (handled by vercel.json but set explicitly here too)
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60');

  return apiResponse(res, 200, response);
}
