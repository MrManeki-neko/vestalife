import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeEmpty, hashGrid } from "../lib/conway.js";
import { POST, GET } from "../app/api/tick/route.js";

// Shared mutable spies. vi.hoisted runs before the vi.mock factories, so both
// the mock factories and the tests reference the SAME vi.fn instances -- the
// route's createStore() always hands back these exact spies.
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  push: vi.fn(),
}));

// The route imports "../../../lib/store.js" which resolves to the same module
// as "../lib/store.js" from this test file, so vitest applies these mocks.
vi.mock("../lib/store.js", () => ({
  createStore: () => ({ get: mocks.get, put: mocks.put }),
}));

vi.mock("../lib/vestaboard.js", () => ({
  gridToCodes: (grid) => grid.map((row) => row.map((cell) => (cell ? 71 : 0))),
  pushToVestaboard: mocks.push,
}));

function makeRequest(headers = {}, query = "") {
  return new Request(`http://localhost/api/tick${query}`, {
    method: "POST",
    headers,
  });
}

function gliderGrid() {
  // Glider placed mid-grid on 6x22; steps to genuinely new states for many
  // generations (not a still life, not extinct, hash not in history).
  const grid = makeEmpty(6, 22);
  grid[1][9] = 1;
  grid[2][10] = 1;
  grid[3][8] = 1;
  grid[3][9] = 1;
  grid[3][10] = 1;
  return grid;
}

beforeEach(() => {
  mocks.get.mockReset();
  mocks.put.mockReset();
  mocks.push.mockReset();

  // Sensible defaults; individual tests override as needed.
  mocks.get.mockResolvedValue(null);
  mocks.put.mockResolvedValue(undefined);
  mocks.push.mockResolvedValue({ ok: true });

  process.env.TICK_SECRET = "test-secret";
  process.env.VESTABOARD_API_TOKEN = "vb-test-token";
  delete process.env.WRAP_EDGES; // default: wrap edges on
});

