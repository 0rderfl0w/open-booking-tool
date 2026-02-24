import { zonedTimeToUtc, utcToZonedTime } from 'date-fns-tz';
import { addMinutes, parseISO, isBefore, isAfter, differenceInCalendarDays, getDay } from 'date-fns';
import type { Availability, DateOverride, SessionType, Practitioner, Booking } from '../types/database';
import type { Slot, SlotState } from '../types/api';

/**
 * Calculate available time slots for a practitioner on a given date.
 */
export function calculateSlots(
  practitioner: Pick<Practitioner, 'timezone' | 'is_active'>,
  sessionType: Pick<SessionType, 'duration_minutes' | 'buffer_minutes' | 'min_notice_hours' | 'max_advance_days'>,
  date: string, // YYYY-MM-DD in the practitioner's timezone
  existingBookings: Pick<Booking, 'starts_at' | 'ends_at' | 'buffer_minutes'>[],
  availability: Availability[],
  dateOverrides: DateOverride[]
): { slots: Slot[]; state: SlotState } {
  const { timezone, is_active: isActive } = practitioner;
  const { duration_minutes, buffer_minutes, min_notice_hours, max_advance_days } = sessionType;

  // Check if practitioner is active
  if (!isActive) {
    return { slots: [], state: 'no_availability' };
  }

  // Misconfigured check
  const minNoticeDays = min_notice_hours / 24;
  if (minNoticeDays >= max_advance_days) {
    return { slots: [], state: 'misconfigured' };
  }

  const requestedDate = parseDateInTimezone(date, timezone);
  const todayInTz = utcToZonedTime(new Date(), timezone);

  // Date must be within max_advance_days
  const daysDiff = differenceInCalendarDays(requestedDate, todayInTz);
  if (daysDiff < 0 || daysDiff >= max_advance_days) {
    return { slots: [], state: 'no_availability' };
  }

  // Get day of week (0 = Sunday)
  const dayOfWeek = getDay(requestedDate);

  // Step 3: Check date overrides
  const dateOverride = dateOverrides.find(o => o.date === date);
  if (dateOverride?.is_blocked) {
    return { slots: [], state: 'blocked' };
  }

  // Get availability windows (override takes precedence over weekly)
  let windows = dateOverride && !dateOverride.is_blocked
    ? [{ start: dateOverride.start_time!, end: dateOverride.end_time! }]
    : availability
        .filter(a => a.day_of_week === dayOfWeek && a.is_active)
        .map(a => ({ start: a.start_time, end: a.end_time }));

  if (windows.length === 0) {
    return { slots: [], state: 'no_availability' };
  }

  // Generate slots
  const slots: Slot[] = [];
  const slotSpacing = duration_minutes + buffer_minutes;

  for (const window of windows) {
    // Convert window times to UTC
    const windowStart = combineDateAndTime(date, window.start, timezone);
    const windowEnd = combineDateAndTime(date, window.end, timezone);

    // Generate slot start times
    let slotStart = windowStart;
    while (isBefore(addMinutes(slotStart, duration_minutes), windowEnd) || 
           addMinutes(slotStart, duration_minutes).getTime() === windowEnd.getTime()) {
      
      // Step 6: Filter by min_notice_hours
      const now = new Date();
      const hoursUntilSlot = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);
      if (hoursUntilSlot < min_notice_hours) {
        slotStart = addMinutes(slotStart, slotSpacing);
        continue;
      }

      // Step 8: Check conflicts with existing bookings
      const slotEnd = addMinutes(slotStart, duration_minutes);
      const hasConflict = existingBookings.some(booking => {
        const bookingStart = parseISO(booking.starts_at);
        const bookingEnd = addMinutes(parseISO(booking.ends_at), booking.buffer_minutes);
        const newSlotEnd = addMinutes(slotStart, duration_minutes + buffer_minutes);
        
        return (
          isBefore(slotStart, bookingEnd) && isAfter(newSlotEnd, bookingStart)
        );
      });

      if (!hasConflict) {
        slots.push({
          starts_at: slotStart.toISOString(),
          ends_at: slotEnd.toISOString(),
        });
      }

      slotStart = addMinutes(slotStart, slotSpacing);
    }
  }

  if (slots.length === 0) {
    return { slots: [], state: 'fully_booked' };
  }

  return { slots, state: 'available' };
}

/**
 * Parse a date string in a specific timezone.
 */
function parseDateInTimezone(dateStr: string, timezone: string): Date {
  return zonedTimeToUtc(`${dateStr}T00:00:00`, timezone);
}

/**
 * Combine a date string with a time string in a specific timezone.
 */
function combineDateAndTime(date: string, time: string, timezone: string): Date {
  return zonedTimeToUtc(`${date}T${time}`, timezone);
}
