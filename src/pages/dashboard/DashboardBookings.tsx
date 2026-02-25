import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Booking } from '@/types/database.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingWithSession extends Booking {
  session_type_name?: string;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function formatDateTime(iso: string, timezone: string): string {
  try {
    const date = new Date(iso);
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: timezone,
    }).format(date);
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    completed: 'bg-gray-100 text-gray-800',
    no_show: 'bg-amber-100 text-amber-800',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DashboardBookings() {
  const { practitioner, user } = useAuth();
  const [bookings, setBookings] = useState<BookingWithSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const timezone = practitioner?.timezone ?? 'UTC';

  // Fetch bookings
  useEffect(() => {
    if (!user || !practitioner?.id) {
      // If auth context hasn't loaded practitioner yet, don't stay stuck on spinner forever
      const timeout = setTimeout(() => setLoading(false), 3000);
      return () => clearTimeout(timeout);
    }

    async function fetchBookings() {
      setLoading(true);
      setError(null);

      // Get bookings for this practitioner
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('practitioner_id', practitioner?.id)
        .order('starts_at', { ascending: true });

      if (bookingsError) {
        setError(bookingsError.message);
        setLoading(false);
        return;
      }

      if (!bookingsData || bookingsData.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      // Get session type names
      const sessionTypeIds = [...new Set(bookingsData.map((b) => b.session_type_id))];
      const { data: sessionTypes } = await supabase
        .from('session_types')
        .select('id, name')
        .in('id', sessionTypeIds);

      const sessionNameMap = new Map(sessionTypes?.map((s) => [s.id, s.name]));

      const enriched = bookingsData.map((b) => ({
        ...b,
        session_type_name: sessionNameMap.get(b.session_type_id) ?? 'Unknown',
      }));

      setBookings(enriched);
      setLoading(false);
    }

    fetchBookings();
  }, [user, practitioner?.id]);

  // Split into upcoming and past
  const now = new Date().toISOString();
  const upcoming = bookings.filter((b) => b.starts_at > now && b.status === 'confirmed');
  const past = bookings.filter((b) => b.starts_at <= now || b.status !== 'confirmed');

  // Handle cancel
  async function handleCancel() {
    if (!cancellingId) return;
    setCancelling(true);

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: cancelReason || null,
      })
      .eq('id', cancellingId);

    if (updateError) {
      setError(updateError.message);
    } else {
      // Refresh bookings
      setBookings((prev) =>
        prev.map((b) =>
          b.id === cancellingId ? { ...b, status: 'cancelled' as const, cancelled_at: new Date().toISOString() } : b
        )
      );
    }

    setCancelModalOpen(false);
    setCancellingId(null);
    setCancelReason('');
    setCancelling(false);
  }

  function openCancelModal(id: string) {
    setCancellingId(id);
    setCancelModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bookings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your upcoming and past sessions</p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {bookings.length === 0 ? (
        // Empty state
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No bookings yet</h3>
          <p className="text-gray-500 text-sm mb-4">
            Share your booking page to start getting appointments
          </p>
          {practitioner?.username && (
            <a
              href={`/book/${practitioner.username}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Share booking page
            </a>
          )}
        </div>
      ) : (
        <>
          {/* Upcoming */}
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{booking.guest_name}</span>
                        <StatusBadge status={booking.status} />
                      </div>
                      <p className="text-sm text-gray-500 truncate">{booking.guest_email}</p>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatDateTime(booking.starts_at, timezone)}
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{booking.session_type_name}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => openCancelModal(booking.id)}
                      className="shrink-0 px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors min-h-[44px]"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Past */}
          {past.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Past</h2>
              <div className="space-y-3">
                {past.map((booking) => (
                  <div
                    key={booking.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 opacity-75"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-gray-900">{booking.guest_name}</span>
                        <StatusBadge status={booking.status} />
                      </div>
                      <p className="text-sm text-gray-500 truncate">{booking.guest_email}</p>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {formatDateTime(booking.starts_at, timezone)}
                        <span className="text-gray-400">•</span>
                        <span className="text-gray-500">{booking.session_type_name}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Cancel Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Cancel booking?</h3>
            <p className="text-gray-500 text-sm mb-4">
              This will cancel the session and notify the guest. This action cannot be undone.
            </p>
            <div className="mb-4">
              <label htmlFor="cancel-reason" className="block text-sm font-medium text-gray-700 mb-1">
                Reason (optional)
              </label>
              <textarea
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                maxLength={500}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                placeholder="Let the guest know why..."
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCancelModalOpen(false)}
                disabled={cancelling}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Keep booking
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {cancelling ? 'Cancelling...' : 'Cancel booking'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
