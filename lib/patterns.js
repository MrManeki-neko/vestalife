import { makeEmpty } from "./conway.js";

export const PATTERNS = {
  glider: {
    cells: [
      [0, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ],
    rows: 3,
    cols: 3,
  },
  blinker: {
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    rows: 1,
    cols: 3,
  },
  toad: {
    cells: [
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 0],
      [1, 1],
      [1, 2],
    ],
    rows: 2,
    cols: 4,
  },
  beacon: {
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
      [2, 2],
      [2, 3],
      [3, 2],
      [3, 3],
    ],
    rows: 4,
    cols: 4,
  },
  lwss: {
    cells: [
      [0, 1],
      [0, 4],
      [1, 0],
      [2, 0],
      [2, 4],
      [3, 0],
      [3, 1],
      [3, 2],
      [3, 3],
    ],
    rows: 4,
    cols: 5,
  },
  rPentomino: {
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [2, 1],
    ],
    rows: 3,
    cols: 3,
  },
};

export function randomSoup(rows, cols, density = 0.3, rng = Math.random) {
  const grid = makeEmpty(rows, cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      grid[r][c] = rng() < density ? 1 : 0;
    }
  }
  return grid;
}
