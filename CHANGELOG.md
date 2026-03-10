## 2026-03-10
- Backport production fixes: sanitize without DOM, await side effects, Apple Calendar upsert, lazy Resend init, origin validation, configurable FROM_EMAIL, PUBLIC_ env prefix support (Alex)
- Feature: short booking links with database-driven resolution and multi-practitioner disambiguation (Alex)
- Feature: cancel route with redirect to existing cancel flow (Alex)
- Feature: email signature component with practitioner social links (Alex)
- Feature: dashboard settings for social link management (Alex)
- Migration: 005_practitioner_social adds website, linkedin_url, twitter_url columns (Alex)
- Fix: AGENTS.md branding cleanup (Alex)

## 2026-03-10
- Phase 7 Feature 1: Short booking links — added /book/:sessionSlug and /book/:username/:sessionSlug routes. nameToSlug utility, BookingPage rewrite with async resolution (username-first, then slug, disambiguation for conflicts), README short-link docs (Alex)

## 2026-02-28
- Phase 3: Added Apple Calendar settings UI to DashboardSettings.tsx — 3-state UI (disconnected/calendar-picker/connected), auth error banner, risk disclosure, bidirectional sync warning. Created api/apple/connect.ts and api/apple/disconnect.ts (Alex)

## 2026-02-28
- Phase 2: Wired Apple Calendar into api/slots.ts (parallel fetch), api/book.ts (event creation), api/cancel.ts (event deletion) (Alex)

# Changelog

## 2026-02-28
- Phase 1: iCloud CalDAV foundation — installed tsdav + node-ical, added supabase/migrations/004_apple_calendar.sql, updated src/types/database.ts with Apple fields (4 interfaces), created src/lib/apple-calendar.ts with full circuit breaker (Alex)

## 2026-02-25 (night)

### Google Calendar Integration (Razor & Blade)
- Added OAuth connect/disconnect flow via `/api/google/connect`, `/api/google/callback`, `/api/google/disconnect`
- Added calendar list fetch via `/api/google/calendars` for calendar selector
- Added auto-event creation on booking via `src/lib/google-calendar.ts`
- Added auto-event deletion on cancellation
- Added conflict checking in slot engine (filters out Google Calendar events as busy periods)
- Added circuit breaker: disables integration after 5 failures in 15 minutes
- Added migration 003: adds `google_refresh_token` column to `practitioner_credentials`
- Updated DashboardSettings with full Google Calendar UI (connect/disconnect/select calendar)
- All passes `npx tsc --noEmit` with zero errors

## 2026-02-25 (evening)

### Email Reminders + Rate Limiting (Razor & Blade)
- Added 24-hour reminder emails for guests (ReminderEmail.tsx)
- Added daily digest emails for practitioners (DailyDigestEmail.tsx)
- Added email retry system for failed confirmations (api/retry-emails.ts)
- Added cron job for sending reminders hourly (api/send-reminders.ts)
- Added per-email rate limiting in book.ts — max 3 bookings per email per day (Postgres-based)
- Added Email Reminders toggle in DashboardSettings UI
- Added CRON_SECRET auth for API endpoints
- Added pg_cron setup instructions in migration SQL (run manually in Supabase dashboard)
- Migration 002_email_reminders.sql: adds `email_reminders_enabled` to practitioners, `email_retry_count` to bookings
- All passes `npx tsc --noEmit` with zero errors

## 2026-02-25 (late)

### Repo Setup (Razor & Blade)
- Created GitHub repo: https://github.com/0rderfl0w/open-booking-tool
- Added README.md with full setup guide, project structure, embed docs, roadmap
- Added MIT LICENSE (copyright: Build to Own Club)
- Pushed all commits to GitHub

## 2026-02-25

### Embed Widget — Phases 1-3 (Razor & Blade)
- Phase 1: Extracted BookingWizard component from BookingPage — wizard logic now reusable
  - Props: `username`, `embed`, `accentColor`, `preSelectedSessionTypeId`, `onComplete`, `onClose`, `onError`
  - BookingPage.tsx now wraps BookingWizard with full page chrome
- Phase 2: Built EmbedPage at `/embed/:username` — iframe-optimized booking flow
  - Reads `?accent`, `?session`, `?parentOrigin` query params
  - Emits postMessages: `booking:loaded`, `booking:resize`, `booking:complete`, `booking:close`, `booking:error`
  - ResizeObserver on content wrapper for dynamic height
  - Security: omits bookingToken from complete event if parentOrigin unknown
- Phase 3: Created `public/embed.js` — vanilla JS embed script
  - Inline mode: iframe with loading skeleton, 10s timeout fallback
  - Modal mode: trigger button, fullscreen overlay, iOS scroll lock, Escape/backdrop close
  - MutationObserver for SPA support
  - Public API: `BookingWidget.open()`, `BookingWidget.close()`, `BookingWidget.on()`, `BookingWidget.off()`
- All phases pass `npx tsc --noEmit` with zero errors

### Dashboard Polish (Razor & Blade)
- Fix: onboarding banner now queries real data (session_types + availability counts) instead of hardcoded `false` — banner disappears when setup is complete
- Fix: GoTrueClient dual-instance warning resolved via separate `storageKey` on `supabasePublic` client
- Removed dead code: `src/lib/ics.ts` (unused, real ICS impl is in `api/booking/[token]/ics.ts`)
- Confirmed NOT a bug: "Username set" always checked is correct per spec (username required at signup)
- Confirmed already built: embed code UI in Settings (inline/modal toggle, color picker, copy button)
- Confirmed already built: bookings empty state with "Share booking page" CTA

