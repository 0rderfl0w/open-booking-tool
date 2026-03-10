# Open Booking Tool

> Self-hosted booking page — own your schedule, ditch the SaaS.

A free, open-source alternative to Calendly for individual practitioners. You host it, you own the data, you keep the money you'd spend on SaaS subscriptions.

Built as part of [Build to Own Club](https://buildtoown.club) — learn to build the tools you use instead of renting them.

## What You Get

- **Public booking page** at `/book/your-username` — clients pick a session type, date, time, and book
- **Dashboard** — manage bookings, session types, availability, and settings
- **Email notifications** — confirmation and cancellation emails via Resend
- **Embed widget** — drop your booking page into any website (inline or modal)
- **ICS calendar invites** — downloadable `.ics` files for every booking
- **Timezone-aware** — automatic timezone detection for guests
- **Short booking links** — direct links to specific session types via slug

## Short Booking Links

Clients can book a specific session type directly without navigating through the session picker.

| Format | Example | Behaviour |
|--------|---------|-----------|
| `/book/:username` | `/book/alice` | Opens booking page — client picks session type |
| `/book/:sessionSlug` | `/book/discovery-call` | Resolves slug to session type automatically |
| `/book/:username/:sessionSlug` | `/book/alice/discovery-call` | Direct link to one practitioner + session type |

Slugs are derived from session type names at runtime: `"Discovery Call"` → `discovery-call`.

> **Known limitation:** If a session type is renamed, existing short links will break. Use the practitioner URL (`/book/:username`) for permanent links.

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Backend | Supabase (Postgres, Auth, RLS, Storage) |
| API | Vercel Serverless Functions |
| Email | Resend + React Email |
| Calendar | ical-generator |

**Monthly cost on free tiers: $0**

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Supabase](https://supabase.com/) project (free tier works)
- A [Resend](https://resend.com/) account (free tier: 100 emails/day)
- A [Vercel](https://vercel.com/) account for deployment (free tier works)

### Setup

1. **Clone the repo**

   ```bash
   git clone https://github.com/0rderfl0w/open-booking-tool.git
   cd open-booking-tool
   npm install
   ```

2. **Create your `.env`**

   ```bash
   cp .env.example .env
   ```

   Fill in your Supabase URL, anon key, service role key, and Resend API key.

3. **Run the database migration**

   Go to your Supabase Dashboard → SQL Editor and run the contents of:

   ```
   supabase/migrations/001_initial_schema.sql
   ```

   > ⚠️ Enable the `btree_gist` extension first: Dashboard → Database → Extensions → search "btree_gist" → Enable

4. **Create the storage bucket**

   In Supabase Dashboard → Storage, create a bucket called `booking-avatars` (public).

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:5173/` — sign up, complete onboarding, and you're live.

### Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Set your environment variables in the Vercel dashboard. The `vercel.json` config handles routing for the serverless API functions.


## Deployment

### Vercel Setup

1. Import the repo into [Vercel](https://vercel.com/)
2. **Framework preset:** Vite
3. **Build command:** `npm run build` (default)
4. **Environment variables:** Add all keys from `.env.example` in the Vercel dashboard

> **Important:** Run `supabase/migrations/` in order before deploying code changes.

### Environment Variable Prefixes

Vite exposes client-side vars via `VITE_` prefix. If you're using Astro or SvelteKit, use the appropriate public prefix instead:

| Variable | Vite | Astro / SvelteKit |
|----------|------|-------------------|
| Supabase URL | `VITE_SUPABASE_URL` | `PUBLIC_SUPABASE_URL` |
| Supabase Anon Key | `VITE_SUPABASE_ANON_KEY` | `PUBLIC_SUPABASE_ANON_KEY` |
| Turnstile Site Key | `VITE_TURNSTILE_SITE_KEY` | `PUBLIC_TURNSTILE_SITE_KEY` |

The API functions also accept `SUPABASE_URL` and `SUPABASE_ANON_KEY` (no prefix) as fallbacks.

### Resend Email Setup

1. Sign up at [resend.com](https://resend.com/)
2. Verify your sending domain (DNS records required)
3. Add your API key as `RESEND_API_KEY`
4. Optionally set `FROM_EMAIL` to customise the sender name/address:
   ```
   FROM_EMAIL=Bookings <noreply@yourdomain.com>
   ```
   Defaults to `Bookings <onboarding@resend.dev>` if unset.

### Cancel Flow

Booking confirmation emails include a cancel link. The `/cancel/:token` route redirects to the booking confirmation page with the cancel dialog pre-opened. No separate cancel page required.

### Short Booking Links

| Format | Example | Behaviour |
|--------|---------|-----------|
| `/book/:username` | `/book/alice` | Opens booking page — client picks session type |
| `/book/:sessionSlug` | `/book/discovery-call` | Resolves slug to session type automatically |
| `/book/:username/:sessionSlug` | `/book/alice/discovery-call` | Direct link — most durable format |

> **Known limitation:** If a practitioner renames a session type, existing short links using the old slug will stop working. The full URL format `/book/username/session-slug` is more durable.

### Email Customisation

- Set `FROM_EMAIL` env var to control the sender name and address
- Add social links (website, LinkedIn, Twitter) in Dashboard → Settings — these appear in email signatures

### Apple Calendar (Self-Hosted Only)

1. Generate an [app-specific password](https://appleid.apple.com/) for your iCloud account
2. Add `APPLE_ICLOUD_EMAIL` and `APPLE_ICLOUD_APP_PASSWORD` to your env
3. Connect in Dashboard → Settings → Apple Calendar

> **Note:** The `tsdav` library has an ESM/CJS compatibility issue on Vercel. Apple Calendar sync is non-functional on Vercel serverless — it works in local dev and traditional Node.js hosting.

## Project Structure

```
├── api/                    # Vercel serverless functions
│   ├── book.ts             # POST — create a booking
│   ├── cancel.ts           # POST — cancel a booking
│   ├── slots.ts            # GET — available time slots
│   ├── health.ts           # GET — health check
│   └── booking/[token]/
│       ├── details.ts      # GET — booking details
│       └── ics.ts          # GET — download .ics file
├── emails/                 # React Email templates
├── public/
│   └── embed.js            # Embeddable widget loader
├── src/
│   ├── components/         # Booking wizard + dashboard layout
│   ├── hooks/              # Auth + timezone hooks
│   ├── lib/                # Supabase clients, slot engine, validation
│   ├── pages/              # All routes (booking, dashboard, auth)
│   └── types/              # TypeScript types + Zod schemas
├── supabase/
│   └── migrations/         # Database schema
└── vercel.json             # Vercel routing config
```

## Embedding on Your Website

Add the embed widget to any page:

```html
<!-- Inline mode -->
<div data-booking-widget data-username="your-username"></div>
<script src="https://your-domain.vercel.app/embed.js"></script>

<!-- Modal mode (button trigger) -->
<div data-booking-widget data-username="your-username" data-mode="modal"></div>
<script src="https://your-domain.vercel.app/embed.js"></script>
```

Options: `data-accent` (hex color), `data-session` (pre-select session type ID), `data-mode` (`inline` or `modal`).

## Roadmap

- [x] Core booking flow (book, confirm, cancel)
- [x] Practitioner dashboard (bookings, sessions, availability, settings)
- [x] Email notifications (confirmation + cancellation)
- [x] Embed widget (inline + modal)
- [ ] Email reminders (24h before appointment)
- [ ] Google Calendar integration (conflict checking + auto-events)

## License

MIT — see [LICENSE](./LICENSE).

## Built With

Part of the [Build to Own Club](https://buildtoown.club) curriculum. Stop renting your tools. Start owning them.
