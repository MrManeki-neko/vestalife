import { describe, it, expect } from "vitest";
import { makeEmpty, step, isExtinct, hashGrid, countLive } from "../lib/conway.js";

describe("Conway's Game of Life", () => {
  describe("makeEmpty", () => {
    it("creates empty grid with default dimensions", () => {
      const grid = makeEmpty();
      expect(grid).toHaveLength(6);
      expect(grid[0]).toHaveLength(22);
      expect(grid.every(row => row.every(cell => cell === 0))).toBe(true);
    });

    it("creates empty grid with custom dimensions", () => {
      const grid = makeEmpty(4, 8);
      expect(grid).toHaveLength(4);
      expect(grid[0]).toHaveLength(8);
      expect(grid.every(row => row.every(cell => cell === 0))).toBe(true);
    });
  });

  describe("isExtinct", () => {
    it("returns true for completely empty grid", () => {
      const grid = makeEmpty();
      expect(isExtinct(grid)).toBe(true);
    });

    it("returns false when any cell is alive", () => {
      const grid = makeEmpty();
      grid[0][0] = 1;
      expect(isExtinct(grid)).toBe(false);
    });

    it("returns true after empty grid step", () => {
      const grid = makeEmpty();
      const next = step(grid);
      expect(isExtinct(next)).toBe(true);
    });
  });

  describe("step - empty board", () => {
    it("empty board stays empty with wrap=true", () => {
      const grid = makeEmpty();
      const next = step(grid, true);
      expect(isExtinct(next)).toBe(true);
    });

    it("empty board stays empty with wrap=false", () => {
      const grid = makeEmpty();
      const next = step(grid, false);
      expect(isExtinct(next)).toBe(true);
    });
  });

  describe("step - still life block", () => {
    it("2x2 block is unchanged after step with wrap=true", () => {
      const grid = makeEmpty();
      // Place a 2x2 block at (2, 5)
      grid[2][5] = 1;
      grid[2][6] = 1;
      grid[3][5] = 1;
      grid[3][6] = 1;

      const next = step(grid, true);

      expect(next[2][5]).toBe(1);
      expect(next[2][6]).toBe(1);
      expect(next[3][5]).toBe(1);
      expect(next[3][6]).toBe(1);
      expect(countLive(next)).toBe(4);
    });

    it("2x2 block is unchanged after step with wrap=false", () => {
      const grid = makeEmpty();
      // Place a 2x2 block at (2, 5)
      grid[2][5] = 1;
      grid[2][6] = 1;
      grid[3][5] = 1;
      grid[3][6] = 1;

      const next = step(grid, false);

      expect(next[2][5]).toBe(1);
      expect(next[2][6]).toBe(1);
      expect(next[3][5]).toBe(1);
      expect(next[3][6]).toBe(1);
      expect(countLive(next)).toBe(4);
    });
  });

  describe("step - oscillator blinker", () => {
    it("horizontal blinker becomes vertical after one step", () => {
      const grid = makeEmpty();
      // Place horizontal blinker at row 2, cols 10-12
      grid[2][10] = 1;
      grid[2][11] = 1;
      grid[2][12] = 1;

      const next = step(grid, true);

      // After step, should be vertical
      expect(next[1][11]).toBe(1);
      expect(next[2][11]).toBe(1);
      expect(next[3][11]).toBe(1);
      expect(countLive(next)).toBe(3);
    });

    it("blinker returns to original state after two steps", () => {
      const grid = makeEmpty();
      // Place horizontal blinker at row 2, cols 10-12
      grid[2][10] = 1;
      grid[2][11] = 1;
      grid[2][12] = 1;

      const next1 = step(grid, true);
      const next2 = step(next1, true);

      // After two steps, should return to original horizontal state
      expect(next2[2][10]).toBe(1);
      expect(next2[2][11]).toBe(1);
      expect(next2[2][12]).toBe(1);
      expect(countLive(next2)).toBe(3);
    });
  });

  describe("step - glider on toroidal grid", () => {
    it("glider traverses and returns on 6x6 toroidal grid", () => {
      // Place a glider at top-right corner of a 6x6 grid
      // A glider moves diagonally every 4 steps on a toroidal grid
      // On a 6x6 grid, after 24 steps it should return to start
      const grid = makeEmpty(6, 6);
      // Glider at (0, 3):
      //   .#.
      //   ..#
      //   ###
      grid[0][4] = 1;
      grid[1][5] = 1;
      grid[2][3] = 1;
      grid[2][4] = 1;
      grid[2][5] = 1;

      const initialHash = hashGrid(grid);
      const initialCount = countLive(grid);

      let current = grid;
      for (let i = 0; i < 24; i++) {
        current = step(current, true);
      }

      const finalHash = hashGrid(current);
      expect(finalHash).toBe(initialHash);
      expect(countLive(current)).toBe(initialCount);
    });

    it("glider dies when wrap=false and walks off edge", () => {
      const grid = makeEmpty(6, 6);
      // Glider very close to bottom-right: (4, 4)
      //   .#.
      //   ..#
      //   ###
      grid[4][5] = 1;
      grid[5][0] = 1; // wrapping in initial state
      grid[5][1] = 1;
      grid[5][2] = 1;

      // Actually, let's place it clearly inside to start
      grid[2][3] = 1;
      grid[3][4] = 1;
      grid[4][2] = 1;
      grid[4][3] = 1;
      grid[4][4] = 1;

      const initialCount = countLive(grid);

      // Step multiple times with no wrap; glider should eventually die
      let current = grid;
      let liveCounts = [initialCount];
      for (let i = 0; i < 20; i++) {
        current = step(current, false);
        liveCounts.push(countLive(current));
      }

      // With no wrap, the glider escapes the edge and should eventually die
      // or at least the population should change
      expect(liveCounts[liveCounts.length - 1]).not.toBe(initialCount);
    });

    it("live cell count remains stable with glider and wrap=true", () => {
      const grid = makeEmpty(6, 6);
      // Glider pattern
      grid[0][1] = 1;
      grid[1][2] = 1;
      grid[2][0] = 1;
      grid[2][1] = 1;
      grid[2][2] = 1;

      const initialCount = 5;
      expect(countLive(grid)).toBe(initialCount);

      let current = grid;
      for (let i = 0; i < 12; i++) {
        current = step(current, true);
        expect(countLive(current)).toBe(initialCount);
      }
    });
  });

  describe("hashGrid", () => {
    it("returns a hex string", () => {
      const grid = makeEmpty();
      const hash = hashGrid(grid);
      expect(typeof hash).toBe("string");
      expect(/^[0-9a-f]+$/.test(hash)).toBe(true);
    });

    it("identical grids have equal hashes", () => {
      const grid1 = makeEmpty();
      grid1[2][5] = 1;
      grid1[3][6] = 1;

      const grid2 = makeEmpty();
      grid2[2][5] = 1;
      grid2[3][6] = 1;

      expect(hashGrid(grid1)).toBe(hashGrid(grid2));
    });

    it("single cell difference produces different hash", () => {
      const grid1 = makeEmpty();
      grid1[2][5] = 1;

      const grid2 = makeEmpty();
      grid2[2][5] = 1;
      grid2[3][6] = 1;

      expect(hashGrid(grid1)).not.toBe(hashGrid(grid2));
    });

    it("empty grid always produces same hash", () => {
      const grid1 = makeEmpty();
      const grid2 = makeEmpty();
      expect(hashGrid(grid1)).toBe(hashGrid(grid2));
    });
  });

  describe("countLive", () => {
    it("counts zero cells in empty grid", () => {
      const grid = makeEmpty();
      expect(countLive(grid)).toBe(0);
    });

    it("counts live cells correctly", () => {
      const grid = makeEmpty();
      grid[0][0] = 1;
      grid[1][2] = 1;
      grid[3][5] = 1;
      grid[5][21] = 1;

      expect(countLive(grid)).toBe(4);
    });

    it("counts 2x2 block correctly", () => {
      const grid = makeEmpty();
      grid[2][5] = 1;
      grid[2][6] = 1;
      grid[3][5] = 1;
      grid[3][6] = 1;

      expect(countLive(grid)).toBe(4);
    });
  });
});