describe("POST /api/tick", () => {
  it("returns 401 when X-Tick-Secret header is missing", async () => {
    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("unauthorized");
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("returns 401 when X-Tick-Secret is wrong", async () => {
    const response = await POST(
      makeRequest({ "X-Tick-Secret": "wrong-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("returns 200 with reseeded=true when no existing document", async () => {
    mocks.get.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(1);

    expect(mocks.put).toHaveBeenCalledOnce();
    const storedDoc = mocks.put.mock.calls[0][0];
    expect(storedDoc.generation).toBe(1);
    expect(storedDoc.grid).toHaveLength(6);
    expect(storedDoc.grid[0]).toHaveLength(22);
    expect(storedDoc.hashHistory).toHaveLength(1);
  });

  it("returns 200 with reseeded=false when grid evolves normally", async () => {
    const existingDoc = {
      version: 1,
      generation: 5,
      grid: gliderGrid(),
      hashHistory: ["dummy-hash-a", "dummy-hash-b"],
      seed: { pattern: "glider", offset: [1, 8], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reseeded).toBe(false);
    expect(data.generation).toBe(6);

    expect(mocks.put).toHaveBeenCalledOnce();
    const storedDoc = mocks.put.mock.calls[0][0];
    expect(storedDoc.generation).toBe(6);
    // hashHistory grew: old 2 entries + new candidate hash.
    expect(storedDoc.hashHistory).toHaveLength(3);
    expect(storedDoc.seed).toEqual(existingDoc.seed);
  });

  it("returns 200 with reseeded=true when grid becomes extinct", async () => {
    const existingGrid = makeEmpty(6, 22);
    existingGrid[2][5] = 1; // lone cell dies next step

    const existingDoc = {
      version: 1,
      generation: 3,
      grid: existingGrid,
      hashHistory: ["dummy-hash"],
      seed: { pattern: "glider", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(4);
    expect(mocks.put).toHaveBeenCalledOnce();
  });

  it("returns 200 with reseeded=true when grid is a still life (hash repeats)", async () => {
    // A 2x2 block steps to itself: candidateHash === currentHash -> reseed.
    const existingGrid = makeEmpty(6, 22);
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[3][5] = 1;
    existingGrid[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 7,
      grid: existingGrid,
      hashHistory: ["dummy-hash"],
      seed: { pattern: "soup", offset: null, seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(8);
  });

  it("returns 200 with reseeded=true when candidate hash is in hashHistory (cycle detected)", async () => {
    // Horizontal blinker steps to a vertical blinker. Precompute the vertical
    // state's hash with the real hashGrid and plant it in hashHistory so the
    // route detects the cycle.
    const horizontal = makeEmpty(6, 22);
    horizontal[2][5] = 1;
    horizontal[2][6] = 1;
    horizontal[2][7] = 1;

    const vertical = makeEmpty(6, 22);
    vertical[1][6] = 1;
    vertical[2][6] = 1;
    vertical[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 10,
      grid: horizontal,
      hashHistory: [hashGrid(vertical), hashGrid(horizontal)],
      seed: { pattern: "blinker", offset: [2, 5], seededAtGen: 5 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(11);
  });

  it("returns 200 with reseeded=true when ?reseed=1 query param is provided", async () => {
    const existingDoc = {
      version: 1,
      generation: 5,
      grid: gliderGrid(),
      hashHistory: ["dummy-hash"],
      seed: { pattern: "glider", offset: [1, 8], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" }, "?reseed=1")
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(6);
  });

  it("still returns 200 when vestaboard push fails", async () => {
    const existingDoc = {
      version: 1,
      generation: 2,
      grid: gliderGrid(),
      hashHistory: ["dummy-hash"],
      seed: { pattern: "glider", offset: [1, 8], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    mocks.get.mockResolvedValue(existingDoc);
    mocks.push.mockResolvedValue({ ok: false, error: "boom" });

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.pushOk).toBe(false);
    expect(data.warning).toBe("boom");

    // store.put is still called and records the failed push.
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.put.mock.calls[0][0].lastPushOk).toBe(false);
  });

  it("returns warning and pushOk=false when VESTABOARD_API_TOKEN is not set", async () => {
    delete process.env.VESTABOARD_API_TOKEN;

    mocks.get.mockResolvedValue(null);

    const response = await POST(
      makeRequest({ "X-Tick-Secret": "test-secret" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.pushOk).toBe(false);
    expect(data.warning).toContain("VESTABOARD_API_TOKEN");
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.put).toHaveBeenCalledOnce();
  });

  it("stores correct document structure", async () => {
    mocks.get.mockResolvedValue(null);

    await POST(makeRequest({ "X-Tick-Secret": "test-secret" }));

    expect(mocks.put).toHaveBeenCalledOnce();
    const doc = mocks.put.mock.calls[0][0];

    expect(doc).toHaveProperty("version", 1);
    expect(doc).toHaveProperty("generation");
    expect(doc).toHaveProperty("grid");
    expect(doc).toHaveProperty("hashHistory");
    expect(doc).toHaveProperty("seed");
    expect(doc).toHaveProperty("paused", false); // bootstrap docs are unpaused
    expect(doc).toHaveProperty("lastPushOk");
    expect(doc).toHaveProperty("updatedAt");

    expect(typeof doc.updatedAt).toBe("string");
    expect(Array.isArray(doc.hashHistory)).toBe(true);
    expect(Array.isArray(doc.grid)).toBe(true);
  });

  describe("pause / resume", () => {
    function pausedableDoc(overrides = {}) {
      return {
        version: 1,
        generation: 9,
        grid: gliderGrid(),
        hashHistory: ["dummy-hash-a", "dummy-hash-b"],
        seed: { pattern: "glider", offset: [1, 8], seededAtGen: 0 },
        paused: false,
        lastPushOk: true,
        updatedAt: "2025-06-01T00:00:00.000Z",
        ...overrides,
      };
    }

    it("?pause=1 with no stored doc returns warning and does not persist", async () => {
      mocks.get.mockResolvedValue(null);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" }, "?pause=1")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.paused).toBe(false);
      expect(data.warning).toBe("no state to pause");
      expect(mocks.put).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("?pause=1 with existing doc persists paused=true without ticking or pushing", async () => {
      const existingDoc = pausedableDoc();
      mocks.get.mockResolvedValue(existingDoc);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" }, "?pause=1")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.paused).toBe(true);
      expect(data.generation).toBe(9); // unchanged

      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.put).toHaveBeenCalledOnce();
      const storedDoc = mocks.put.mock.calls[0][0];
      expect(storedDoc.paused).toBe(true);
      // Everything except paused/updatedAt is byte-identical to the stored doc.
      expect(storedDoc.generation).toBe(existingDoc.generation);
      expect(storedDoc.grid).toEqual(existingDoc.grid);
      expect(storedDoc.hashHistory).toEqual(existingDoc.hashHistory);
      expect(storedDoc.seed).toEqual(existingDoc.seed);
      expect(storedDoc.lastPushOk).toBe(existingDoc.lastPushOk);
      // updatedAt is refreshed.
      expect(storedDoc.updatedAt).not.toBe(existingDoc.updatedAt);
      expect(typeof storedDoc.updatedAt).toBe("string");
    });

    it("?resume=1 with no stored doc returns warning and does not persist", async () => {
      mocks.get.mockResolvedValue(null);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" }, "?resume=1")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.paused).toBe(false);
      expect(data.warning).toBe("no state to resume");
      expect(mocks.put).not.toHaveBeenCalled();
      expect(mocks.push).not.toHaveBeenCalled();
    });

    it("?resume=1 with paused doc persists paused=false without ticking or pushing", async () => {
      const existingDoc = pausedableDoc({ paused: true });
      mocks.get.mockResolvedValue(existingDoc);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" }, "?resume=1")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.paused).toBe(false);
      expect(data.generation).toBe(9); // unchanged

      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.put).toHaveBeenCalledOnce();
      const storedDoc = mocks.put.mock.calls[0][0];
      expect(storedDoc.paused).toBe(false);
      expect(storedDoc.generation).toBe(existingDoc.generation);
      expect(storedDoc.grid).toEqual(existingDoc.grid);
      expect(storedDoc.hashHistory).toEqual(existingDoc.hashHistory);
      expect(storedDoc.seed).toEqual(existingDoc.seed);
    });

    it("normal tick with paused doc is skipped: no step, no push, no put", async () => {
      const existingDoc = pausedableDoc({ paused: true });
      mocks.get.mockResolvedValue(existingDoc);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.paused).toBe(true);
      expect(data.skipped).toBe(true);
      expect(data.generation).toBe(9); // unchanged

      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.put).not.toHaveBeenCalled();
    });

    it("?reseed=1 works while paused and preserves paused=true", async () => {
      const existingDoc = pausedableDoc({ paused: true });
      mocks.get.mockResolvedValue(existingDoc);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" }, "?reseed=1")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.reseeded).toBe(true);
      expect(data.generation).toBe(10); // incremented

      expect(mocks.push).toHaveBeenCalledOnce();
      expect(mocks.put).toHaveBeenCalledOnce();
      const storedDoc = mocks.put.mock.calls[0][0];
      expect(storedDoc.paused).toBe(true); // pause state preserved
      expect(storedDoc.generation).toBe(10);
    });

    it("?pause=1&reseed=1: pause wins over reseed", async () => {
      const existingDoc = pausedableDoc();
      mocks.get.mockResolvedValue(existingDoc);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" }, "?pause=1&reseed=1")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.paused).toBe(true);
      expect(data.generation).toBe(9); // unchanged: no reseed happened
      expect(data.reseeded).toBeUndefined();

      expect(mocks.push).not.toHaveBeenCalled();
      expect(mocks.put).toHaveBeenCalledOnce();
      const storedDoc = mocks.put.mock.calls[0][0];
      expect(storedDoc.generation).toBe(9);
      expect(storedDoc.grid).toEqual(existingDoc.grid);
    });

    it("legacy doc without a paused field ticks normally and gains paused=false", async () => {
      const legacyDoc = pausedableDoc();
      delete legacyDoc.paused; // legacy docs predate the pause feature

      mocks.get.mockResolvedValue(legacyDoc);

      const response = await POST(
        makeRequest({ "X-Tick-Secret": "test-secret" })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.reseeded).toBe(false); // glider evolves normally
      expect(data.generation).toBe(10);
      expect(data.skipped).toBeUndefined();

      expect(mocks.push).toHaveBeenCalledOnce();
      expect(mocks.put).toHaveBeenCalledOnce();
      const storedDoc = mocks.put.mock.calls[0][0];
      expect(storedDoc.paused).toBe(false); // persisted docs always carry paused
    });
  });
});

describe("GET /api/tick", () => {
  it("returns all nulls and paused=false when no document exists", async () => {
    mocks.get.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({
      generation: null,
      liveCells: null,
      seed: null,
      paused: false,
      updatedAt: null,
    });
  });

  it("returns document data when it exists", async () => {
    const existingGrid = makeEmpty(6, 22);
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[3][5] = 1;
    existingGrid[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 7,
      grid: existingGrid,
      hashHistory: ["hash1", "hash2"],
      seed: { pattern: "block", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: "2025-01-15T10:30:00Z",
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await GET();
    const data = await response.json();

    expect(data.generation).toBe(7);
    expect(data.liveCells).toBe(4);
    expect(data.seed).toEqual({
      pattern: "block",
      offset: [2, 5],
      seededAtGen: 0,
    });
    expect(data.updatedAt).toBe("2025-01-15T10:30:00Z");
  });

  it("returns safe defaults with paused=false on store error", async () => {
    mocks.get.mockRejectedValue(new Error("Store failed"));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({
      generation: null,
      liveCells: null,
      seed: null,
      paused: false,
      updatedAt: null,
    });
  });

  it("returns paused=true when the stored doc is paused", async () => {
    const existingDoc = {
      version: 1,
      generation: 4,
      grid: gliderGrid(),
      hashHistory: ["hash1"],
      seed: { pattern: "glider", offset: [1, 8], seededAtGen: 0 },
      paused: true,
      lastPushOk: true,
      updatedAt: "2025-01-15T10:30:00Z",
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await GET();
    const data = await response.json();

    expect(data.paused).toBe(true);
    expect(data.generation).toBe(4);
  });

  it("Boolean-coerces paused from legacy docs without the field", async () => {
    const existingDoc = {
      version: 1,
      generation: 2,
      grid: gliderGrid(),
      hashHistory: ["hash1"],
      seed: { pattern: "glider", offset: [1, 8], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: "2025-01-15T10:30:00Z",
      // no paused field (legacy doc)
    };

    mocks.get.mockResolvedValue(existingDoc);

    const response = await GET();
    const data = await response.json();

    expect(data.paused).toBe(false);
  });
});
