/**
 * Dashboard: Profile, embed code, calendar connection settings.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getAppUrl } from '@/lib/constants';
import { DEFAULT_ACCENT_COLOR } from '@/lib/constants';

export default function DashboardSettings() {
  const { practitioner, refreshPractitioner } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [timezone, setTimezone] = useState('America/New_York');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [emailRemindersEnabled, setEmailRemindersEnabled] = useState(false);
  const [remindersSaving, setRemindersSaving] = useState(false);

  const [embedMode, setEmbedMode] = useState<'inline' | 'modal'>('inline');
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [copyFeedback, setCopyFeedback] = useState(false);

  const copyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (practitioner) {
      setDisplayName(practitioner.display_name);
      setBio(practitioner.bio || '');
      setTimezone(practitioner.timezone);
      setEmailRemindersEnabled(practitioner.email_reminders_enabled);
    }
  }, [practitioner]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!practitioner) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('practitioners')
      .update({ display_name: displayName, bio, timezone })
      .eq('id', practitioner.id);
    
    setSaving(false);
    if (!error) {
      await refreshPractitioner();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  async function handlePauseBookings() {
    if (!practitioner) return;
    await supabase
      .from('practitioners')
      .update({ is_active: !practitioner.is_active })
      .eq('id', practitioner.id);
    await refreshPractitioner();
  }

  async function handleToggleReminders() {
    if (!practitioner) return;
    setRemindersSaving(true);
    const newValue = !emailRemindersEnabled;
    const { error } = await supabase
      .from('practitioners')
      .update({ email_reminders_enabled: newValue })
      .eq('id', practitioner.id);
    if (!error) {
      setEmailRemindersEnabled(newValue);
      await refreshPractitioner();
    }
    setRemindersSaving(false);
  }

  function getEmbedCode() {
    if (!practitioner) return '';
    const base = `<div id="booking-widget" data-practitioner="${practitioner.username}" data-accent="${accentColor}"></div>
<script src="${getAppUrl()}/embed.js" async></script>`;
    
    if (embedMode === 'modal') {
      return `<div id="booking-widget" data-practitioner="${practitioner.username}" data-accent="${accentColor}" data-mode="modal" data-trigger-text="Book Now"></div>
<script src="${getAppUrl()}/embed.js" async></script>`;
    }
    return base;
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(getEmbedCode());
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  }

  const bookingPageUrl = practitioner ? `${getAppUrl()}/book/${practitioner.username}` : '';

  if (!practitioner) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      {/* Profile Section */}
      <section>
        <h2 className="text-xl font-bold mb-4">Profile</h2>
        <form onSubmit={handleSaveProfile} className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="Tell visitors about yourself..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Timezone</label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="America/New_York">Eastern Time</option>
              <option value="America/Chicago">Central Time</option>
              <option value="America/Denver">Mountain Time</option>
              <option value="America/Los_Angeles">Pacific Time</option>
              <option value="Europe/London">London</option>
              <option value="Europe/Paris">Paris</option>
              <option value="Europe/Berlin">Berlin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
          </button>
        </form>
      </section>

      {/* Booking Page Link */}
      <section>
        <h2 className="text-xl font-bold mb-4">Booking Page</h2>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <p className="text-sm text-gray-600 mb-2">Share this link with clients:</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={bookingPageUrl}
              readOnly
              className="flex-1 px-3 py-2 border rounded-lg bg-gray-50"
            />
            <button
              onClick={() => { navigator.clipboard.writeText(bookingPageUrl); setCopyFeedback(true); setTimeout(() => setCopyFeedback(false), 2000); }}
              className="px-4 py-2 border rounded-lg hover:bg-gray-50"
            >
              {copyFeedback ? '✓' : 'Copy'}
            </button>
          </div>
        </div>
      </section>

      {/* Embed Code */}
      <section>
        <h2 className="text-xl font-bold mb-4">Embed Widget</h2>
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={embedMode === 'inline'}
                onChange={() => setEmbedMode('inline')}
              />
              Inline
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={embedMode === 'modal'}
                onChange={() => setEmbedMode('modal')}
              />
              Modal
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Accent Color</label>
            <input
              type="color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="w-16 h-10 border rounded cursor-pointer"
            />
            <span className="ml-2 text-sm text-gray-600">{accentColor}</span>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Embed Code</label>
            <textarea
              ref={copyRef}
              value={getEmbedCode()}
              readOnly
              rows={4}
              className="w-full px-3 py-2 border rounded-lg bg-gray-50 font-mono text-sm"
            />
          </div>
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            {copyFeedback ? '✓ Copied!' : 'Copy Code'}
          </button>
        </div>
      </section>

      {/* Pause Bookings */}
      <section>
        <h2 className="text-xl font-bold mb-4">Availability</h2>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">
                {practitioner.is_active ? 'Accepting bookings' : 'Not accepting bookings'}
              </p>
              <p className="text-sm text-gray-600">
                {practitioner.is_active ? 'Your booking page is live' : 'Your booking page shows "not accepting bookings"'}
              </p>
            </div>
            <button
              onClick={handlePauseBookings}
              className={`px-4 py-2 rounded-lg ${practitioner.is_active ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
            >
              {practitioner.is_active ? 'Pause Bookings' : 'Resume Bookings'}
            </button>
          </div>
        </div>
      </section>

      {/* Email Reminders */}
      <section>
        <h2 className="text-xl font-bold mb-4">Email Reminders</h2>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Send reminder emails 24 hours before each booking</p>
              <p className="text-sm text-gray-600">
                Guests receive a reminder. You receive a daily digest of tomorrow's bookings.
              </p>
            </div>
            <button
              onClick={handleToggleReminders}
              disabled={remindersSaving}
              aria-pressed={emailRemindersEnabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                emailRemindersEnabled ? 'bg-blue-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  emailRemindersEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      {/* Google Calendar (Phase 3) */}
      <section>
        <h2 className="text-xl font-bold mb-4">Google Calendar</h2>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <p className="text-gray-600">Google Calendar integration is coming in Phase 3.</p>
        </div>
      </section>
    </div>
  );
}
