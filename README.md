# Vestalife

Conway's Game of Life running on a Vestaboard. A 6x22 cellular automaton on a 10-minute cycle, with automatic reseeding on extinction or stagnation.

## How it works

GitHub Actions calls `/api/tick` on the Vercel-hosted app every 10 minutes via cron, sending an X-Tick-Secret header. The tick endpoint advances the grid by one generation, detects stagnation (still life or oscillator), and seeds fresh patterns automatically. The new grid is converted to Vestaboard codes (live = 71, dead = 0) and pushed to the Vestaboard cloud API. State (grid, generation count, hash history, seed info) persists in a single Supabase row.

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

8. **Enable the tick workflow** (Actions tab). The workflow runs on cron `*/10 * * * *` and on manual trigger.

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

## Changing the tick interval

Edit `.github/workflows/tick.yml` and change the cron schedule. GitHub Actions minimum is 5 minutes. Vestaboard's rate limit is 1 message per 15 seconds, so anything ≥5 minutes is safe.

Example: `*/5 * * * *` for every 5 minutes.

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
