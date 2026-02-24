/**
 * BookingSummary — confirmation step showing all selected booking details.
 */
import type { Slot } from '@/types/api';
import type { SessionType } from '@/types/database';
import type { GuestDetails } from './GuestDetailsForm';

interface BookingSummaryProps {
  sessionType: SessionType;
  selectedSlot: Slot;
  guestDetails: GuestDetails;
  practitionerDisplayName: string;
}

export function BookingSummary({
  sessionType,
  selectedSlot,
  guestDetails,
  practitionerDisplayName,
}: BookingSummaryProps) {
  const timezone = guestDetails.timezone;

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 text-base">Booking summary</h3>
      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
        <SummaryRow label="Session" value={sessionType.name} />
        <SummaryRow label="With" value={practitionerDisplayName} />
        <SummaryRow label="Duration" value={formatDuration(sessionType.duration_minutes)} />
        <SummaryRow
          label="Date & Time"
          value={formatDateTime(selectedSlot.starts_at, timezone)}
        />
        <SummaryRow
          label="Timezone"
          value={timezone}
        />
        <SummaryRow label="Your name" value={guestDetails.guestName} />
        <SummaryRow label="Email" value={guestDetails.guestEmail} />
        {guestDetails.notes && (
          <SummaryRow label="Notes" value={guestDetails.notes} />
        )}
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-4 py-3 bg-white">
      <dt className="w-28 shrink-0 text-sm text-gray-500">{label}</dt>
      <dd className="flex-1 text-sm font-medium text-gray-900 break-words">{value}</dd>
    </div>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h > 1 ? 's' : ''}`;
  return `${h}h ${m}m`;
}

function formatDateTime(iso: string, timezone: string): string {
  try {
    const date = new Date(iso);
    const datePart = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    }).format(date);
    const timePart = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      hour12: true,
    }).format(date);
    return `${datePart} at ${timePart}`;
  } catch {
    return iso;
  }
}
