# AGENTS.md — Open Booking Tool

> Self-hosted booking page — own your schedule, ditch the SaaS. Open-source Calendly alternative.

**Live:** Deploy on Vercel
**Repo:** `0rderfl0w/open-booking-tool` (GitHub, public)

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Supabase (Postgres, Auth, RLS, Storage) |
| API | Vercel Serverless Functions (`/api/`) |
| Email | Resend + React Email |
| Calendar | ical-generator (ICS invites) |
| Runtime | Bun |

## Setup

```bash
bun install
cp .env.example .env.local   # fill in Supabase + Resend keys
bun run dev                   # localhost:5173
```

## Project Structure

```
├── src/
│   ├── pages/           # Public booking page, dashboard, auth
│   ├── components/      # UI components
│   ├── lib/             # Supabase client, utils
│   └── types/           # TypeScript types
├── api/                 # Vercel serverless functions (book, cancel, slots, apple/)
├── supabase/
│   └── migrations/      # DB migrations (001-005)
├── emails/              # React Email templates
└── public/
```

## Key Features

- Public booking at `/book/:username`
- Dashboard: bookings, session types, availability, settings
- Email notifications (confirmation + cancellation)
- Embed widget (inline or modal)
- ICS calendar invites
- Timezone-aware booking
- Apple Calendar integration (WIP: `api/apple/`, migration 004)

## Supabase

- Auth: email/password
- RLS enabled on all tables
- Migrations in `supabase/migrations/`
- Storage for assets

## Deploy

Vercel auto-deploys from `main` branch. Supabase migrations run manually via CLI.

## Gotchas

- Supabase free tier can 504 if project is idle — retry after 30s
- RLS must have policies or queries return empty
- Apple Calendar integration is WIP (migration 004 not yet applied in prod)
- Vercel Hobby has 10s timeout. Awaiting email side effects can get tight — Vercel Pro (60s) recommended for production

## Vercel Deployment Gotchas

- **Serverless async:** Await side effects (email, calendar) before returning response. Increases latency — Vercel Pro (60s timeout) recommended for production.
- **DOM deps:** `isomorphic-dompurify` crashes on serverless (no jsdom available). Use regex sanitization instead.
- **Lazy init:** Module-level `new Resend(undefined)` crashes on cold start. Use a `getResend()` factory pattern.
- **Apple Calendar:** `tsdav` has an ESM/CJS compatibility issue on Vercel. Apple Calendar integration is non-functional on serverless.
- **Rate limiting:** `api/book.ts` uses an in-memory rate limiter (resets on cold start). `api/cancel.ts` uses Upstash Redis when `UPSTASH_REDIS_REST_URL` is configured.
