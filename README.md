# GridPulse ⚡

> Crowdsourced real-time power outage tracker for Sri Lanka — built mobile-first, works offline, and fuses official CEB data with community reports.

**කරන්ට් කට්** (Sinhala for "power cut") is a PWA that helps Sri Lankans answer one simple question: **"Is there power at my place right now — and if not, when will it be back?"**

It combines three data sources into one clear picture:

1. **Official CEB data** — scraped from CEB's public `/Incognito/*` endpoints (breakdowns, scheduled load shedding, planned maintenance)
2. **Neighborhood reports** — anonymous crowdsourced reports enriched with population and place data
3. **Historical analytics** — per-area outage frequency, average restore times, and peak hours

The backend fetches CEB data **lazily and on-demand** from user requests, not on a proactive schedule. This keeps load on CEB minimal and eliminates the risk of IP-based blocking.

---

## Screenshots

| Home | Map | Stats | Report |
|---|---|---|---|
| ![Home](docs/screenshots/home.png) | ![Map](docs/screenshots/map.png) | ![Stats](docs/screenshots/stats.png) | ![Report](docs/screenshots/report.png) |

---

## Features

- **📍 "Is my power out?"** — instant status card with distance from the nearest outage, started-ago, neighbors affected, and historical restoration estimate
- **🗺️ Live map** — MapLibre + OpenFreeMap with CEB outage polygons (Chaikin-smoothed) and crowd report markers, togglable independently
- **🔍 Location search** — pick any city in Sri Lanka via GeoPop if auto-detection is wrong
- **✍️ Anonymous reporting** — tap the **+** FAB to report a power cut at your current location, automatically enriched with place name and population affected
- **🤝 Fusion** — crowd reports that land inside an active CEB polygon are auto-linked so users see one story, not duplicates
- **📊 Analytics** — island-wide and per-area stats: active count, trend vs yesterday, worst-hit areas, 7d/30d frequency, avg duration, hourly distribution
- **🌐 Trilingual** — English, සිංහල, தமிழ் — full translations for every visible string
- **🎭 Pseudonym identity** — random friendly name (e.g. "Eager Peacock") + device UUID, stored only in `localStorage`. No signup, no tracking
- **📱 PWA** — installable, offline-first service worker caches map tiles, API responses, and locale files
- **📡 Offline report queue** — reports submitted during an outage queue to IndexedDB and sync automatically when connectivity returns
- **🌙 Dark / light theme** — auto-detected, toggle with the sun/moon button or press `d`

---

## Tech stack

**Frontend** — Vite · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · TanStack Query · Zustand (with `persist`) · MapLibre GL · Recharts · i18next · Motion · `idb` · vite-plugin-pwa

**Backend** — Cloudflare Workers · Hono · D1 (SQLite) · Durable Objects (ready for real-time) · Web Crypto

