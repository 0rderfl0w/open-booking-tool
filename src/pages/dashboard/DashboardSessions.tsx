import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { SessionType } from '@/types/database.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SessionFormData {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_advance_days: number;
  is_active: boolean;
  sort_order: number;
}

const DEFAULT_FORM: SessionFormData = {
  name: '',
  description: '',
  duration_minutes: 30,
  buffer_minutes: 15,
  min_notice_hours: 2,
  max_advance_days: 30,
  is_active: true,
  sort_order: 0,
};

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DashboardSessions() {
  const { practitioner } = useAuth();
  const [sessions, setSessions] = useState<SessionType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SessionFormData>(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof SessionFormData, string>>>({});
  const [saving, setSaving] = useState(false);

  // Delete/deactivate modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [hasBookings, setHasBookings] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch sessions
  useEffect(() => {
    if (!practitioner?.id) return;

    async function fetchSessions() {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('session_types')
        .select('*')
        .eq('practitioner_id', practitioner!.id)
        .order('is_active', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (fetchError) {
        setError(fetchError.message);
      } else {
        setSessions(data ?? []);
      }
      setLoading(false);
    }

    fetchSessions();
  }, [practitioner?.id]);

  // Validate form
  function validateForm(): boolean {
    const errors: Partial<Record<keyof SessionFormData, string>> = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (formData.name.length > 100) errors.name = 'Max 100 characters';
    if (formData.description.length > 500) errors.description = 'Max 500 characters';
    if (formData.duration_minutes < 1 || formData.duration_minutes > 480) errors.duration_minutes = 'Invalid duration';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // Open modal for new
  function openCreateModal() {
    setEditingId(null);
    setFormData(DEFAULT_FORM);
    setFormErrors({});
    setModalOpen(true);
  }

  // Open modal for edit
  function openEditModal(session: SessionType) {
    setEditingId(session.id);
    setFormData({
      name: session.name,
      description: session.description ?? '',
      duration_minutes: session.duration_minutes,
      buffer_minutes: session.buffer_minutes,
      min_notice_hours: session.min_notice_hours,
      max_advance_days: session.max_advance_days,
      is_active: session.is_active,
      sort_order: session.sort_order,
    });
    setFormErrors({});
    setModalOpen(true);
  }

  // Save (create or update)
  async function handleSave() {
    if (!validateForm() || !practitioner?.id) return;

    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        // Update
        const { error: updateError } = await supabase
          .from('session_types')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            duration_minutes: formData.duration_minutes,
            buffer_minutes: formData.buffer_minutes,
            min_notice_hours: formData.min_notice_hours,
            max_advance_days: formData.max_advance_days,
            is_active: formData.is_active,
            sort_order: formData.sort_order,
          })
          .eq('id', editingId);

        if (updateError) throw updateError;
        setSuccess('Session type updated!');
      } else {
        // Create
        const { error: insertError } = await supabase
          .from('session_types')
          .insert({
            practitioner_id: practitioner.id,
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            duration_minutes: formData.duration_minutes,
            buffer_minutes: formData.buffer_minutes,
            min_notice_hours: formData.min_notice_hours,
            max_advance_days: formData.max_advance_days,
            is_active: formData.is_active,
            sort_order: formData.sort_order,
          });

        if (insertError) throw insertError;
        setSuccess('Session type created!');
      }

      // Refresh list
      const { data } = await supabase
        .from('session_types')
        .select('*')
        .eq('practitioner_id', practitioner.id)
        .order('is_active', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      setSessions(data ?? []);
      setModalOpen(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // Check for bookings before delete, then show modal
  async function confirmDelete(id: string) {
    setDeletingId(id);

    // Check for bookings
    const { data } = await supabase
      .from('bookings')
      .select('id')
      .eq('session_type_id', id)
      .neq('status', 'cancelled')
      .limit(1);

    setHasBookings(!!(data && data.length > 0));
    setDeleteModalOpen(true);
  }

  // Perform delete or deactivate
  async function handleDelete() {
    if (!deletingId || !practitioner?.id) return;

    setDeleting(true);
    setError(null);

    try {
      if (hasBookings) {
        // Deactivate instead of delete
        const { error: updateError } = await supabase
          .from('session_types')
          .update({ is_active: false })
          .eq('id', deletingId);

        if (updateError) throw updateError;
        setSuccess('Session type deactivated (has existing bookings)');
      } else {
        // Delete
        const { error: deleteError } = await supabase
          .from('session_types')
          .delete()
          .eq('id', deletingId);

        if (deleteError) throw deleteError;
        setSuccess('Session type deleted');
      }

      // Refresh
      const { data } = await supabase
        .from('session_types')
        .select('*')
        .eq('practitioner_id', practitioner.id)
        .order('is_active', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      setSessions(data ?? []);
      setDeleteModalOpen(false);
      setDeletingId(null);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  }

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
          <h1 className="text-2xl font-bold text-gray-900">Session Types</h1>
          <p className="text-gray-500 text-sm mt-1">Create and manage the types of sessions you offer</p>
        </div>
        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
        >
          + Add session type
        </button>
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

      {sessions.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No session types yet</h3>
          <p className="text-gray-500 text-sm mb-4">Create your first session type to start accepting bookings</p>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Add session type
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`bg-white rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-opacity ${session.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900">{session.name}</h3>
                  {!session.is_active && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 truncate">{session.description || 'No description'}</p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                  <span>{session.duration_minutes} min</span>
                  <span>•</span>
                  <span>{session.buffer_minutes} min buffer</span>
                  <span>•</span>
                  <span>{session.min_notice_hours}h notice</span>
                  <span>•</span>
                  <span>{session.max_advance_days}d advance</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => openEditModal(session)}
                  className="px-3 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors min-h-[44px]"
                >
                  Edit
                </button>
                <button
                  onClick={() => confirmDelete(session.id)}
                  className="px-3 py-2 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors min-h-[44px]"
                >
                  {hasBookings ? 'Deactivate' : 'Delete'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {editingId ? 'Edit session type' : 'Create session type'}
            </h3>

            <div className="space-y-4">
              <div>
                <label htmlFor="session-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="session-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className={`w-full px-3 py-2.5 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${formErrors.name ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="e.g. Discovery Call"
                />
                {formErrors.name && <p className="text-red-600 text-xs mt-1">{formErrors.name}</p>}
              </div>

              <div>
                <label htmlFor="session-desc" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="session-desc"
                  value={formData.description}
                  onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="What will you discuss?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
                    Duration (minutes)
                  </label>
                  <select
                    id="duration"
                    value={formData.duration_minutes}
                    onChange={(e) => setFormData((f) => ({ ...f, duration_minutes: parseInt(e.target.value) }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] bg-white"
                  >
                    {[15, 30, 45, 60, 75, 90, 120, 180, 240].map((d) => (
                      <option key={d} value={d}>{d} min</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="buffer" className="block text-sm font-medium text-gray-700 mb-1">
                    Buffer (minutes)
                  </label>
                  <input
                    id="buffer"
                    type="number"
                    min={0}
                    max={120}
                    value={formData.buffer_minutes}
                    onChange={(e) => setFormData((f) => ({ ...f, buffer_minutes: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="notice" className="block text-sm font-medium text-gray-700 mb-1">
                    Minimum notice (hours)
                  </label>
                  <input
                    id="notice"
                    type="number"
                    min={0}
                    max={8760}
                    value={formData.min_notice_hours}
                    onChange={(e) => setFormData((f) => ({ ...f, min_notice_hours: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>

                <div>
                  <label htmlFor="advance" className="block text-sm font-medium text-gray-700 mb-1">
                    Max advance (days)
                  </label>
                  <input
                    id="advance"
                    type="number"
                    min={1}
                    max={365}
                    value={formData.max_advance_days}
                    onChange={(e) => setFormData((f) => ({ ...f, max_advance_days: parseInt(e.target.value) || 30 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="sort-order" className="block text-sm font-medium text-gray-700 mb-1">
                    Sort order
                  </label>
                  <input
                    id="sort-order"
                    type="number"
                    min={0}
                    value={formData.sort_order}
                    onChange={(e) => setFormData((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>

                <div className="flex items-center h-full pb-3">
                  <label className="flex items-center gap-2 cursor-pointer pt-5">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData((f) => ({ ...f, is_active: e.target.checked }))}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {saving ? 'Saving...' : editingId ? 'Save changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete/Deactivate Modal */}
      {deleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {hasBookings ? 'Deactivate session type?' : 'Delete session type?'}
            </h3>
            <p className="text-gray-500 text-sm mb-4">
              {hasBookings
                ? 'This session type has existing bookings. It will be deactivated instead of deleted.'
                : 'This action cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteModalOpen(false); setDeletingId(null); }}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {deleting ? 'Processing...' : hasBookings ? 'Deactivate' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
