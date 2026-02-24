import { z } from 'zod';

/**
 * Shared validation schemas for API request bodies.
 * Used server-side for validation and client-side for form validation.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Count codepoints, not UTF-16 code units */
function codepointLength(str: string): number {
  return [...str].length;
}

/** Strip control characters (U+0000–U+001F) */
function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x1F]/g, '');
}

/** Validate IANA timezone string */
function isValidTimezone(tz: string): boolean {
  try {
    const supported = Intl.supportedValuesOf('timeZone');
    return supported.includes(tz);
  } catch {
    // Fallback for environments without supportedValuesOf
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }
}

/** Hex color regex */
const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** UUID regex */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ISO8601 with Z suffix only */
const ISO8601_Z_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** Date YYYY-MM-DD */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Username: lowercase alphanumeric + hyphens, 3-30 chars, start/end alphanumeric */
const USERNAME_REGEX = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** Reserved usernames that conflict with routes */
export const RESERVED_USERNAMES = [
  'admin', 'api', 'book', 'booking', 'dashboard', 'embed',
  'login', 'signup', 'settings', 'support', 'help', 'status',
  'health', 'static', 'assets', 'public', 'private', 'system',
  'root', 'www',
] as const;

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const usernameSchema = z
  .string()
  .regex(USERNAME_REGEX, 'Username must be 3-30 characters, lowercase letters, numbers, and hyphens only')
  .refine(
    (val) => !RESERVED_USERNAMES.includes(val as typeof RESERVED_USERNAMES[number]),
    'This username is reserved'
  );

export const guestNameSchema = z
  .string()
  .min(1, 'Name is required')
  .transform(stripControlChars)
  .refine((val) => codepointLength(val) <= 100, 'Name must be 100 characters or fewer');

export const guestEmailSchema = z
  .string()
  .email('Invalid email address')
  .max(254, 'Email must be 254 characters or fewer');

export const guestTimezoneSchema = z
  .string()
  .refine(isValidTimezone, 'Invalid timezone');

export const notesSchema = z
  .string()
  .transform(stripControlChars)
  .refine((val) => codepointLength(val) <= 500, 'Notes must be 500 characters or fewer')
  .optional();

export const startsAtSchema = z
  .string()
  .regex(ISO8601_Z_REGEX, 'Must be ISO8601 with Z suffix (UTC)');

export const sessionTypeIdSchema = z
  .string()
  .regex(UUID_REGEX, 'Invalid session type ID');

export const dateSchema = z
  .string()
  .regex(DATE_REGEX, 'Must be YYYY-MM-DD format');

export const hexColorSchema = z
  .string()
  .regex(HEX_COLOR_REGEX, 'Must be a valid hex color')
  .optional();

export const bookingTokenSchema = z
  .string()
  .min(1, 'Booking token is required');

export const turnstileTokenSchema = z
  .string()
  .min(1, 'Challenge token is required');

// ─── API Request Schemas ─────────────────────────────────────────────────────

export const slotsQuerySchema = z.object({
  username: usernameSchema,
  session_type_id: sessionTypeIdSchema,
  date: dateSchema,
  timezone: guestTimezoneSchema.optional(),
});

export const bookRequestSchema = z.object({
  username: usernameSchema,
  session_type_id: sessionTypeIdSchema,
  starts_at: startsAtSchema,
  guest_name: guestNameSchema,
  guest_email: guestEmailSchema,
  guest_timezone: guestTimezoneSchema,
  notes: notesSchema,
  turnstile_token: turnstileTokenSchema,
});

export const cancelRequestSchema = z.object({
  booking_token: bookingTokenSchema,
  reason: z
    .string()
    .max(500, 'Reason must be 500 characters or fewer')
    .optional(),
});

// ─── Dashboard Schemas ───────────────────────────────────────────────────────

export const sessionTypeSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional(),
  duration_minutes: z.number().int().min(1).max(480),
  buffer_minutes: z.number().int().min(0).max(120),
  min_notice_hours: z.number().int().min(0).max(8760),
  max_advance_days: z.number().int().min(1).max(365),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

export const availabilityWindowSchema = z.object({
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format'),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time format'),
  is_active: z.boolean().default(true),
});

export const dateOverrideSchema = z.object({
  date: dateSchema,
  is_blocked: z.boolean(),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable().optional(),
});

export const practitionerProfileSchema = z.object({
  display_name: z.string().min(1).max(100),
  bio: z.string().max(500).optional(),
  timezone: guestTimezoneSchema,
});
