import { describe, it, expect, beforeEach, vi } from "vitest";
import { gridToCodes, pushToVestaboard } from "../lib/vestaboard.js";
import { makeEmpty } from "../lib/conway.js";

describe("vestaboard", () => {
  describe("gridToCodes", () => {
    it("maps 1 to 71 and 0 to 0", () => {
      const grid = makeEmpty(2, 3);
      grid[0][0] = 1;
      grid[0][1] = 0;
      grid[0][2] = 1;

      const codes = gridToCodes(grid);

      expect(codes[0][0]).toBe(71);
      expect(codes[0][1]).toBe(0);
      expect(codes[0][2]).toBe(71);
    });

    it("preserves 6x22 grid shape", () => {
      const grid = makeEmpty(6, 22);
      const codes = gridToCodes(grid);

      expect(codes).toHaveLength(6);
      expect(codes[0]).toHaveLength(22);
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 22; c++) {
          expect(codes[r][c]).toBe(0);
        }
      }
    });

    it("handles 2x2 block correctly", () => {
      const grid = makeEmpty(3, 3);
      grid[0][0] = 1;
      grid[0][1] = 1;
      grid[1][0] = 1;
      grid[1][1] = 1;

      const codes = gridToCodes(grid);

      expect(codes[0][0]).toBe(71);
      expect(codes[0][1]).toBe(71);
      expect(codes[1][0]).toBe(71);
      expect(codes[1][1]).toBe(71);
      expect(codes[0][2]).toBe(0);
      expect(codes[2][0]).toBe(0);
    });
  });

  describe("pushToVestaboard", () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("returns { ok: true } on successful 200 response", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: true,
          status: 200,
        })
      );

      const result = await pushToVestaboard(codes, "test-token");

      expect(result).toEqual({ ok: true });
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("returns { ok: false, error } on 400 response without retry", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({
          ok: false,
          status: 400,
        })
      );

      const result = await pushToVestaboard(codes, "test-token");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("400");
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on 429 and succeeds on second attempt", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal("fetch", vi.fn());
      vi.useFakeTimers();

      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 429 })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const resultPromise = pushToVestaboard(codes, "test-token");

      // Advance timers past the 2s delay
      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result).toEqual({ ok: true });
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("retries on 500 and fails on second attempt", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal("fetch", vi.fn());
      vi.useFakeTimers();

      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 500 })
        .mockResolvedValueOnce({ ok: false, status: 500 });

      const resultPromise = pushToVestaboard(codes, "test-token");

      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result.ok).toBe(false);
      expect(result.error).toContain("500");
      expect(global.fetch).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("network error on first attempt results in ok: false", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new Error("Network error"))
      );

      const result = await pushToVestaboard(codes, "test-token");

      expect(result.ok).toBe(false);
    });

    it("network error on both attempts results in ok: false", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal("fetch", vi.fn());
      vi.useFakeTimers();

      global.fetch
        .mockRejectedValueOnce(new Error("Network error 1"))
        .mockRejectedValueOnce(new Error("Network error 2"));

      const resultPromise = pushToVestaboard(codes, "test-token");

      await vi.advanceTimersByTimeAsync(2000);

      const result = await resultPromise;

      expect(result.ok).toBe(false);

      vi.useRealTimers();
    });

    it("sends correct headers and body", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValueOnce({ ok: true, status: 200 })
      );

      await pushToVestaboard(codes, "my-test-token");

      expect(global.fetch).toHaveBeenCalledWith(
        "https://cloud.vestaboard.com/",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Vestaboard-Token": "my-test-token",
            "Content-Type": "application/json",
          }),
          body: expect.any(String),
        })
      );

      // Verify body contains the codes
      const callArgs = global.fetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toHaveProperty("characters");
    });

    it("never throws even on network errors", async () => {
      const grid = makeEmpty();
      const codes = gridToCodes(grid);

      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValueOnce(new Error("Catastrophic failure"))
      );

      let threw = false;
      try {
        await pushToVestaboard(codes, "test-token");
      } catch (err) {
        threw = true;
      }

      expect(threw).toBe(false);
    });
  });
});
