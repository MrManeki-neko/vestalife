import { timingSafeEqual } from "node:crypto";
import { ROWS, COLS, HISTORY_LENGTH, wrapEdges } from "../../../lib/config.js";
import { step, isExtinct, hashGrid, countLive } from "../../../lib/conway.js";
import { seed as seedBoard } from "../../../lib/seed.js";
import { gridToCodes, pushToVestaboard } from "../../../lib/vestaboard.js";
import { createStore } from "../../../lib/store.js";

function isAuthorized(request) {
  const provided = request.headers.get("X-Tick-Secret");
  const expected = process.env.TICK_SECRET;

  if (!provided || !expected) return false;

  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);

  if (providedBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(providedBuf, expectedBuf);
}

function buildSeedDoc(generation, rng) {
  const { grid, pattern, offset } = seedBoard(ROWS, COLS, rng);
  return {
    grid,
    hashHistory: [hashGrid(grid)],
    seed: { pattern, offset, seededAtGen: generation },
  };
}

export async function POST(request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const store = createStore();
  const current = await store.get();

  const url = new URL(request.url);
  const wantPause = url.searchParams.get("pause") === "1";
  const wantResume = url.searchParams.get("resume") === "1";
  const forceReseed = url.searchParams.get("reseed") === "1";

  // Precedence: pause > resume > reseed > normal tick.
  if (wantPause || wantResume) {
    const targetPaused = wantPause;
    if (!current) {
      return Response.json(
        {
          ok: true,
          paused: false,
          warning: targetPaused ? "no state to pause" : "no state to resume",
        },
        { status: 200 }
      );
    }
    const doc = {
      ...current,
      paused: targetPaused,
      updatedAt: new Date().toISOString(),
    };
    await store.put(doc);
    return Response.json(
      { ok: true, paused: targetPaused, generation: current.generation },
      { status: 200 }
    );
  }

  if (current && Boolean(current.paused) && !forceReseed) {
    return Response.json(
      { ok: true, paused: true, skipped: true, generation: current.generation },
      { status: 200 }
    );
  }

  const paused = current ? Boolean(current.paused) : false;

  let nextGrid;
  let hashHistory;
  let seedInfo;
  let reseeded = false;
  let generation = current ? current.generation : 0;

  if (!current) {
    const built = buildSeedDoc(generation, Math.random);
    nextGrid = built.grid;
    hashHistory = built.hashHistory;
    seedInfo = built.seed;
    reseeded = true;
  } else if (forceReseed) {
    const built = buildSeedDoc(generation, Math.random);
    nextGrid = built.grid;
    hashHistory = built.hashHistory;
    seedInfo = built.seed;
    reseeded = true;
  } else {
    const candidate = step(current.grid, wrapEdges());
    const currentHash = hashGrid(current.grid);
    const candidateHash = hashGrid(candidate);

    if (
      isExtinct(candidate) ||
      candidateHash === currentHash ||
      current.hashHistory.includes(candidateHash)
    ) {
      const built = buildSeedDoc(generation, Math.random);
      nextGrid = built.grid;
      hashHistory = built.hashHistory;
      seedInfo = built.seed;
      reseeded = true;
    } else {
      nextGrid = candidate;
      hashHistory = [...current.hashHistory, candidateHash].slice(-HISTORY_LENGTH);
      seedInfo = current.seed;
    }
  }

  let pushOk = true;
  let warning;

  const token = process.env.VESTABOARD_API_TOKEN;
  if (!token) {
    pushOk = false;
    warning = "VESTABOARD_API_TOKEN not set; skipped push";
  } else {
    const codes = gridToCodes(nextGrid);
    const result = await pushToVestaboard(codes, token);
    pushOk = result.ok;
    if (!result.ok) {
      warning = result.error;
      console.error("vestaboard push failed:", result.error);
    }
  }

  generation = generation + 1;

  const doc = {
    version: 1,
    generation,
    grid: nextGrid,
    hashHistory,
    seed: seedInfo,
    paused,
    lastPushOk: pushOk,
    updatedAt: new Date().toISOString(),
  };

  await store.put(doc);

  const response = { ok: true, generation, reseeded, pushOk };
  if (warning) response.warning = warning;

  return Response.json(response, { status: 200 });
}

export async function GET() {
  let doc = null;

  try {
    const store = createStore();
    doc = await store.get();
  } catch (err) {
    return Response.json({ generation: null, liveCells: null, seed: null, paused: false, updatedAt: null });
  }

  if (!doc) {
    return Response.json({ generation: null, liveCells: null, seed: null, paused: false, updatedAt: null });
  }

  return Response.json({
    generation: doc.generation,
    liveCells: countLive(doc.grid),
    seed: doc.seed,
    paused: Boolean(doc.paused),
    updatedAt: doc.updatedAt,
  });
}
