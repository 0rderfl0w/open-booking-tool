import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase, supabasePublic } from '@/lib/supabase';
import { usernameSchema, RESERVED_USERNAMES } from '@/lib/validation.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepUsernameData {
  username: string;
}

interface StepProfileData {
  display_name: string;
  timezone: string;
  bio: string;
  photo_file: File | null;
  photo_preview: string | null;
}

interface StepSessionData {
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  min_notice_hours: number;
  max_advance_days: number;
}

interface DayAvailability {
  enabled: boolean;
  start_time: string;
  end_time: string;
}

type WeekAvailability = Record<number, DayAvailability>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DEFAULT_WEEK: WeekAvailability = {
  0: { enabled: false, start_time: '09:00', end_time: '17:00' },
  1: { enabled: true,  start_time: '09:00', end_time: '17:00' },
  2: { enabled: true,  start_time: '09:00', end_time: '17:00' },
  3: { enabled: true,  start_time: '09:00', end_time: '17:00' },
  4: { enabled: true,  start_time: '09:00', end_time: '17:00' },
  5: { enabled: true,  start_time: '09:00', end_time: '17:00' },
  6: { enabled: false, start_time: '09:00', end_time: '17:00' },
};

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'America/New_York';
  }
}

function getTimezones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo'];
  }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
              i < current
                ? 'bg-blue-600 text-white'
                : i === current
                ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                : 'bg-gray-200 text-gray-500'
            }`}
          >
            {i < current ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          {i < total - 1 && (
            <div className={`h-0.5 w-8 ${i < current ? 'bg-blue-600' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Timezone Combobox ────────────────────────────────────────────────────────

function TimezoneSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const allTimezones = getTimezones();
  const filtered = query
    ? allTimezones.filter((tz) => tz.toLowerCase().includes(query.toLowerCase()))
    : allTimezones;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
        placeholder="Search timezone..."
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 50).map((tz) => (
            <li key={tz}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
                onMouseDown={() => { onChange(tz); setQuery(tz); setOpen(false); }}
              >
                {tz}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user, refreshPractitioner } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Step data
  const [usernameData, setUsernameData] = useState<StepUsernameData>({ username: '' });
  const [profileData, setProfileData] = useState<StepProfileData>({
    display_name: '',
    timezone: detectTimezone(),
    bio: '',
    photo_file: null,
    photo_preview: null,
  });
  const [sessionData, setSessionData] = useState<StepSessionData>({
    name: 'Discovery Call',
    description: '',
    duration_minutes: 30,
    buffer_minutes: 15,
    min_notice_hours: 2,
    max_advance_days: 30,
  });
  const [weekData, setWeekData] = useState<WeekAvailability>(DEFAULT_WEEK);

  // Username step state
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Profile step state
  const [profileErrors, setProfileErrors] = useState<Partial<Record<keyof StepProfileData, string>>>({});
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Session step state
  const [sessionErrors, setSessionErrors] = useState<Partial<Record<keyof StepSessionData, string>>>({});

  // Availability step state
  const [availError, setAvailError] = useState<string | null>(null);

  // ── Username checks ────────────────────────────────────────────────────────

  function checkUsername(val: string) {
    setUsernameData({ username: val });
    setUsernameError(null);
    setUsernameStatus('idle');

    if (!val) return;

    // Validate format
    const result = usernameSchema.safeParse(val);
    if (!result.success) {
      setUsernameError(result.error.errors[0]?.message ?? 'Invalid username.');
      return;
    }

    // Check reserved words
    if (RESERVED_USERNAMES.includes(val as typeof RESERVED_USERNAMES[number])) {
      setUsernameError('This username is reserved.');
      return;
    }

    // Debounced DB check
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    setUsernameStatus('checking');
    usernameDebounceRef.current = setTimeout(async () => {
      try {
        const { data, error } = await supabasePublic
          .from('public_practitioners')
          .select('id')
          .eq('username', val)
          .maybeSingle();
        if (error) {
          console.error('Username check error:', error);
          // Fall through as available so user isn't blocked — DB unique constraint is the real guard
          setUsernameStatus('available');
          return;
        }
        setUsernameStatus(data ? 'taken' : 'available');
      } catch (err) {
        console.error('Username check failed:', err);
        setUsernameStatus('available');
      }
    }, 500);
  }

  function validateUsernameStep(): boolean {
    if (!usernameData.username) { setUsernameError('Username is required.'); return false; }
    const result = usernameSchema.safeParse(usernameData.username);
    if (!result.success) { setUsernameError(result.error.errors[0]?.message ?? 'Invalid username.'); return false; }
    if (usernameStatus === 'taken') { setUsernameError('This username is taken.'); return false; }
    if (usernameStatus === 'checking') { setUsernameError('Please wait while we check availability.'); return false; }
    return true;
  }

  // ── Profile validation ─────────────────────────────────────────────────────

  function validateProfileStep(): boolean {
    const errors: Partial<Record<keyof StepProfileData, string>> = {};
    if (!profileData.display_name.trim()) errors.display_name = 'Display name is required.';
    if (profileData.display_name.length > 100) errors.display_name = 'Max 100 characters.';
    if (!profileData.timezone) errors.timezone = 'Timezone is required.';
    if (profileData.bio.length > 500) errors.bio = 'Max 500 characters.';
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setPhotoError('Please upload a JPEG, PNG, or WebP image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be smaller than 5MB.');
      return;
    }
    const url = URL.createObjectURL(file);
    setProfileData((p) => ({ ...p, photo_file: file, photo_preview: url }));
  }

  // ── Session validation ─────────────────────────────────────────────────────

  function validateSessionStep(): boolean {
    const errors: Partial<Record<keyof StepSessionData, string>> = {};
    if (!sessionData.name.trim()) errors.name = 'Session name is required.';
    if (sessionData.name.length > 100) errors.name = 'Max 100 characters.';
    setSessionErrors(errors);
    return Object.keys(errors).length === 0;
  }

  // ── Availability validation ────────────────────────────────────────────────

  function validateAvailStep(): boolean {
    const hasDay = Object.values(weekData).some((d) => d.enabled);
    if (!hasDay) {
      setAvailError('Please enable at least one day.');
      return false;
    }
    for (let i = 0; i <= 6; i++) {
      const d = weekData[i];
      if (!d) continue;
      if (d.enabled && d.start_time >= d.end_time) {
        setAvailError(`${DAYS[i]}: end time must be after start time.`);
        return false;
      }
    }
    setAvailError(null);
    return true;
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function handleNext() {
    setGlobalError(null);
    if (step === 0 && !validateUsernameStep()) return;
    if (step === 1 && !validateProfileStep()) return;
    if (step === 2 && !validateSessionStep()) return;
    setStep((s) => s + 1);
  }

  // ── Final submission ────────────────────────────────────────────────────────

  async function handleFinish() {
    setGlobalError(null);
    if (!validateAvailStep()) return;
    if (!user) { setGlobalError('Not authenticated. Please log in again.'); return; }

    setSubmitting(true);
    try {
      // Upload photo if provided
      let photo_url: string | null = null;
      if (profileData.photo_file) {
        const ext = profileData.photo_file.name.split('.').pop();
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('booking-avatars')
          .upload(path, profileData.photo_file, { upsert: true });
        if (uploadError) throw new Error(`Photo upload failed: ${uploadError.message}`);
        const { data: urlData } = supabase.storage.from('booking-avatars').getPublicUrl(path);
        photo_url = urlData.publicUrl;
      }

      // Create practitioner record
      const { data: practitioner, error: practError } = await supabase
        .from('practitioners')
        .insert({
          user_id: user.id,
          username: usernameData.username,
          display_name: profileData.display_name.trim(),
          email: user.email!,
          bio: profileData.bio.trim() || null,
          photo_url,
          timezone: profileData.timezone,
        })
        .select()
        .single();
      if (practError) throw new Error(practError.message);

      await refreshPractitioner();

      // Create first session type
      const { error: stError } = await supabase
        .from('session_types')
        .insert({
          practitioner_id: practitioner.id,
          name: sessionData.name.trim(),
          description: sessionData.description.trim() || null,
          duration_minutes: sessionData.duration_minutes,
          buffer_minutes: sessionData.buffer_minutes,
          min_notice_hours: sessionData.min_notice_hours,
          max_advance_days: sessionData.max_advance_days,
          is_active: true,
          sort_order: 0,
        });
      if (stError) throw new Error(stError.message);

      // Create availability rows
      const availRows = Object.entries(weekData)
        .filter(([, d]) => d.enabled)
        .map(([day, d]) => ({
          practitioner_id: practitioner.id,
          day_of_week: parseInt(day),
          start_time: d.start_time,
          end_time: d.end_time,
          is_active: true,
        }));
      if (availRows.length > 0) {
        const { error: availError } = await supabase.from('availability').insert(availRows);
        if (availError) throw new Error(availError.message);
      }

      navigate('/dashboard');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const STEP_TITLES = ['Choose a username', 'Set up your profile', 'Create a session type', 'Set your availability'];
  const STEP_SUBTITLES = [
    'This becomes your public booking URL.',
    'Tell guests a bit about yourself.',
    'What can guests book with you?',
    'When are you available each week?',
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Let&apos;s get you set up</h1>
          <p className="text-gray-500 mt-1 text-sm">4 quick steps and you&apos;re live</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <StepIndicator current={step} total={4} />

          <h2 className="text-xl font-semibold text-gray-900 mb-1">{STEP_TITLES[step]}</h2>
          <p className="text-sm text-gray-500 mb-6">{STEP_SUBTITLES[step]}</p>

          {globalError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
              {globalError}
            </div>
          )}

          {/* ── Step 0: Username ── */}
          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <div className="relative">
                  <input
                    id="username"
                    type="text"
                    value={usernameData.username}
                    onChange={(e) => checkUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                    className={`w-full px-3 py-2.5 pr-10 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${
                      usernameError ? 'border-red-300' : usernameStatus === 'available' ? 'border-green-400' : 'border-gray-300'
                    }`}
                    placeholder="your-username"
                    autoComplete="off"
                  />
                  {usernameStatus === 'checking' && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  )}
                  {usernameStatus === 'available' && !usernameError && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-500">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
                {usernameError && <p className="text-red-600 text-xs mt-1">{usernameError}</p>}
                {usernameStatus === 'taken' && !usernameError && (
                  <p className="text-red-600 text-xs mt-1">This username is already taken.</p>
                )}
                {usernameStatus === 'available' && !usernameError && (
                  <p className="text-green-600 text-xs mt-1">✓ Available!</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  Your booking page will be at <span className="font-mono">yoursite.com/book/{usernameData.username || 'username'}</span>
                </p>
              </div>
            </div>
          )}

          {/* ── Step 1: Profile ── */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Photo upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Photo (optional)</label>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-gray-200 overflow-hidden shrink-0">
                    {profileData.photo_preview ? (
                      <img src={profileData.photo_preview} alt="Preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="photo-upload"
                      className="cursor-pointer inline-flex items-center px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
                    >
                      {profileData.photo_file ? 'Change photo' : 'Upload photo'}
                    </label>
                    <input
                      id="photo-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handlePhotoChange}
                      className="sr-only"
                    />
                    <p className="text-xs text-gray-400 mt-1">JPEG, PNG, or WebP. Max 5MB.</p>
                  </div>
                </div>
                {photoError && <p className="text-red-600 text-xs mt-1">{photoError}</p>}
              </div>

              {/* Display name */}
              <div>
                <label htmlFor="display-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Display name <span className="text-red-500">*</span>
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={profileData.display_name}
                  onChange={(e) => setProfileData((p) => ({ ...p, display_name: e.target.value }))}
                  className={`w-full px-3 py-2.5 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${profileErrors.display_name ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Jane Smith"
                />
                {profileErrors.display_name && <p className="text-red-600 text-xs mt-1">{profileErrors.display_name}</p>}
              </div>

              {/* Timezone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Timezone <span className="text-red-500">*</span>
                </label>
                <TimezoneSelect
                  value={profileData.timezone}
                  onChange={(tz) => setProfileData((p) => ({ ...p, timezone: tz }))}
                />
                {profileErrors.timezone && <p className="text-red-600 text-xs mt-1">{profileErrors.timezone}</p>}
              </div>

              {/* Bio */}
              <div>
                <label htmlFor="bio" className="block text-sm font-medium text-gray-700 mb-1">
                  Bio <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="bio"
                  value={profileData.bio}
                  onChange={(e) => setProfileData((p) => ({ ...p, bio: e.target.value }))}
                  rows={3}
                  maxLength={500}
                  className={`w-full px-3 py-2.5 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${profileErrors.bio ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="Tell guests about yourself..."
                />
                <div className="flex justify-between">
                  {profileErrors.bio ? <p className="text-red-600 text-xs mt-1">{profileErrors.bio}</p> : <span />}
                  <p className="text-xs text-gray-400 mt-1">{profileData.bio.length}/500</p>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: Session Type ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="session-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Session name <span className="text-red-500">*</span>
                </label>
                <input
                  id="session-name"
                  type="text"
                  value={sessionData.name}
                  onChange={(e) => setSessionData((s) => ({ ...s, name: e.target.value }))}
                  className={`w-full px-3 py-2.5 border rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] ${sessionErrors.name ? 'border-red-300' : 'border-gray-300'}`}
                  placeholder="e.g. Discovery Call"
                />
                {sessionErrors.name && <p className="text-red-600 text-xs mt-1">{sessionErrors.name}</p>}
              </div>

              <div>
                <label htmlFor="session-desc" className="block text-sm font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="session-desc"
                  value={sessionData.description}
                  onChange={(e) => setSessionData((s) => ({ ...s, description: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="What will you discuss?"
                />
              </div>

              <div>
                <label htmlFor="duration" className="block text-sm font-medium text-gray-700 mb-1">
                  Duration
                </label>
                <select
                  id="duration"
                  value={sessionData.duration_minutes}
                  onChange={(e) => setSessionData((s) => ({ ...s, duration_minutes: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px] bg-white"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="buffer" className="block text-sm font-medium text-gray-700 mb-1">
                    Buffer (min)
                  </label>
                  <input
                    id="buffer"
                    type="number"
                    min={0}
                    max={120}
                    value={sessionData.buffer_minutes}
                    onChange={(e) => setSessionData((s) => ({ ...s, buffer_minutes: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="notice" className="block text-sm font-medium text-gray-700 mb-1">
                    Notice (hrs)
                  </label>
                  <input
                    id="notice"
                    type="number"
                    min={0}
                    max={8760}
                    value={sessionData.min_notice_hours}
                    onChange={(e) => setSessionData((s) => ({ ...s, min_notice_hours: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>
                <div>
                  <label htmlFor="advance" className="block text-sm font-medium text-gray-700 mb-1">
                    Advance (days)
                  </label>
                  <input
                    id="advance"
                    type="number"
                    min={1}
                    max={365}
                    value={sessionData.max_advance_days}
                    onChange={(e) => setSessionData((s) => ({ ...s, max_advance_days: parseInt(e.target.value) || 30 }))}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">Buffer = gap after each session. Notice = minimum hours before booking. Advance = how far out guests can book.</p>
            </div>
          )}

          {/* ── Step 3: Availability ── */}
          {step === 3 && (
            <div className="space-y-3">
              {availError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm" role="alert">
                  {availError}
                </div>
              )}
              <p className="text-xs text-gray-500">Enable the days you work and set your hours. You can fine-tune later.</p>
              <div className="space-y-2">
                {DAYS.map((dayName, i) => {
                  const day = weekData[i] as DayAvailability;
                  if (!day) return null;
                  return (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${day.enabled ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                      {/* Toggle */}
                      <button
                        type="button"
                        onClick={() => setWeekData((w) => { const c = w[i] as DayAvailability; return { ...w, [i]: { enabled: !c.enabled, start_time: c.start_time, end_time: c.end_time } }; })}
                        className={`relative shrink-0 w-10 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${day.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        aria-label={`Toggle ${dayName}`}
                      >
                        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform absolute top-1 ${day.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                      {/* Day name */}
                      <span className={`w-24 text-sm font-medium shrink-0 ${day.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                        {dayName}
                      </span>
                      {/* Time inputs */}
                      {day.enabled ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="time"
                            value={day.start_time}
                            onChange={(e) => setWeekData((w) => { const c = w[i] as DayAvailability; return { ...w, [i]: { enabled: c.enabled, start_time: e.target.value, end_time: c.end_time } }; })}
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                          />
                          <span className="text-gray-400 text-sm shrink-0">to</span>
                          <input
                            type="time"
                            value={day.end_time}
                            onChange={(e) => setWeekData((w) => { const c = w[i] as DayAvailability; return { ...w, [i]: { enabled: c.enabled, start_time: c.start_time, end_time: e.target.value } }; })}
                            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400 italic">Unavailable</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Navigation buttons ── */}
          <div className="flex items-center justify-between mt-8">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                disabled={submitting}
                className="px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-700 bg-white hover:bg-gray-50 transition-colors min-h-[44px]"
              >
                ← Back
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors min-h-[44px]"
              >
                Continue →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={submitting}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Setting up...
                  </span>
                ) : 'Finish setup →'}
              </button>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        <p className="text-center text-xs text-gray-400 mt-4">Step {step + 1} of 4</p>
      </div>
    </div>
  );
}
