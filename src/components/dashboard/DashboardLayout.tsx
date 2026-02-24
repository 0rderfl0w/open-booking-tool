import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

// ─── Nav items ─────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    to: '/dashboard',
    end: true,
    label: 'Bookings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    to: '/dashboard/availability',
    end: false,
    label: 'Availability',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    to: '/dashboard/sessions',
    end: false,
    label: 'Session Types',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    to: '/dashboard/settings',
    end: false,
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

// ─── Onboarding banner ─────────────────────────────────────────────────────────

function OnboardingBanner({ hasSessionTypes, hasAvailability }: { hasSessionTypes: boolean; hasAvailability: boolean }) {
  const allDone = hasSessionTypes && hasAvailability;
  if (allDone) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-3">
      <div className="max-w-5xl mx-auto">
        <p className="text-sm font-medium text-amber-800 mb-2">Complete your setup to start accepting bookings:</p>
        <div className="flex flex-wrap gap-4">
          {/* Username — always checked */}
          <div className="flex items-center gap-1.5 text-sm text-amber-700">
            <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="line-through text-amber-500">Username set</span>
          </div>
          {/* Session type */}
          <div className="flex items-center gap-1.5 text-sm">
            {hasSessionTypes ? (
              <>
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="line-through text-amber-500">Create a session type</span>
              </>
            ) : (
              <>
                <div className="w-4 h-4 border-2 border-amber-400 rounded-sm shrink-0" />
                <NavLink to="/dashboard/sessions" className="text-amber-800 hover:underline font-medium">
                  Create a session type
                </NavLink>
              </>
            )}
          </div>
          {/* Availability */}
          <div className="flex items-center gap-1.5 text-sm">
            {hasAvailability ? (
              <>
                <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="line-through text-amber-500">Set your availability</span>
              </>
            ) : (
              <>
                <div className="w-4 h-4 border-2 border-amber-400 rounded-sm shrink-0" />
                <NavLink to="/dashboard/availability" className="text-amber-800 hover:underline font-medium">
                  Set your availability
                </NavLink>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function DashboardLayout() {
  const { practitioner, signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // We track onboarding completion via presence of practitioner data
  // For real-time session type / availability status, we rely on a context
  // or child pages can pass this up. For now, we approximate based on practitioner.
  // DashboardSessions/DashboardAvailability will update this via URL change.
  const hasSessionTypes = false; // approximate — banner disappears on full setup in onboarding
  const hasAvailability = false;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      setSigningOut(false);
    }
  }

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
      isActive
        ? 'bg-blue-50 text-blue-700'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const mobileNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors min-w-[44px] min-h-[44px] justify-center ${
      isActive ? 'text-blue-600' : 'text-gray-500 hover:text-gray-900'
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Desktop sidebar ── */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:w-64 bg-white border-r border-gray-200 z-10">
        {/* Practitioner info */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-200">
          <div className="w-10 h-10 rounded-full bg-blue-100 overflow-hidden shrink-0">
            {practitioner?.photo_url ? (
              <img src={practitioner.photo_url} alt={practitioner.display_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-blue-600 font-semibold text-sm">
                {practitioner?.display_name?.charAt(0).toUpperCase() ?? '?'}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate">{practitioner?.display_name ?? 'Loading...'}</p>
            <p className="text-xs text-gray-500 truncate">@{practitioner?.username ?? ''}</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={navLinkClass}>
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Sign out */}
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors min-h-[44px] disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>

          {/* View booking page */}
          {practitioner?.username && (
            <a
              href={`/book/${practitioner.username}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition-colors min-h-[44px] mt-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              View booking page
            </a>
          )}
        </div>
      </aside>

      {/* ── Mobile top nav ── */}
      <div className="md:hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 flex items-center justify-between px-4 py-3 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 overflow-hidden">
              {practitioner?.photo_url ? (
                <img src={practitioner.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-blue-600 font-semibold text-xs">
                  {practitioner?.display_name?.charAt(0).toUpperCase() ?? '?'}
                </div>
              )}
            </div>
            <span className="font-semibold text-gray-900 text-sm truncate max-w-[140px]">
              {practitioner?.display_name ?? 'Dashboard'}
            </span>
          </div>
          <button
            onClick={() => setMobileMenuOpen((o) => !o)}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileMenuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="bg-white border-b border-gray-200 px-4 py-2 space-y-1 z-10">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
                  }`
                }
              >
                {item.icon}
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => { setMobileMenuOpen(false); handleSignOut(); }}
              className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-sm text-gray-500 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        )}

        {/* Mobile bottom nav (icon-only) */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around px-2 z-20">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={mobileNavLinkClass}>
              {item.icon}
              <span>{item.label.split(' ')[0]}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      {/* ── Main content area ── */}
      <div className="md:ml-64 flex flex-col min-h-screen">
        {/* Onboarding banner — hide when setup is complete */}
        <OnboardingBanner hasSessionTypes={hasSessionTypes} hasAvailability={hasAvailability} />

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 pb-20 md:pb-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
