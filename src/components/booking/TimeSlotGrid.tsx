/**
 * TimeSlotGrid — displays available time slots as a grid of buttons.
 */
import type { Slot, SlotState } from '@/types/api';

interface TimeSlotGridProps {
  slots: Slot[];
  state: SlotState;
  selectedSlot: Slot | null;
  timezone: string;
  loading: boolean;
  onSelect: (slot: Slot) => void;
}

export function TimeSlotGrid({
  slots,
  state,
  selectedSlot,
  timezone,
  loading,
  onSelect,
}: TimeSlotGridProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-10" role="status" aria-label="Loading time slots">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state !== 'available' || slots.length === 0) {
    return <EmptySlotState state={state} />;
  }

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Times shown in{' '}
        <span className="font-medium text-gray-700">
          {formatTimezoneLabel(timezone)}
        </span>
      </p>
      <div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2"
        role="group"
        aria-label="Available time slots"
      >
        {slots.map((slot) => {
          const startLabel = formatTime(slot.starts_at, timezone);
          const endLabel = formatTime(slot.ends_at, timezone);
          const isSelected =
            selectedSlot?.starts_at === slot.starts_at;

          return (
            <button
              key={slot.starts_at}
              type="button"
              onClick={() => onSelect(slot)}
              aria-label={`Book ${startLabel} to ${endLabel}`}
              aria-pressed={isSelected}
              className={[
                'min-h-[44px] px-3 py-2.5 rounded-lg border-2 text-sm font-medium',
                'transition-all duration-150',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                isSelected
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-gray-200 bg-white text-gray-800 hover:border-accent hover:text-accent',
              ].join(' ')}
            >
              {startLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptySlotState({ state }: { state: SlotState }) {
  const messages: Record<SlotState, { title: string; desc: string }> = {
    available: { title: '', desc: '' },
    no_availability: {
      title: 'No availability',
      desc: 'No times are available for this date. Please try another date.',
    },
    fully_booked: {
      title: 'Fully booked',
      desc: 'All slots for this date are taken. Please try another date.',
    },
    blocked: {
      title: 'Date unavailable',
      desc: 'This date is blocked. Please select a different date.',
    },
    misconfigured: {
      title: 'Temporarily unavailable',
      desc: 'Booking is temporarily unavailable. Please check back later.',
    },
  };

  const msg = messages[state] ?? messages.no_availability;

  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <p className="font-medium text-gray-700">{msg.title}</p>
      <p className="mt-1 text-sm text-gray-500 max-w-xs">{msg.desc}</p>
    </div>
  );
}

function formatTime(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatTimezoneLabel(timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    return `${timezone} (${tzPart?.value ?? ''})`;
  } catch {
    return timezone;
  }
}
