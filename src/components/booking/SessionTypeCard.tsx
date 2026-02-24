/**
 * SessionTypeCard — card for selecting a session type.
 */
import type { SessionType } from '@/types/database';

interface SessionTypeCardProps {
  sessionType: SessionType;
  selected: boolean;
  onSelect: (sessionType: SessionType) => void;
}

export function SessionTypeCard({ sessionType, selected, onSelect }: SessionTypeCardProps) {
  const durationLabel = formatDuration(sessionType.duration_minutes);

  return (
    <button
      type="button"
      onClick={() => onSelect(sessionType)}
      aria-pressed={selected}
      className={[
        'w-full text-left rounded-xl border-2 p-4 transition-all duration-150 min-h-[44px]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
        selected
          ? 'border-accent bg-blue-50 shadow-sm'
          : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm',
      ].join(' ')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-base leading-snug">
            {sessionType.name}
          </h3>
          {sessionType.description && (
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {sessionType.description}
            </p>
          )}
        </div>
        <span className="shrink-0 text-sm font-medium text-gray-600 bg-gray-100 rounded-full px-3 py-1 whitespace-nowrap">
          {durationLabel}
        </span>
      </div>
      {selected && (
        <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-accent">
          <svg
            className="w-4 h-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
              clipRule="evenodd"
            />
          </svg>
          Selected
        </div>
      )}
    </button>
  );
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
