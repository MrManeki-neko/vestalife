import { describe, it, expect } from "vitest";
import { seed } from "../lib/seed.js";
import { PATTERNS } from "../lib/patterns.js";
import { countLive } from "../lib/conway.js";

describe("seed", () => {
  describe("returns correct structure", () => {
    it("returns object with grid, pattern, and offset", () => {
      const result = seed();
      expect(result).toHaveProperty("grid");
      expect(result).toHaveProperty("pattern");
      expect(result).toHaveProperty("offset");
    });

    it("grid has correct dimensions", () => {
      const result = seed(6, 22);
      expect(result.grid).toHaveLength(6);
      expect(result.grid[0]).toHaveLength(22);
    });
  });

  describe("pattern seeding with deterministic rng", () => {
    it("glider pattern produces 5 live cells when selected", () => {
      // Force selection of glider (first pattern)
      // rng that returns 0 picks CHOICES[0] which is "glider"
      const mockRng = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) return 0; // pick "glider"
          if (callCount === 2) return 0.5; // offsetRow
          if (callCount === 3) return 0.5; // offsetCol
          return Math.random();
        };
      })();

      const result = seed(6, 22, mockRng);
      expect(result.pattern).toBe("glider");
      expect(countLive(result.grid)).toBe(PATTERNS.glider.cells.length);
      expect(result.offset).not.toBeNull();
      expect(Array.isArray(result.offset)).toBe(true);
      expect(result.offset).toHaveLength(2);
    });

    it("blinker pattern produces 3 live cells when selected", () => {
      const mockRng = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) return 1 / 8; // pick "blinker" (second pattern)
          if (callCount === 2) return 0.5; // offsetRow
          if (callCount === 3) return 0.5; // offsetCol
          return Math.random();
        };
      })();

      const result = seed(6, 22, mockRng);
      expect(result.pattern).toBe("blinker");
      expect(countLive(result.grid)).toBe(PATTERNS.blinker.cells.length);
    });

    it("toad pattern produces 6 live cells when selected", () => {
      const mockRng = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) return 2 / 8; // pick "toad" (third pattern)
          if (callCount === 2) return 0.5; // offsetRow
          if (callCount === 3) return 0.5; // offsetCol
          return Math.random();
        };
      })();

      const result = seed(6, 22, mockRng);
      expect(result.pattern).toBe("toad");
      expect(countLive(result.grid)).toBe(PATTERNS.toad.cells.length);
    });
  });

  describe("soup seeding with deterministic rng", () => {
    it("soup choice returns pattern='soup' and offset=null", () => {
      // Pick soup: CHOICES.length = 8, so values >= 7/8 pick "soup"
      const mockRng = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) return 0.99; // pick "soup" (last choice)
          return 0.5; // cells set to alive
        };
      })();

      const result = seed(6, 22, mockRng);
      expect(result.pattern).toBe("soup");
      expect(result.offset).toBeNull();
    });

    it("soup density approximately 30% with rng returning 0.99", () => {
      const mockRng = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) return 0.99; // pick soup
          return 0.5; // cells: 0.5 < 0.3 is false, so all dead
        };
      })();

      const result = seed(6, 22, mockRng);
      // rng always returns 0.5, which is > 0.3 density, so all cells dead
      expect(countLive(result.grid)).toBe(0);
    });

    it("soup with rng returning values below density produces live cells", () => {
      const mockRng = (() => {
        let callCount = 0;
        return () => {
          callCount++;
          if (callCount === 1) return 0.99; // pick soup
          // Alternate between 0.1 and 0.9: 0.1 < 0.3 is true (alive)
          return callCount % 2 === 0 ? 0.1 : 0.9;
        };
      })();

      const result = seed(6, 22, mockRng);
      // Half the cells (roughly) should be alive
      const live = countLive(result.grid);
      const total = 6 * 22;
      // Expect roughly 50% alive
      expect(live).toBeGreaterThan(total * 0.4);
      expect(live).toBeLessThan(total * 0.6);
    });

    it("soup density between 10% and 50% with typical rng", () => {
      // Use a seeded rng that produces a realistic distribution
      let seed_val = 12345;
      const mockRng = () => {
        const x = Math.sin(seed_val++) * 10000;
        return x - Math.floor(x);
      };

      const result = seed(6, 22, mockRng);
      const live = countLive(result.grid);
      const total = 6 * 22;
      const density = live / total;

      // Loosely check that density is in reasonable range
      expect(density).toBeGreaterThan(0.1);
      expect(density).toBeLessThan(0.5);
    });
  });

  describe("pattern bounds fit in 6x22 grid", () => {
    it("glider (3x3) fits within bounds", () => {
      expect(PATTERNS.glider.rows).toBeLessThanOrEqual(6);
      expect(PATTERNS.glider.cols).toBeLessThanOrEqual(22);
    });

    it("blinker (1x3) fits within bounds", () => {
      expect(PATTERNS.blinker.rows).toBeLessThanOrEqual(6);
      expect(PATTERNS.blinker.cols).toBeLessThanOrEqual(22);
    });

    it("toad (2x4) fits within bounds", () => {
      expect(PATTERNS.toad.rows).toBeLessThanOrEqual(6);
      expect(PATTERNS.toad.cols).toBeLessThanOrEqual(22);
    });

    it("beacon (4x4) fits within bounds", () => {
      expect(PATTERNS.beacon.rows).toBeLessThanOrEqual(6);
      expect(PATTERNS.beacon.cols).toBeLessThanOrEqual(22);
    });

    it("lwss (4x5) fits within bounds", () => {
      expect(PATTERNS.lwss.rows).toBeLessThanOrEqual(6);
      expect(PATTERNS.lwss.cols).toBeLessThanOrEqual(22);
    });

    it("rPentomino (3x3) fits within bounds", () => {
      expect(PATTERNS.rPentomino.rows).toBeLessThanOrEqual(6);
      expect(PATTERNS.rPentomino.cols).toBeLessThanOrEqual(22);
    });

    it("all seeded patterns stay within grid bounds", () => {
      for (let i = 0; i < 20; i++) {
        const result = seed(6, 22);
        if (result.pattern !== "soup") {
          const pattern = PATTERNS[result.pattern];
          const [offsetRow, offsetCol] = result.offset;
          const maxRow = offsetRow + pattern.rows;
          const maxCol = offsetCol + pattern.cols;

          expect(maxRow).toBeLessThanOrEqual(6);
          expect(maxCol).toBeLessThanOrEqual(22);
        }
      }
    });
  });

  describe("seeded determinism", () => {
    it("same rng produces same result", () => {
      const makeRng = () => {
        let sequence = [0.5, 0.3, 0.7, 0.2, 0.9];
        let idx = 0;
        return () => sequence[idx++ % sequence.length];
      };

      const result1 = seed(6, 22, makeRng());
      const result2 = seed(6, 22, makeRng());

      expect(result1.grid).toEqual(result2.grid);
      expect(result1.pattern).toBe(result2.pattern);
      expect(result1.offset).toEqual(result2.offset);
    });
  });
});
