import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Availability, DateOverride } from '@/types/database.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayWindow {
  id?: string;
  start_time: string;
  end_time: string;
}

interface DayData {
  enabled: boolean;
  windows: DayWindow[];
}

type WeekData = Record<number, DayData>;

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── Helper ─────────────────────────────────────────────────────────────────

function parseTimeToHHMM(time: string): string {
  // time is like "09:00:00" or "09:00"
  return time.substring(0, 5);
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DashboardAvailability() {
  const { practitioner } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Weekly hours
  const [weekData, setWeekData] = useState<WeekData>({
    0: { enabled: false, windows: [{ start_time: '09:00', end_time: '17:00' }] },
    1: { enabled: true, windows: [{ start_time: '09:00', end_time: '17:00' }] },
    2: { enabled: true, windows: [{ start_time: '09:00', end_time: '17:00' }] },
    3: { enabled: true, windows: [{ start_time: '09:00', end_time: '17:00' }] },
    4: { enabled: true, windows: [{ start_time: '09:00', end_time: '17:00' }] },
    5: { enabled: true, windows: [{ start_time: '09:00', end_time: '17:00' }] },
    6: { enabled: false, windows: [{ start_time: '09:00', end_time: '17:00' }] },
  });

  // Date overrides
  const [overrides, setOverrides] = useState<DateOverride[]>([]);

  // Override modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideDate, setOverrideDate] = useState('');
  const [overrideType, setOverrideType] = useState<'block' | 'hours'>('block');
  const [overrideStart, setOverrideStart] = useState('09:00');
  const [overrideEnd, setOverrideEnd] = useState('17:00');
  const [addingOverride, setAddingOverride] = useState(false);

  // Block modal (when blocking date with bookings)
  const [blockModalOpen, setBlockModalOpen] = useState(false);
  const [affectedBookings, setAffectedBookings] = useState<{ id: string; guest_name: string; starts_at: string }[]>([]);
  const [pendingBlockDate, setPendingBlockDate] = useState<string | null>(null);

  // Fetch data
  useEffect(() => {
    const pid = practitioner?.id;
    if (!pid) return;

    async function fetchData() {
      setLoading(true);

      // Fetch weekly availability
      const { data: availData } = await supabase
        .from('availability')
        .select('*')
        .eq('practitioner_id', pid)
        .eq('is_active', true)
        .order('day_of_week');

      // Fetch date overrides
      const { data: overrideData } = await supabase
        .from('date_overrides')
        .select('*')
        .eq('practitioner_id', pid)
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date');

      // Build week data
      const week: WeekData = {
        0: { enabled: false, windows: [] },
        1: { enabled: false, windows: [] },
        2: { enabled: false, windows: [] },
        3: { enabled: false, windows: [] },
        4: { enabled: false, windows: [] },
        5: { enabled: false, windows: [] },
        6: { enabled: false, windows: [] },
      };

      if (availData) {
        for (const row of availData) {
          const day = row.day_of_week;
          week[day]!.enabled = true;
          week[day]!.windows.push({
            id: row.id,
            start_time: parseTimeToHHMM(row.start_time),
            end_time: parseTimeToHHMM(row.end_time),
          });
        }
      }

      // Ensure at least one window per enabled day
      for (let i = 0; i <= 6; i++) {
        if (week[i]!.enabled && week[i]!.windows.length === 0) {
          week[i]!.windows = [{ start_time: '09:00', end_time: '17:00' }];
        }
      }

      setWeekData(week);
      setOverrides(overrideData ?? []);
      setLoading(false);
    }

    fetchData();
  }, [practitioner?.id]);

  // Mark as changed
  function markChanged() {
    setHasChanges(true);
    setSuccess(null);
  }

  // ── Weekly hours handlers ─────────────────────────────────────────────────

  function toggleDay(day: number) {
    setWeekData((prev) => {
      const cur = prev[day] as DayData;
      return { ...prev, [day]: { enabled: !cur.enabled, windows: cur.windows } };
    });
    markChanged();
  }

  function updateWindow(day: number, winIdx: number, field: 'start_time' | 'end_time', value: string) {
    setWeekData((prev) => {
      const cur = prev[day] as DayData;
      const newWindows = [...cur.windows];
      const win = newWindows[winIdx]!;
      newWindows[winIdx] = { id: win.id, start_time: field === 'start_time' ? value : win.start_time, end_time: field === 'end_time' ? value : win.end_time };
      return { ...prev, [day]: { enabled: cur.enabled, windows: newWindows } };
    });
    markChanged();
  }

  function addWindow(day: number) {
    setWeekData((prev) => {
      const cur = prev[day] as DayData;
      return { ...prev, [day]: { enabled: cur.enabled, windows: [...cur.windows, { start_time: '12:00', end_time: '13:00' }] } };
    });
    markChanged();
  }

  function removeWindow(day: number, winIdx: number) {
    setWeekData((prev) => {
      const cur = prev[day] as DayData;
      const newWindows = cur.windows.filter((_, i) => i !== winIdx);
      return { ...prev, [day]: { enabled: cur.enabled, windows: newWindows } };
    });
    markChanged();
  }

  // Validate no overlapping windows on same day
  function validateNoOverlap(): string | null {
    for (let day = 0; day <= 6; day++) {
      const dayData = weekData[day] as DayData;
      const wins = dayData.windows;
      for (let i = 0; i < wins.length; i++) {
        for (let j = i + 1; j < wins.length; j++) {
          const a = wins[i]!;
          const b = wins[j]!;
          if (a.start_time < b.end_time && b.start_time < a.end_time) {
            return `Overlapping windows on ${DAYS[day]}.`;
          }
        }
      }
    }
    return null;
  }

  // Save weekly hours
  async function saveWeeklyHours() {
    if (!practitioner?.id) return;

    const overlapError = validateNoOverlap();
    if (overlapError) {
      setError(overlapError);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Delete existing availability for this practitioner
      await supabase.from('availability').delete().eq('practitioner_id', practitioner.id);

      // Build insert rows
      const insertRows: Omit<Availability, 'id' | 'created_at' | 'updated_at'>[] = [];
      for (let day = 0; day <= 6; day++) {
        const dd = weekData[day] as DayData;
        if (dd.enabled) {
          for (const win of dd.windows) {
            insertRows.push({
              practitioner_id: practitioner.id,
              day_of_week: day,
              start_time: win.start_time + ':00',
              end_time: win.end_time + ':00',
              is_active: true,
            });
          }
        }
      }

      if (insertRows.length > 0) {
        const { error: insertError } = await supabase.from('availability').insert(insertRows);
        if (insertError) throw insertError;
      }

      setHasChanges(false);
      setSuccess('Availability saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ── Override handlers ─────────────────────────────────────────────────────

  async function addOverride() {
    if (!practitioner?.id || !overrideDate) return;

    setAddingOverride(true);
    setError(null);

    try {
      // Check if date has confirmed bookings (if blocking)
      if (overrideType === 'block') {
        const { data: bookings } = await supabase
          .from('bookings')
          .select('id, guest_name, starts_at')
          .eq('practitioner_id', practitioner.id)
          .eq('status', 'confirmed')
          .eq('date', overrideDate);

        if (bookings && bookings.length > 0) {
          setAffectedBookings(bookings);
          setPendingBlockDate(overrideDate);
          setBlockModalOpen(true);
          setOverrideModalOpen(false);
          setAddingOverride(false);
          return;
        }
      }

      await createOverride();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add override');
      setAddingOverride(false);
    }
  }

  async function createOverride() {
    if (!practitioner?.id || !pendingBlockDate && !overrideDate) return;

    const date = pendingBlockDate ?? overrideDate;
    
    const { error: insertError } = await supabase.from('date_overrides').insert({
      practitioner_id: practitioner.id,
      date,
      is_blocked: overrideType === 'block',
      start_time: overrideType === 'hours' ? overrideStart + ':00' : null,
      end_time: overrideType === 'hours' ? overrideEnd + ':00' : null,
    });

    if (insertError) throw insertError;

    // Refresh overrides
    const { data: overrideData } = await supabase
      .from('date_overrides')
      .select('*')
      .eq('practitioner_id', practitioner.id)
      .gte('date', new Date().toISOString().split('T')[0])
      .order('date');

    setOverrides(overrideData ?? []);
    closeOverrideModal();
    setAddingOverride(false);
  }

  async function deleteOverride(id: string) {
    const { error } = await supabase.from('date_overrides').delete().eq('id', id);
    if (error) {
      setError(error.message);
    } else {
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    }
  }

  function closeOverrideModal() {
    setOverrideModalOpen(false);
    setOverrideDate('');
    setOverrideType('block');
    setOverrideStart('09:00');
    setOverrideEnd('17:00');
    setPendingBlockDate(null);
  }

  function confirmBlockWithBookings() {
    createOverride();
    setBlockModalOpen(false);
    setAffectedBookings([]);
    setPendingBlockDate(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="w-8 h-8 border-3 border-gray-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Availability</h1>
          <p className="text-gray-500 text-sm mt-1">Set your weekly hours and manage date overrides</p>
        </div>
        {hasChanges && (
          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            Unsaved changes
          </span>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
        </div>
      )}

      {/* Weekly Hours */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Weekly hours</h2>
        
        <div className="space-y-3">
          {DAYS.map((dayName, day) => {
            const dayData = weekData[day] as DayData;
            return (
              <div key={day} className={`border rounded-lg p-3 transition-colors ${dayData.enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                <div className="flex items-center gap-3">
                  {/* Toggle */}
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${dayData.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                    aria-label={`Toggle ${dayName}`}
                  >
                    <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform absolute top-1 ${dayData.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>

                  {/* Day name */}
                  <span className={`w-24 text-sm font-medium shrink-0 ${dayData.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                    {dayName}
                  </span>

                  {/* Windows */}
                  {dayData.enabled ? (
                    <div className="flex-1 space-y-2">
                      {dayData.windows.map((win, winIdx) => (
                        <div key={winIdx} className="flex items-center gap-2">
                          <input
                            type="time"
                            value={win.start_time}
                            onChange={(e) => updateWindow(day, winIdx, 'start_time', e.target.value)}
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                          />
                          <span className="text-gray-400 text-sm">to</span>
                          <input
                            type="time"
                            value={win.end_time}
                            onChange={(e) => updateWindow(day, winIdx, 'end_time', e.target.value)}
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                          />
                          {dayData.windows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeWindow(day, winIdx)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                              aria-label="Remove window"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => addWindow(day)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        + Add another time window
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400 italic">Unavailable</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={saveWeeklyHours}
          disabled={saving || !hasChanges}
          className="mt-4 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          {saving ? 'Saving...' : 'Save weekly hours'}
        </button>
      </section>

      {/* Date Overrides */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Date overrides</h2>
          <button
            onClick={() => setOverrideModalOpen(true)}
            className="px-3 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors min-h-[44px]"
          >
            + Add override
          </button>
        </div>

        {overrides.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No upcoming overrides. Add one to block a specific date or change hours.
          </p>
        ) : (
          <div className="space-y-2">
            {overrides.map((override) => (
              <div key={override.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">
                    {new Date(override.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                  <p className="text-sm text-gray-500">
                    {override.is_blocked ? (
                      <span className="text-red-600">Blocked</span>
                    ) : (
                      <> {parseTimeToHHMM(override.start_time!)} – {parseTimeToHHMM(override.end_time!)}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => deleteOverride(override.id)}
                  className="p-2 text-gray-400 hover:text-red-500 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label="Delete override"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add date override</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="override-date" className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  id="override-date"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={overrideDate}
                  onChange={(e) => setOverrideDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="override-type"
                      checked={overrideType === 'block'}
                      onChange={() => setOverrideType('block')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Block entire day</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="override-type"
                      checked={overrideType === 'hours'}
                      onChange={() => setOverrideType('hours')}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Set custom hours</span>
                  </label>
                </div>
              </div>

              {overrideType === 'hours' && (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label htmlFor="override-start" className="block text-sm font-medium text-gray-700 mb-1">
                      Start
                    </label>
                    <input
                      id="override-start"
                      type="time"
                      value={overrideStart}
                      onChange={(e) => setOverrideStart(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    />
                  </div>
                  <span className="text-gray-400 mt-6">to</span>
                  <div className="flex-1">
                    <label htmlFor="override-end" className="block text-sm font-medium text-gray-700 mb-1">
                      End
                    </label>
                    <input
                      id="override-end"
                      type="time"
                      value={overrideEnd}
                      onChange={(e) => setOverrideEnd(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={closeOverrideModal}
                disabled={addingOverride}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={addOverride}
                disabled={!overrideDate || addingOverride}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {addingOverride ? 'Adding...' : 'Add override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block with Bookings Modal */}
      {blockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">This date has bookings</h3>
            <p className="text-gray-500 text-sm mb-4">
              Blocking this date will affect the following bookings. They will NOT be automatically cancelled.
            </p>

            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg mb-4">
              {affectedBookings.map((b) => (
                <div key={b.id} className="p-3 border-b border-gray-100 last:border-b-0">
                  <p className="font-medium text-gray-900">{b.guest_name}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(b.starts_at).toLocaleString('en-US', { 
                      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' 
                    })}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setBlockModalOpen(false); setAffectedBookings([]); setPendingBlockDate(null); }}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlockWithBookings}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors min-h-[44px]"
              >
                Block anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
