/**
 * useTimezone hook
 * Auto-detects visitor timezone, validates against IANA list, falls back to UTC.
 */
import { useState } from 'react';

function getTimezoneList(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    // Not all environments support supportedValuesOf
    return [];
  }
}

function detectTimezone(timezoneList: string[]): { timezone: string; isDetected: boolean } {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && (timezoneList.length === 0 || timezoneList.includes(tz))) {
      return { timezone: tz, isDetected: true };
    }
  } catch {
    // fall through to UTC
  }
  return { timezone: 'UTC', isDetected: false };
}

export interface UseTimezoneResult {
  timezone: string;
  setTimezone: (tz: string) => void;
  isDetected: boolean;
  timezoneList: string[];
}

export function useTimezone(): UseTimezoneResult {
  const [timezoneList] = useState<string[]>(() => getTimezoneList());
  const [{ timezone, isDetected }] = useState(() => detectTimezone(timezoneList));
  const [selectedTimezone, setSelectedTimezone] = useState(timezone);

  return {
    timezone: selectedTimezone,
    setTimezone: setSelectedTimezone,
    isDetected,
    timezoneList,
  };
}