**External APIs** — CEB public `/Incognito/*` endpoints · self-hosted GeoPop (`github.com/theetaz/geopop`) for reverse geocoding, population exposure, and city search

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Browser (PWA)                        │
│   React · TanStack Query · MapLibre · i18next        │
│                                                      │
│  • Talks only to /api/* — never directly to CEB      │
│  • Persists device id + pseudonym + manual location  │
│  • Offline report queue in IndexedDB                 │
└──────────────────┬──────────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────────┐
│              Cloudflare Worker (Hono)                │
│                                                      │
│  GET  /api/outages/near  → pollAreasNear(lat, lon)   │
│       └─ TTL cache in D1 (10 min)                    │
│       └─ Cache miss → fetch CEB → upsert → return    │
│  POST /api/outages/report → GeoPop enrich + fusion   │
│  POST /api/outages/:id/confirm                       │
│  GET  /api/status?lat=&lon=                          │
│  GET  /api/analytics/{island,:areaId}                │
│  GET  /api/geocode/search?q=                         │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
           ▼                          ▼
     ┌──────────┐              ┌──────────────┐
     │    D1    │              │   GeoPop     │
     │ (SQLite) │              │  (self-host) │
     └──────────┘              └──────┬───────┘
           ▲                          │
           │ lazy, on-demand only     │
           │                          │
           ▼                          ▼
┌─────────────────────────────────────────────────────┐
│              cebcare.ceb.lk/Incognito/*              │
│   Public, unauthenticated OMS feed                   │
└─────────────────────────────────────────────────────┘
```

**Key design decision: cache-first, user-driven CEB fetches.** Instead of polling all 45 CEB areas on a cron, the worker only fetches an area when a user's location is within 40 km of it, and caches the result for 10 minutes. This keeps load on CEB proportional to actual user interest and makes IP blocking effectively impossible.

---

## Project structure

```
.
├── src/                       # React frontend (Vite)
│   ├── components/
│   │   ├── ui/                #  shadcn/ui primitives
│   │   ├── layout/            #  AppShell, Header, BottomNav
│   │   ├── map/               #  OutageMap, MapControls
│   │   ├── home/              #  StatusCard, NearbyOutages
│   │   ├── outage/            #  ReportSheet, OutageDetailSheet
│   │   └── common/            #  LanguageSwitcher, ThemeToggle, LocationSearch, ProfileMenu
│   ├── pages/                 #  HomePage, MapPage, FeedPage, StatsPage
│   ├── hooks/                 #  useOutages, useLocation, useGeolocation, usePowerStatus, useAnalytics, useDisplayName, useGeocodeSearch
│   ├── stores/                #  Zustand app store (tab, selection, location override, layer toggles)
│   ├── lib/                   #  api, i18n, queryClient, profile, offlineQueue, format, geo-helpers
│   └── types/                 #  Shared API wire types
├── public/
│   ├── icon.svg               #  PWA icon
│   └── locales/               #  en/si/ta translation JSON
├── worker/                    # Cloudflare Worker backend
│   ├── src/
│   │   ├── routes/            #  outages, areas, analytics, status, geocode
│   │   ├── services/          #  ceb.service (cache-aware), geopop.service, analytics.service
│   │   ├── cron/              #  ceb-parser (fetch/retry/backoff), ceb-poller (batch dev trigger)
│   │   ├── durable-objects/   #  AreaRoom (wired, unused in v1)
│   │   ├── db/                #  schema.sql + seed-areas.sql (auto-generated)
│   │   ├── utils/             #  geo (haversine, bounding box)
│   │   └── types/             #  Env bindings, CEB wire types
│   ├── scripts/               #  seed-areas.js, poll-all.js (dev helper)
│   └── wrangler.toml          #  Worker config (cron disabled by design)
└── docs/screenshots/          # README images
```

---

## Local development

### Prerequisites

- Node.js 20+
- npm
- A running GeoPop instance (defaults to `http://localhost:8990`)
  - Source: [github.com/theetaz/geopop](https://github.com/theetaz/geopop)

### Setup

```bash
git clone <your-repo-url> gridpulse
cd gridpulse
npm install
cd worker && npm install && cd ..
```

### Initialize the local D1 database

```bash
cd worker
npm run db:migrate:local   # create tables
npm run db:seed:fetch      # fetch 45 CEB areas + resolve centroids via GeoPop
npm run db:seed:local      # apply seed data to local D1
cd ..
```

### Run the worker + frontend

```bash
# Terminal 1: backend worker (port 8787)
cd worker && npm run dev

# Terminal 2: frontend Vite dev server (port 5173)
npm run dev
```

Open **http://localhost:5173** — the app talks to the worker through Vite's `/api` proxy, so there's no CORS setup needed.

### Useful dev commands

```bash
# Worker
cd worker
npm run typecheck            # tsc --noEmit
npm run poll:all             # bulk-warm the cache with every CEB area
                             # (useful before demos; normally handled lazily)

# Frontend (from repo root)
npm run typecheck
npm run build
npm run lint
```

### Poking the worker directly

```bash
# Get nearest outages for a coordinate (lazy cache-first)
curl 'http://127.0.0.1:8787/api/outages/near?lat=6.9271&lon=79.8612&radius=40&limit=5'

# Is there power at my place?
curl 'http://127.0.0.1:8787/api/status?lat=6.9271&lon=79.8612'

# Island-wide analytics
curl 'http://127.0.0.1:8787/api/analytics/island'

# Search Sri Lankan cities
curl 'http://127.0.0.1:8787/api/geocode/search?q=kandy'

# Submit a crowd report (requires x-device-id)
curl -X POST 'http://127.0.0.1:8787/api/outages/report' \
  -H 'Content-Type: application/json' \
  -H 'x-device-id: dev-test' \
  -d '{"lat":6.9271,"lon":79.8612,"type":"unplanned","description":"Lights went off 10 min ago"}'

# Force-refresh a specific area (dev only, bypasses TTL)
curl -X POST 'http://127.0.0.1:8787/__dev/poll-ceb?area=02'
```

---

## Environment variables

**None of these contain secrets in development.** Production secrets are set via `wrangler secret put`, never committed.

### Frontend (optional, via `.env.local` — gitignored)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_URL` | `""` (same origin via proxy) | Override the worker origin. Useful if the frontend is hosted separately. |

### Worker (`worker/wrangler.toml` `[vars]`)

| Variable | Default | Purpose |
|---|---|---|
| `GEOPOP_URL` | `http://localhost:8990` | URL of your GeoPop instance. Change to your production GeoPop endpoint before deploying. |
| `CEB_BASE_URL` | `https://cebcare.ceb.lk` | CEB Care base URL. Rarely changes. |

### Worker secrets (set via `wrangler secret put <NAME>`)

None are required for v1. The following are reserved for future features:

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — Web Push notifications
- `CEB_USERNAME` / `CEB_PASSWORD` — optional enhanced CEB endpoints (JWT auth)

---

## Deployment (Cloudflare)

All deployment happens through your own Cloudflare account. No sensitive data leaves your machine.

### 1. One-time account setup

```bash
cd worker
npx wrangler login       # opens a browser, signs into your account
```

### 2. Create the D1 database + apply schema

```bash
# In worker/
npx wrangler d1 create gridpulse
# ↑ prints a database_id — copy it

# Paste the returned database_id into worker/wrangler.toml:
#   [[d1_databases]]
#   binding = "DB"
#   database_name = "gridpulse"
#   database_id = "<paste-it-here>"

npm run db:migrate:remote     # applies src/db/schema.sql to production D1
npm run db:seed:fetch         # fetches CEB areas + GeoPop centroids
npm run db:seed:remote        # applies the seed to production D1
```

### 3. Update the GeoPop URL for production

Edit `worker/wrangler.toml`:

```toml
[vars]
GEOPOP_URL = "https://your-geopop-host.example.com"
CEB_BASE_URL = "https://cebcare.ceb.lk"
```

GeoPop must be publicly reachable from Cloudflare Workers. Deploy it yourself ([github.com/theetaz/geopop](https://github.com/theetaz/geopop)) on a VPS, Fly.io, Render, or similar.

### 4. Deploy the worker

```bash
# Still in worker/
npx wrangler deploy
```

Wrangler prints the deployed URL, e.g. `https://gridpulse-api.<your-subdomain>.workers.dev`.

### 5. Deploy the frontend to Cloudflare Pages

```bash
# From repo root
npm run build

# Option A: CLI deploy
npx wrangler pages deploy dist --project-name gridpulse

# Option B: GitHub integration (recommended)
# In Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git
#   Framework preset:  Vite
#   Build command:     npm run build
#   Build output:      dist
```

### 6. Point the frontend at the worker

In Cloudflare Pages → Project → Settings → Environment variables, set:

```
VITE_API_URL = https://gridpulse-api.<your-subdomain>.workers.dev
```

Then redeploy.

### 7. (Optional) Custom domains

- Pages project → Custom domains → add `gridpulse.example.com`
- Worker → Routes → add `api.gridpulse.example.com/*`
- Or use a single domain with Pages + the worker mounted at `/api/*`

### Deployment safety checklist

- [ ] `worker/wrangler.toml` has a real `database_id` (not the placeholder UUID)
- [ ] `GEOPOP_URL` points to your production GeoPop
- [ ] No `.env.local` or `.dev.vars` files in the pushed repo (both gitignored)
- [ ] Cloudflare Pages env var `VITE_API_URL` is set
- [ ] Test a live POST request for crowd reporting after first deploy

---

## How CEB data is fetched (TL;DR of the cache-first design)

The browser **never** talks to `cebcare.ceb.lk` directly. All CEB traffic goes through the worker, which acts as a rate-limit-aware cache:

1. Frontend asks `GET /api/outages/near?lat=X&lon=Y` whenever the user's location is known
2. Worker finds the 5 CEB areas closest to that point (by seeded centroid)
3. For each area:
   - If `areas.last_polled_at` is less than **10 minutes** old → return the rows currently in D1, **zero CEB calls**
   - Otherwise fetch CEB once, diff against D1, upsert changes, flip missing outages to `resolved`, bump `last_polled_at`
4. Return the merged CEB + crowd view

**Consequences:**

- An area that no user ever visits is never polled
- A popular area is polled at most 6 times an hour
- Re-fetching is transparent to the user and gracefully falls back if CEB is down
- There's no `[triggers] crons = [...]` block in `wrangler.toml` — by design. To re-enable proactive polling, uncomment that block and redeploy

---

## Naming note

The English name is **GridPulse** — conveying the real-time, live nature of the outage feed.

The Sri Lankan localized names are preserved in the UI for Sinhala and Tamil speakers:

- **සිංහල:** කරන්ට් කට් *(literally "current cut", the everyday phrase for a power outage)*
- **தமிழ்:** கரன்ட் கட்

---

## Data sources & credits

- **CEB Care public endpoints** — [cebcare.ceb.lk/Incognito/*](https://cebcare.ceb.lk) · unauthenticated OMS feed used by the CEB web portal
- **GeoPop** — [github.com/theetaz/geopop](https://github.com/theetaz/geopop) · self-hosted population + geocoding API
- **OpenFreeMap** — [openfreemap.org](https://openfreemap.org) · free vector tile host
- **OpenStreetMap** — underlying basemap data

This project is not affiliated with or endorsed by the Ceylon Electricity Board. CEB data is used in accordance with its public availability on the CEB Care portal.

---

## Contributing

Issues and PRs welcome. Some good starter tasks:

- Add more Sri Lankan-specific random names to the profile pool
- Improve the CEB area centroid mapping (currently resolved via GeoPop fuzzy search)
- Wire up the `AreaRoom` Durable Object for real-time WebSocket updates
- Add photo upload to the report flow (R2 binding already reserved)
- Build the Web Push notification flow

---

## License

MIT. See [LICENSE](LICENSE) for details.
