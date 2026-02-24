# Changelog

## 2026-02-24

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
