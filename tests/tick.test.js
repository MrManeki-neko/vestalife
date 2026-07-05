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
    expect(doc).toHaveProperty("lastPushOk");
    expect(doc).toHaveProperty("updatedAt");

    expect(typeof doc.updatedAt).toBe("string");
    expect(Array.isArray(doc.hashHistory)).toBe(true);
    expect(Array.isArray(doc.grid)).toBe(true);
  });
});

describe("GET /api/tick", () => {
  it("returns all nulls when no document exists", async () => {
    mocks.get.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({
      generation: null,
      liveCells: null,
      seed: null,
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

  it("returns safe defaults on store error", async () => {
    mocks.get.mockRejectedValue(new Error("Store failed"));

    const response = await GET();
    const data = await response.json();

    expect(data).toEqual({
      generation: null,
      liveCells: null,
      seed: null,
      updatedAt: null,
    });
  });
});
