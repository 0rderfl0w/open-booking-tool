/**
 * Application-wide constants.
 */

/** Default accent color for the booking widget */
export const DEFAULT_ACCENT_COLOR = '#3b82f6';

/** Hex color validation regex */
export const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Booking token length (nanoid) */
export const BOOKING_TOKEN_LENGTH = 12;

/** Rate limits (requests per window) */
export const RATE_LIMITS = {
  book: { limit: 10, window: '1m' },
  cancel: { limit: 5, window: '1m' },
  slots: { limit: 30, window: '1m' },
  ics: { limit: 20, window: '1h' },
  emailPerDay: 3, // max bookings per guest email per day
} as const;

/** Wizard step names */
export const WIZARD_STEPS = [
  'session-type',
  'date',
  'time',
  'details',
  'confirmation',
] as const;

export type WizardStep = typeof WIZARD_STEPS[number];

/** App URL for building links */
export function getAppUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return process.env.APP_URL ?? 'http://localhost:5173';
}
