/**
 * Booking confirmation/status/cancel page: /booking/:token
 */
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import type { BookingDetails } from '@/types/api';
import { EmptyState } from '@/components/shared/EmptyState';

// API helper to fetch booking details
async function fetchBookingDetails(token: string): Promise<BookingDetails | null> {
  const res = await fetch(`/api/booking/${token}/details`);
  if (!res.ok) return null;
  return res.json();
}

async function cancelBooking(token: string, reason?: string): Promise<boolean> {
  const res = await fetch('/api/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ booking_token: token, reason }),
  });
  return res.ok;
}

export default function BookingConfirmationPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetchBookingDetails(token)
      .then((data) => {
        if (data) {
          setBooking(data);
        } else {
          setError('This booking was not found.');
        }
      })
      .catch(() => {
        setError('Something went wrong. Please try again.');
      })
      .finally(() => setLoading(false));
  }, [token]);

  const handleCancel = async () => {
    if (!token) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const success = await cancelBooking(token, cancelReason || undefined);
      if (success) {
        // Refresh booking data
        const updated = await fetchBookingDetails(token);
        setBooking(updated);
        setShowCancelConfirm(false);
      } else {
        setCancelError('Failed to cancel. Please try again.');
      }
    } catch {
      setCancelError('Network error. Please try again.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-16" role="status" aria-label="Loading">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      </PageShell>
    );
  }

  if (error || !booking) {
    return (
      <PageShell>
        <EmptyState title="Booking not found" description={error ?? 'This booking was not found.'} icon="🔍" />
      </PageShell>
    );
  }

  const isCancelled = booking.status === 'cancelled';
  const isPast = new Date(booking.starts_at) < new Date();

  return (
    <PageShell>
      {/* Status badge */}
      <div className="mb-6">
        <StatusBadge status={booking.status} />
      </div>

      {/* Main card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-6">
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          {booking.session_type.name}
        </h1>

        {/* Practitioner info */}
        <div className="flex items-center gap-3 mb-6 pb-6 border-b border-gray-100">
          {booking.practitioner.photo_url ? (
            <img
              src={booking.practitioner.photo_url}
              alt={booking.practitioner.display_name}
              className="w-12 h-12 rounded-full object-cover border border-gray-200"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div
              className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-lg font-bold text-gray-500"
              aria-hidden="true"
            >
              {booking.practitioner.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="font-medium text-gray-900">{booking.practitioner.display_name}</p>
            <p className="text-sm text-gray-500">@{booking.practitioner.username}</p>
          </div>
        </div>

        {/* Date & Time */}
        <dl className="space-y-3 mb-6">
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Date & Time</dt>
            <dd className="text-sm font-medium text-gray-900">
              {formatDateTime(booking.starts_at, booking.ends_at, booking.guest_timezone)}
            </dd>
          </div>
          {booking.guest_timezone && (
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Timezone</dt>
              <dd className="text-sm font-medium text-gray-900">{booking.guest_timezone}</dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt className="text-sm text-gray-500">Duration</dt>
            <dd className="text-sm font-medium text-gray-900">
              {formatDuration(booking.session_type.duration_minutes)}
            </dd>
          </div>
          {booking.notes && (
            <div className="flex flex-col">
              <dt className="text-sm text-gray-500 mb-1">Notes</dt>
              <dd className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                {booking.notes}
              </dd>
            </div>
          )}
        </dl>

        {/* Guest info (read-only) */}
        <div className="pb-6 mb-6 border-b border-gray-100">
          <h3 className="text-sm font-medium text-gray-500 mb-2">Your details</h3>
          <p className="font-medium text-gray-900">{booking.guest_name}</p>
          <p className="text-sm text-gray-500">{booking.guest_email}</p>
        </div>

        {/* Actions */}
        {!isCancelled && !isPast && (
          <div className="space-y-3">
            {!showCancelConfirm ? (
              <button
                type="button"
                onClick={() => setShowCancelConfirm(true)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                Cancel booking
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">
                  Are you sure you want to cancel this booking?
                </p>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Reason for cancellation (optional)"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                />
                {cancelError && (
                  <p className="text-sm text-red-600" role="alert">{cancelError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCancelConfirm(false);
                      setCancelReason('');
                      setCancelError(null);
                    }}
                    disabled={cancelling}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Keep booking
                  </button>
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={cancelling}
                    className="flex-1 min-h-[44px] px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {cancelling ? 'Cancelling...' : 'Confirm cancel'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {isPast && !isCancelled && (
          <Link
            to={`/book/${booking.practitioner.username}`}
            className="block w-full text-center min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Book another session
          </Link>
        )}
      </div>

      {/* Add to calendar - for confirmed future bookings */}
      {!isCancelled && !isPast && (
        <div className="mt-4">
          <a
            href={`/api/booking/${token}/ics`}
            download="booking.ics"
            className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            📅 Add to Calendar
          </a>
        </div>
      )}
    </PageShell>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-8 sm:py-12">
        {children}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    completed: 'bg-gray-100 text-gray-800',
    no_show: 'bg-amber-100 text-amber-800',
  };
  const labels: Record<string, string> = {
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'No-show',
  };
  const style = styles[status] ?? styles.confirmed;
  const label = labels[status] ?? status;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

function formatDateTime(start: string, end: string, tz: string | null): string {
  const timezone = tz ?? 'UTC';
  try {
    const startDate = new Date(start);
    const datePart = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: timezone,
    }).format(startDate);
    const timePart = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
      hour12: true,
    }).format(startDate);
    return `${datePart} at ${timePart}`;
  } catch {
    return `${start} - ${end}`;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h} hour${h > 1 ? 's' : ''}`;
  return `${h}h ${m}m`;
}
