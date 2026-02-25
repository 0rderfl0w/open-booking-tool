/**
 * Dashboard: Profile, embed code, calendar connection settings.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { getAppUrl } from '@/lib/constants';
import { DEFAULT_ACCENT_COLOR } from '@/lib/constants';

interface CalendarOption {
  id: string;
  summary: string;
  primary: boolean;
}

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

  // Google Calendar state
  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('');
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const copyRef = useRef<HTMLTextAreaElement>(null);

  // Check URL params for calendar connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('calendar');
    const reason = params.get('reason');

    if (status === 'connected') {
      setCalendarStatus({ type: 'success', message: 'Google Calendar connected successfully!' });
      refreshPractitioner();
    } else if (status === 'error') {
      setCalendarStatus({ type: 'error', message: reason ? decodeURIComponent(reason) : 'Failed to connect Google Calendar' });
    }

    // Clear URL params
    if (status) {
      window.history.replaceState({}, '', '/dashboard/settings');
    }
  }, [refreshPractitioner]);

  // Fetch calendars when practitioner is loaded and connected
  useEffect(() => {
    if (practitioner?.google_calendar_connected) {
      fetchCalendars();
    }
  }, [practitioner?.google_calendar_connected]);

  async function fetchCalendars() {
    setCalendarLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/google/calendars', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();

      if (res.ok && data.calendars) {
        setCalendars(data.calendars);
        const primary = data.calendars.find((c: CalendarOption) => c.primary);
        if (primary) setSelectedCalendarId(primary.id);
      }
    } catch (err) {
      console.error('Failed to fetch calendars:', err);
    }
    setCalendarLoading(false);
  }

  async function handleConnectGoogleCalendar() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setCalendarStatus({ type: 'error', message: 'Not authenticated' });
        return;
      }

      const res = await fetch('/api/google/connect', {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        setCalendarStatus({ type: 'error', message: data.error?.message || 'Failed to connect' });
        return;
      }

      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setCalendarStatus({ type: 'error', message: 'Failed to initiate Google connection' });
    }
  }

  async function handleDisconnectGoogleCalendar() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/google/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        setCalendars([]);
        setSelectedCalendarId('');
        await refreshPractitioner();
        setCalendarStatus({ type: 'success', message: 'Google Calendar disconnected' });
      } else {
        setCalendarStatus({ type: 'error', message: 'Failed to disconnect' });
      }
    } catch (err) {
      setCalendarStatus({ type: 'error', message: 'Failed to disconnect' });
    }
  }

  async function handleSelectCalendar(calendarId: string) {
    setSelectedCalendarId(calendarId);
    if (!practitioner) return;

    const { error } = await supabase
      .from('practitioner_credentials')
      .update({ google_calendar_id: calendarId })
      .eq('practitioner_id', practitioner.id);

    if (error) {
      setCalendarStatus({ type: 'error', message: 'Failed to save calendar selection' });
    }
  }

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

      {/* Google Calendar */}
      <section>
        <h2 className="text-xl font-bold mb-4">Google Calendar</h2>
        <div className="bg-white rounded-lg shadow-sm p-6">
          {/* Status message */}
          {calendarStatus && (
            <div className={`mb-4 p-3 rounded-lg ${
              calendarStatus.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {calendarStatus.message}
            </div>
          )}

          {!practitioner?.google_calendar_connected ? (
            <div className="text-center py-4">
              <p className="text-gray-600 mb-4">
                Automatically create calendar events for bookings and check for conflicts
              </p>
              <button
                onClick={handleConnectGoogleCalendar}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Connect Google Calendar
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-600">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="font-medium">Google Calendar connected</span>
              </div>

              {calendarLoading ? (
                <p className="text-gray-500">Loading calendars...</p>
              ) : calendars.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Select calendar</label>
                  <select
                    value={selectedCalendarId}
                    onChange={(e) => handleSelectCalendar(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  >
                    {calendars.map((cal) => (
                      <option key={cal.id} value={cal.id}>
                        {cal.summary} {cal.primary ? '(primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <button
                onClick={handleDisconnectGoogleCalendar}
                className="px-4 py-2 text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
