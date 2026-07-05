import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeEmpty, countLive } from "../lib/conway.js";

// Mock store and vestaboard before importing route
vi.mock("../lib/store.js", () => ({
  createStore: vi.fn(() => ({
    get: vi.fn(),
    put: vi.fn(),
  })),
}));

vi.mock("../lib/vestaboard.js", () => ({
  gridToCodes: (grid) => grid.map((row) => row.map((cell) => (cell ? 71 : 0))),
  pushToVestaboard: vi.fn(),
}));

// Now dynamically import after mocks are set up
const { POST, GET } = await import("../app/api/tick/route.js");
const { createStore } = await import("../lib/store.js");
const { pushToVestaboard } = await import("../lib/vestaboard.js");

describe("POST /api/tick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TICK_SECRET = "test-secret";
    process.env.WRAP_EDGES = "true";
  });

  it("returns 401 when Authorization header is missing", async () => {
    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: {},
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
    expect(data.error).toBe("unauthorized");
  });

  it("returns 401 when X-Tick-Secret is wrong", async () => {
    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "wrong-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.ok).toBe(false);
  });

  it("returns 200 with reseeded=true when no existing document", async () => {
    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(null);
    mockStore.put.mockResolvedValueOnce(undefined);

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(1);

    // Verify store.put was called
    expect(mockStore.put).toHaveBeenCalledOnce();
    const storedDoc = mockStore.put.mock.calls[0][0];
    expect(storedDoc.generation).toBe(1);
    expect(storedDoc.grid).toHaveLength(6);
    expect(storedDoc.grid[0]).toHaveLength(22);
    expect(storedDoc.hashHistory).toHaveLength(1);
  });

  it("returns 200 with reseeded=false when grid evolves normally", async () => {
    const existingGrid = makeEmpty(6, 22);
    // Place a 2x2 block (still life)
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[3][5] = 1;
    existingGrid[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 5,
      grid: existingGrid,
      hashHistory: ["abc123", "def456"],
      seed: { pattern: "block", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);
    mockStore.put.mockResolvedValueOnce(undefined);

    pushToVestaboard.mockResolvedValueOnce({ ok: true });

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reseeded).toBe(false);
    expect(data.generation).toBe(6);

    // Verify store.put was called with incremented generation
    expect(mockStore.put).toHaveBeenCalledOnce();
    const storedDoc = mockStore.put.mock.calls[0][0];
    expect(storedDoc.generation).toBe(6);
  });

  it("returns 200 with reseeded=true when grid becomes extinct", async () => {
    const existingGrid = makeEmpty(6, 22);
    // Single live cell will die
    existingGrid[2][5] = 1;

    const existingDoc = {
      version: 1,
      generation: 3,
      grid: existingGrid,
      hashHistory: ["hash1"],
      seed: { pattern: "glider", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);
    mockStore.put.mockResolvedValueOnce(undefined);

    pushToVestaboard.mockResolvedValueOnce({ ok: true });

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(4);
  });

  it("returns 200 with reseeded=true when grid repeats (cycle detected)", async () => {
    const existingGrid = makeEmpty(6, 22);
    // Blinker pattern (period-2 oscillator)
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[2][7] = 1;

    const existingDoc = {
      version: 1,
      generation: 10,
      grid: existingGrid,
      hashHistory: ["hash_blinker_horizontal"],
      seed: { pattern: "blinker", offset: [2, 5], seededAtGen: 5 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);
    mockStore.put.mockResolvedValueOnce(undefined);

    pushToVestaboard.mockResolvedValueOnce({ ok: true });

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(11);
  });

  it("returns 200 with reseeded=true when ?reseed=1 query param is provided", async () => {
    const existingGrid = makeEmpty(6, 22);
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[3][5] = 1;
    existingGrid[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 5,
      grid: existingGrid,
      hashHistory: ["abc"],
      seed: { pattern: "block", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);
    mockStore.put.mockResolvedValueOnce(undefined);

    pushToVestaboard.mockResolvedValueOnce({ ok: true });

    const request = new Request("http://localhost/api/tick?reseed=1", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.reseeded).toBe(true);
    expect(data.generation).toBe(6);
  });

  it("still returns 200 when vestaboard push fails", async () => {
    const existingGrid = makeEmpty(6, 22);
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[3][5] = 1;
    existingGrid[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 2,
      grid: existingGrid,
      hashHistory: ["hash1"],
      seed: { pattern: "block", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);
    mockStore.put.mockResolvedValueOnce(undefined);

    pushToVestaboard.mockResolvedValueOnce({
      ok: false,
      error: "Vestaboard API error",
    });

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.pushOk).toBe(false);
    expect(data.warning).toBeDefined();

    // store.put should still be called
    expect(mockStore.put).toHaveBeenCalledOnce();
  });

  it("returns warning when VESTABOARD_API_TOKEN is not set", async () => {
    const existingGrid = makeEmpty(6, 22);
    existingGrid[2][5] = 1;
    existingGrid[2][6] = 1;
    existingGrid[3][5] = 1;
    existingGrid[3][6] = 1;

    const existingDoc = {
      version: 1,
      generation: 1,
      grid: existingGrid,
      hashHistory: ["hash1"],
      seed: { pattern: "block", offset: [2, 5], seededAtGen: 0 },
      lastPushOk: true,
      updatedAt: new Date().toISOString(),
    };

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);
    mockStore.put.mockResolvedValueOnce(undefined);

    delete process.env.VESTABOARD_API_TOKEN;

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.pushOk).toBe(false);
    expect(data.warning).toContain("VESTABOARD_API_TOKEN");
  });

  it("stores correct document structure", async () => {
    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(null);
    mockStore.put.mockResolvedValueOnce(undefined);

    pushToVestaboard.mockResolvedValueOnce({ ok: true });

    const request = new Request("http://localhost/api/tick", {
      method: "POST",
      headers: { "X-Tick-Secret": "test-secret" },
    });

    await POST(request);

    expect(mockStore.put).toHaveBeenCalledOnce();
    const doc = mockStore.put.mock.calls[0][0];

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
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all nulls when no document exists", async () => {
    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(null);

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

    const mockStore = createStore();
    mockStore.get.mockResolvedValueOnce(existingDoc);

    const response = await GET();
    const data = await response.json();

    expect(data.generation).toBe(7);
    expect(data.liveCells).toBe(4);
    expect(data.seed).toEqual({ pattern: "block", offset: [2, 5], seededAtGen: 0 });
    expect(data.updatedAt).toBe("2025-01-15T10:30:00Z");
  });

  it("returns safe defaults on store error", async () => {
    const mockStore = createStore();
    mockStore.get.mockRejectedValueOnce(new Error("Store failed"));

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
