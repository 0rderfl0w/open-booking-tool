# AGENTS.md — open-booking-tool

Self-hosted booking page — own your schedule, ditch the SaaS. A free, open-source alternative to Calendly for individual practitioners.

**Repo:** https://github.com/0rderfl0w/open-booking-tool
**Stack:** React 19 + TypeScript + Tailwind CSS + Supabase + Vercel Serverless Functions

---

## Setup

```bash
npm install
cp .env.example .env   # fill in Supabase + Resend keys
npm run dev            # http://localhost:5173
```

### Database Setup (required first-time)

1. Go to Supabase Dashboard → Database → Extensions → enable `btree_gist`
2. Run `supabase/migrations/001_initial_schema.sql` in SQL Editor
3. Create a public storage bucket named `booking-avatars` in Supabase → Storage

### Deploy

```bash
npm i -g vercel
vercel  # set env vars in Vercel dashboard
```

---

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Tailwind CSS + Vite |
| Backend | Supabase (Postgres + Auth + RLS + Storage) |
| API | Vercel Serverless Functions (`api/`) |
| Email | Resend + React Email templates |
| Calendar | ical-generator (ICS files), google-calendar.ts, apple-calendar.ts |
| Runtime | Node.js 18+ (NOT Bun — uses npm) |

---

## Architecture

- **Public booking page:** `/book/{username}` — clients pick session type, date, time, book
- **Dashboard:** `/dashboard/` — manage bookings, session types, availability, settings
- **API layer:** Vercel serverless functions in `api/` — handle booking mutations server-side
- **Slot engine:** `src/lib/slots.ts` + `api/slots.ts` — computes available time slots from availability config and existing bookings
- **Auth:** Supabase Auth (email/password). RLS policies control data access.
- **Embed widget:** `public/embed.js` — drops an inline or modal booking page into any website

---

## Key Paths

```
api/                         # Vercel serverless functions
├── book.ts                  # POST — create a booking
├── cancel.ts                # POST — cancel a booking
├── slots.ts                 # GET — available time slots
├── health.ts                # GET — health check
├── retry-emails.ts          # POST — retry failed emails
├── send-reminders.ts        # POST — 24h email reminders (planned)
├── booking/[token]/
│   ├── details.ts           # GET — booking details by token
│   └── ics.ts               # GET — download .ics calendar file
├── apple/                   # Apple calendar integration
└── google/                  # Google Calendar integration

emails/                      # React Email templates

src/
├── components/              # Booking wizard + dashboard layout
├── hooks/                   # Auth hook, timezone hook
├── lib/
│   ├── supabase.ts          # Supabase browser client
│   ├── supabase-server.ts   # Supabase server-side client (for API)
│   ├── slots.ts             # Slot computation logic
│   ├── email.tsx            # Email send helpers
│   ├── validation.ts        # Zod schemas
│   ├── constants.ts         # Shared constants
│   ├── sanitize.ts          # Input sanitization
│   ├── google.ts            # Google OAuth helpers
│   ├── google-calendar.ts   # Google Calendar API
│   └── apple-calendar.ts    # Apple Calendar helpers
├── pages/                   # All routes (booking, dashboard, auth)
└── types/                   # TypeScript types

supabase/
└── migrations/              # DB schema (run manually in Supabase SQL Editor)

public/
└── embed.js                 # Embeddable widget loader

vercel.json                  # Routing config for API + SPA
```

---

## Env Vars

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
```

---

## Code Conventions

- TypeScript throughout — no loose JS
- Zod schemas in `src/lib/validation.ts` for all user input
- React Email templates live in `emails/` — rendered server-side in API functions
- Vercel serverless functions are ES modules (`"type": "module"` in package.json)
- RLS enforced at DB level — API functions use service role key for privileged ops, client uses anon key + user JWT

---

## Embed Widget

```html
<!-- Inline mode -->
<div data-booking-widget data-username="your-username"></div>
<script src="https://your-domain.vercel.app/embed.js"></script>

<!-- Modal mode -->
<div data-booking-widget data-username="your-username" data-mode="modal"></div>
<script src="https://your-domain.vercel.app/embed.js"></script>
```

Options: `data-accent` (hex), `data-session` (pre-select session type ID), `data-mode` (`inline` | `modal`).

---

## Gotchas

- **btree_gist extension required** before running migrations — without it, the overlap exclusion constraint fails silently
- **Uses npm, not Bun** — this is a Vercel-targeted project; Bun isn't the runtime here
- **Vercel routing:** `vercel.json` rewrites SPA routes AND api routes — don't break its config
- **Supabase RLS:** Client uses anon key + user JWT. API functions use service role key. Don't mix them up.
- **Timezone handling:** Guest timezone is auto-detected client-side. Slot computation happens server-side in UTC.
- **ICS files:** Generated server-side in `api/booking/[token]/ics.ts` via ical-generator
- **Email templates:** Must be rendered to HTML server-side before sending — don't call React Email render client-side

---

## Roadmap

- [x] Core booking flow (book, confirm, cancel)
- [x] Practitioner dashboard
- [x] Email notifications
- [x] Embed widget (inline + modal)
- [ ] Email reminders (24h before — api/send-reminders.ts exists, needs wiring)
- [ ] Google Calendar integration (conflict checking + auto-events)
