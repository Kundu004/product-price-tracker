# Product Price Tracker — Backend

Node/Express API + Playwright scraper for the INE Software Engineer Intern
take-home assignment. Tracks price and stock for products on INE's mock
storefront, on a 2-hour schedule driven by an external cron trigger.

**Live API:** https://product-price-tracker-f.onrender.com
**Frontend:** https://product-price-tracker-frontend-one.vercel.app

## Stack

- Node.js / Express
- Playwright (Chromium) for price/stock scraping
- Supabase (Postgres) for storage
- Docker (Microsoft's official Playwright image) on Render
- cron-job.org for the external 2-hour trigger

## Why Docker, not Render's native Node runtime

Render's native Node build environment doesn't reliably provide the
`chromium-headless-shell` binary Playwright needs since v1.45+, and its
build sandbox has no root access, so `playwright install --with-deps`
fails. Switching to Docker with Microsoft's `mcr.microsoft.com/playwright`
base image bundles Chromium, the headless-shell binary, and all system
libraries in one pre-built layer, which sidesteps this class of
environment-mismatch problem entirely. See `DESIGN_NOTE.md` for the full
story — it's a real, useful piece of the reliability narrative.

The Docker image tag is pinned to match the `playwright` npm package
version exactly (`npx playwright --version`) — a mismatch between the
library version and the image's pre-installed browser binaries breaks
`browserType.launch()` at runtime.

## Local setup

```bash
git clone <this-repo-url>
cd backend
npm install
cp .env.example .env   # fill in real values, see below
npm run dev             # starts on http://localhost:4000
```

## Environment variables

| Variable            | Description                                                                 |
|---------------------|-------------------------------------------------------------------------------|
| `PORT`               | Local dev only. Render sets this automatically in production.              |
| `SUPABASE_URL`       | Supabase project URL (Settings → API in the Supabase dashboard).           |
| `SUPABASE_ANON_KEY`  | Supabase anon/public API key.                                              |
| `CRON_SECRET`        | Shared secret the cron job sends as `Authorization: Bearer <CRON_SECRET>` on `POST /api/scrape/run`. Anyone without it gets a 401. |
| `FRONTEND_URL`       | The deployed frontend's origin, used as the single allowed CORS origin (e.g. `https://product-price-tracker-frontend-one.vercel.app`). No trailing slash — the check is a literal string match. |
| `TARGET_STORE_URL`   | Base URL of the mock store being scraped (`https://demo.inelabteamdev.com`). |

The server fails fast at startup if `SUPABASE_URL` or `SUPABASE_ANON_KEY`
is missing, rather than letting every later DB call fail with a confusing
error deep in a request.

## Database schema

Run `migrations/001_init.sql` once in the Supabase SQL editor. Two tables:

- **`tracked_products`** — one row per product+option being tracked.
  Untracking is a **soft delete** (`is_active = false`), not a real
  delete, so a product's scrape history in `scrape_attempts` is never
  lost when it's untracked (the foreign key is `on delete cascade`, so a
  hard delete would wipe history along with it).
- **`scrape_attempts`** — one row per scrape attempt, every outcome
  (`success` / `retried` / `failed`), used for both the per-product
  scrape log and the CSV export. Failed attempts always have `price` and
  `stock` as `NULL` — never a fake or stale value.

## Scraping schedule

Scraping is triggered externally by **cron-job.org**, not `setInterval` —
free hosting tiers sleep on inactivity, so an in-process timer isn't
reliable.

- **Endpoint:** `POST /api/scrape/run`
- **Frequency:** every 2 hours
- **Auth header:** `Authorization: Bearer <CRON_SECRET>`
- **Body:** empty

Each run scrapes every currently active (`is_active = true`) tracked
product. A crash scraping one product is caught and recorded as a
`failed` attempt for that product only — it never aborts the rest of the
run.

## Manual / headed-mode run

To watch the scraper run in a real (non-headless) browser window, e.g.
for demo/debugging purposes, against the first active tracked product:

```bash
npm run scrape:headed
```

## API endpoints

| Method | Path                                | Description                                    |
|--------|--------------------------------------|-------------------------------------------------|
| GET    | `/api/health`                        | Checks real Supabase connectivity, not just that Express is up. |
| GET    | `/api/products/search?q=`            | Searches the store's catalog by name (cached, filtered locally). |
| GET    | `/api/products/:id`                  | Full item detail + available options, from the store directly. |
| GET    | `/api/tracked-products`              | Lists active tracked products.                 |
| POST   | `/api/tracked-products`              | Tracks a product+option. Reactivates a soft-deleted row if it was previously tracked and untracked, rather than failing on the unique constraint. |
| DELETE | `/api/tracked-products/:id`          | Untracks (soft delete) — history preserved.    |
| GET    | `/api/tracked-products/:id/history`  | Successful/retried scrapes only, ascending — for charting price/stock over time. |
| GET    | `/api/tracked-products/:id/logs`     | Every scrape attempt, descending, including failures and `error_reason`. |
| POST   | `/api/scrape/run`                    | Triggers a scrape pass for all tracked products. Requires `CRON_SECRET`. Also safe to call manually for demo/debugging. |
| GET    | `/api/export/csv`                    | CSV export, one row per scrape attempt, RFC 4180 escaped. |

## Deployment (Render)

- **Runtime:** Docker (see Dockerfile at repo root)
- **Root directory:** blank (repo root is the backend contents)
- Set all five env vars above in the Render dashboard's Environment tab.