### Bug Fixes (Razor & Blade)
- Fix: `isBodyTooLarge()` in slots, cancel, and ICS endpoints passed full `req` object instead of `req.body` — caused `Converting circular structure to JSON` errors
- Fix: `book.ts` used `req.socket.remoteAddress` without optional chaining — caused crash when socket undefined
- Fix: Removed misleading "email would be sent" stub log in cancel.ts (emails were actually sending)
- All prior session fixes committed: supabasePublic client, simpleLock mutex, booking-avatars bucket name, public_practitioners view for username check

### Smoke Test — PASSED ✅ (Z manual testing)
- Full booking flow: book appointment → confirmation page → emails sent ✅
- Booking detail page: date/time/timezone/duration/notes/guest details render correctly ✅
- Dashboard bookings: upcoming + past sections, cancel button working ✅
- Practitioner-side cancellation: booking moves to "Past" as "Cancelled" ✅
- Guest-side cancellation: public booking page shows "Cancelled" status ✅
- Email notifications: booking confirmed, booking cancelled — all received ✅
- Console: only expected warning (multiple GoTrueClient instances from dual client design)

## 2026-02-24

### Smoke Test Results (Razor & Blade)
- Login: ✅ PASS - Email/password sign-in works
- Dashboard: ⚠️ PARTIAL - Shows loading states due to missing practitioner record (406 error on Supabase query)
- Session Types: ❌ FAIL - Empty main area, requires practitioner ID
- Availability: ❌ FAIL - Empty main area, requires practitioner data
- Settings: ❌ FAIL - Shows "Loading..." due to null practitioner
- Onboarding: ⚠️ PARTIAL - Accessible but username availability check hangs
- Public Booking Page: ❌ NOT TESTED - No practitioner record exists for test user

**Root Cause:** Test user has no practitioner record in database. App queries practitioner with `.single()` which returns 406 when no rows exist.

### Phase 1 — What's Done
- Project scaffold: Vite + React 19 + TypeScript + Tailwind CSS
- Supabase migration: all tables, triggers, indexes, constraints, RLS
- Shared types, Zod validation schemas, constants
- Slot calculation engine (availability + date overrides + bookings)
- API routes: health, slots, book, cancel, booking details, ICS download
- Rate limiting middleware (Upstash, graceful fallback when unconfigured)
- Turnstile bot protection (graceful fallback when unconfigured)
- XSS sanitization for user-provided text
- Reserved username validation
- Public booking page (`/book/:username`) — 5-step wizard with timezone detection
- Booking confirmation page (`/booking/:token`) with cancel + ICS download
- Email integration: Resend SDK + React Email templates (confirmation, cancellation, practitioner notification)
- ICS calendar invite generation via ical-generator
- Dashboard: bookings, availability (multi-window), session types (CRUD), settings
- Onboarding flow: username → profile → session type → availability
- Login/signup pages with Supabase PKCE auth
- Empty state components
- 0 TypeScript errors, clean build

### Phase 1 — Deferred (needs account setup)
- **Sentry** — error tracking, needs sentry.io project + DSN
- **Cloudflare Turnstile** — bot protection, needs Cloudflare site key + secret (code is in place, just no keys)
- **Upstash Redis** — rate limiting backend, needs upstash.com database + credentials (code is in place, just no keys)

### Implementation Notes
- Fixed DashboardAvailability.tsx: `as DayData` casts, removed unused imports, explicit full-object construction in setWeekData callbacks (Razor & Blade)

## 2026-02-24
- Fixed 16 TypeScript errors in OnboardingPage.tsx: added `?.` optional chaining on `errors[0]` accesses (lines 207/233), added `if (!d) continue` guard in `validateAvailStep` for-loop (line 289), added `if (!day) return null` guard in availability JSX map and non-null assertions (`!`) on `w[i]` in all three `setWeekData` callbacks (lines 659–686) (Razor & Blade)
- Fixed remaining TypeScript errors in API routes: removed unused `_turnstile_token` from api/book.ts, fixed Supabase join type casting in api/booking/[token]/details.ts (added `unknown` cast), fixed ical-generator v8 API in api/booking/[token]/ics.ts (removed invalid `method`/`uid` event options, removed unused `event` variable) (Razor & Blade)

## 2026-02-24
- Fixed TypeScript errors in shared libs: removed unused `RATE_LIMITS` import from api-helpers.ts, typed `window` param as `Duration` from @upstash/ratelimit, removed unused `formatTz` import from slots.ts, prefixed unused stub params with `_` in ics.ts (Razor & Blade)

## 2026-02-24
- Implemented full 5-step booking wizard (BookingPage.tsx) with useReducer state management
- Implemented booking confirmation page (BookingConfirmationPage.tsx) with cancel functionality  
- Created shared booking components: WizardProgress, SessionTypeCard, TimeSlotGrid, GuestDetailsForm, BookingSummary
- Created reusable EmptyState component
- Created useTimezone hook for auto-detection and timezone validation
- Created API endpoint for booking details lookup (api/booking/[token]/details.ts)
- Created API endpoint for ICS calendar download (api/booking/[token]/ics.ts)
- Added Turnstile widget integration for bot protection on booking confirmation
- All components use Tailwind CSS with mobile-first responsive design
- Accessibility: focus management, ARIA labels, keyboard navigation, 44x44px touch targets

## 2026-03-10
- feat: phase 5 — feature 3 cancel route — `/cancel/:token` redirects to `/booking/:token?cancel=true`, auto-opens cancel dialog, fixed broken ReminderEmail cancel link, added cancel link to ConfirmationEmail (Alex)
