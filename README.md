# Vestalife

Conway's Game of Life running on a Vestaboard. A 6x22 cellular automaton advancing one generation per minute, with automatic reseeding on extinction or stagnation, and a pause switch so the board can show normal messages.

## How it works

A GitHub Actions job wakes every 5 minutes (GitHub's cron minimum) and calls `/api/tick` on the Vercel-hosted app once per minute for 5 minutes, sending an X-Tick-Secret header. The tick endpoint advances the grid by one generation, detects stagnation (still life or oscillator), and seeds fresh patterns automatically. The new grid is converted to Vestaboard codes (live = 71, dead = 0) and pushed to the Vestaboard cloud API. State (grid, generation count, hash history, seed info) persists in a single Supabase row.

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
   - Framework preset is pinned to Next.js by `vercel.json` (no cron in there — the tick clock is GitHub Actions)
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

7. **Set GitHub repo secrets** (Settings → Secrets and variables → Actions, or `gh secret set`):
   - `TICK_URL`: your Vercel deployment URL with no trailing slash
   - `TICK_SECRET`: the same random string

8. **Enable the tick workflow** (Actions tab). The workflow wakes on cron `*/5 * * * *`, ticks once per minute inside the job, and can be run manually with a tick/pause/resume/reseed choice.

9. **Make the repo public** (or watch your Actions budget). Each job is billed rounded up to the minute on private repos, and this schedule uses roughly 40,000 minutes/month — far past the 2,000 free private-repo minutes. Public repos get free unlimited Actions minutes on standard runners. If you must stay private, slow the cron and drop the in-job loop.

## Environment variables

| Name | Where | Purpose |
|------|-------|---------|
| `TICK_SECRET` | Vercel + GitHub secret | Shared secret between Actions and `/api/tick` (timing-safe comparison) |
| `VESTABOARD_API_TOKEN` | Vercel | Vestaboard cloud API token |
| `SUPABASE_URL` | Vercel | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Supabase service role key (server-side only) |
| `WRAP_EDGES` | Vercel (optional) | Boolean; default `true` (toroidal edges). Set to `false` for hard edges. |

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

The homepage and `GET /api/tick` both report the paused state. A manual `?reseed=1` still works while paused (it pushes the new seed to the board once) but does not resume the schedule.

## Changing the tick interval

The cadence lives in `.github/workflows/tick.yml` in two places: the cron (`*/5 * * * *`, GitHub's minimum) controls how often the job wakes, and the in-job loop (5 iterations, `sleep 60`) controls ticks within the job. For one generation per minute keep both as is; for e.g. every 5 minutes, drop the loop to a single curl. Vestaboard's rate limit is 1 message per 15 seconds, so don't go below ~20-second ticks.

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

**Why GitHub Actions instead of Vercel Cron?** Vercel Hobby tier limits cron to once daily. GitHub Actions is free and precise enough.

**Why Supabase?** Serverless functions are stateless. A single JSONB row in Postgres is a lightweight, free state store. Supabase RLS with no policies means only the service role key (used server-side) can access it.

**Stagnation & reseed:** After every step, we check for extinction, still life (same hash as previous generation), or oscillator (hash in the last 12 hashes). If any is true, the board reseeds with a random pattern at a random offset. This keeps the sim always alive.

**Vestaboard push failures:** If the push to Vestaboard fails, we log and set a warning in the response, but the tick still succeeds and state still advances. The board's state is the source of truth; Vestaboard reflects it when the network allows.
