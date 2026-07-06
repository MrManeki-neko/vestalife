# Vestalife

Conway's Game of Life running on a Vestaboard. A 6x22 cellular automaton advancing one generation per minute, with automatic reseeding on extinction or stagnation, and a pause switch so the board can show normal messages.

## How it works

An external scheduler ([cron-job.org](https://cron-job.org)) calls `POST /api/tick` on the Vercel-hosted app once a minute, sending an `X-Tick-Secret` header. The tick endpoint advances the grid by one generation, detects stagnation (still life or oscillator), and seeds fresh patterns automatically. The new grid is converted to Vestaboard codes (live = 71, dead = 0) and pushed to the Vestaboard cloud API. State (grid, generation count, hash history, seed info) persists in a single Supabase row.

GitHub Actions (`.github/workflows/tick.yml`) is kept only as a manual control panel — run it from the Actions tab to tick once, pause, resume, or reseed. It no longer runs on a schedule, because GitHub's cron is best-effort and often lags by many minutes; cron-job.org fires reliably every minute.

## Prerequisites

- A Vestaboard and its cloud API token (get it at web.vestaboard.com → API section → Create New Token, enable Write permission; token shown once)
- Free Supabase account
- Free Vercel account
- GitHub account
- No local Node required; builds on Vercel, tests in CI

## Setup

1. **Fork or clone this repo**
   ```
   git clone https://github.com/yourusername/vestalife.git
   cd vestalife
   ```

2. **Create a Supabase project** at supabase.com. Note the Project URL and go to Settings → API → copy the `service_role` key (secret).

3. **Run the migration** in the Supabase SQL editor:
   ```sql
   create table if not exists public.board_state (
     id int primary key,
     doc jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.board_state enable row level security;
   ```

4. **Import the repo into Vercel** (vercel.com):
   - Framework preset is pinned to Next.js by `vercel.json` (no Vercel cron — the tick clock is cron-job.org)
   - Set these environment variables:
     - `SUPABASE_URL`: your Project URL
     - `SUPABASE_SERVICE_ROLE_KEY`: the service_role key
     - `VESTABOARD_API_TOKEN`: your Vestaboard token
     - `TICK_SECRET`: any long random string, e.g. `openssl rand -hex 32`
     - `WRAP_EDGES`: (optional, defaults to true)
   - Deploy

5. **Note the Vercel deployment URL** (e.g., `https://vestalife-xyz.vercel.app`). You'll need this for GitHub.

6. **Generate a TICK_SECRET** if you haven't yet:
   ```bash
   openssl rand -hex 32
   ```
   Use the same value in both Vercel env vars and GitHub secrets.

7. **Set GitHub repo secrets** (Settings → Secrets and variables → Actions, or `gh secret set`) — these power the manual control-panel workflow:
   - `TICK_URL`: your Vercel deployment URL, `https://…`, **no trailing slash** (a trailing slash or `http://` makes every request a 308 redirect)
   - `TICK_SECRET`: the same random string as in Vercel

8. **Create the every-minute scheduler** at [cron-job.org](https://console.cron-job.org):
   - Create cronjob → Title: `vestalife tick`
   - URL: `https://<your-app>.vercel.app/api/tick` (https, no trailing slash)
   - Schedule: every minute (every 1 minute, all hours/days)
   - In the request/advanced settings: **Request method = POST**, and add a header **`X-Tick-Secret`** = your `TICK_SECRET` value
   - Save and enable. cron-job.org's test run should return `200`; a `401` means the header is wrong, a `308` means the URL has a trailing slash or is `http://`.

9. **(Optional) The GitHub Actions workflow** is a manual control panel only (Actions tab → Run workflow → tick / pause / resume / reseed). It has no schedule. You can leave the repo private; the workflow only runs when you trigger it.

## Environment variables

| Name | Where | Purpose |
|------|-------|---------|
| `TICK_SECRET` | Vercel | Authentication secret for `/api/tick` (sent by cron-job.org in `X-Tick-Secret` header) |
| `VESTABOARD_API_TOKEN` | Vercel | Vestaboard cloud API token |
| `SUPABASE_URL` | Vercel | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Supabase service role key (server-side only) |
| `WRAP_EDGES` | Vercel (optional) | Boolean; default `true` (toroidal edges). Set to `false` for hard edges. |

**GitHub secrets** (for the manual control-panel workflow only):
- `TICK_URL`: Your Vercel app URL (`https://…`), no trailing slash — must match the URL in cron-job.org
- `TICK_SECRET`: Same value as Vercel's `TICK_SECRET`

## Manual testing

Get the current state:
```bash
curl https://vestalife-xyz.vercel.app/api/tick
```

Advance one generation:
```bash
curl -X POST https://vestalife-xyz.vercel.app/api/tick \
  -H "X-Tick-Secret: your-secret"
```

Force a reseed:
```bash
curl -X POST "https://vestalife-xyz.vercel.app/api/tick?reseed=1" \
  -H "X-Tick-Secret: your-secret"
```

View the board in a browser:
```
https://vestalife-xyz.vercel.app/
```

## Pausing (show normal messages on the board)

Pausing stops scheduled ticks from computing, pushing, or persisting anything — the board is all yours until you resume, and the simulation freezes in place.

- From GitHub: Actions tab → tick → Run workflow → choose `pause` (or `resume`).
- From a terminal:
  ```bash
  curl -X POST "https://vestalife-xyz.vercel.app/api/tick?pause=1" -H "X-Tick-Secret: your-secret"
  curl -X POST "https://vestalife-xyz.vercel.app/api/tick?resume=1" -H "X-Tick-Secret: your-secret"
  ```

The homepage and `GET /api/tick` both report the paused state. While paused, the every-minute cron-job.org calls still fire but no-op (they return `{ "paused": true, "skipped": true }`), so the board stays free. A manual `?reseed=1` still works while paused (it pushes the new seed to the board once) but does not resume. You can also pause by simply disabling the job in cron-job.org.

## Changing the tick interval

The cadence is set in cron-job.org — edit the job's schedule (e.g. every 2 minutes, or a fixed window of hours). Vestaboard's rate limit is 1 message per 15 seconds, so don't go below ~20-second ticks. cron-job.org's free tier minimum is 1 minute.

## Configuration

### Edge wrapping
Set `WRAP_EDGES=false` in Vercel to disable toroidal wrapping (hard edges). Default is `true`.

### Patterns
Add or modify initial patterns in `lib/patterns.js`. Patterns are coordinate arrays relative to a bounding box:
```javascript
myPattern: {
  cells: [[row, col], ...],
  rows: height,
  cols: width,
}
```

Seeding picks randomly from: glider, blinker, toad, beacon, LWSS, r-pentomino, or random soup (~30% density), placed at a random offset on the board.

## Design notes

**Why cron-job.org for the clock?** Vercel Hobby tier limits cron to once daily. GitHub Actions scheduled workflows are best-effort and often lag significantly (gaps of 80+ minutes observed). cron-job.org's free tier fires reliably every minute and requires no local infrastructure.

**Why Supabase?** Serverless functions are stateless. A single JSONB row in Postgres is a lightweight, free state store. Supabase RLS with no policies means only the service role key (used server-side) can access it.

**Stagnation & reseed:** After every step, we check for extinction, still life (same hash as previous generation), or oscillator (hash in the last 12 hashes). If any is true, the board reseeds with a random pattern at a random offset. This keeps the sim always alive.

**Vestaboard push failures:** If the push to Vestaboard fails, we log and set a warning in the response, but the tick still succeeds and state still advances. The board's state is the source of truth; Vestaboard reflects it when the network allows.

**URL normalization:** cron-job.org's test request must return HTTP 200. A trailing slash in the URL or `http://` protocol causes a 308 redirect, which silently freezes the board (seen in production). The `/api/tick` endpoint normalizes all URLs before processing.
