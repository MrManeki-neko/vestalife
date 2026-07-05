import { makeEmpty } from "./conway.js";
import { PATTERNS, randomSoup } from "./patterns.js";

const PATTERN_NAMES = Object.keys(PATTERNS);
const CHOICES = [...PATTERN_NAMES, "soup"];

export function seed(rows = 6, cols = 22, rng = Math.random) {
  const choice = CHOICES[Math.floor(rng() * CHOICES.length)];

  if (choice === "soup") {
    return {
      grid: randomSoup(rows, cols, 0.3, rng),
      pattern: "soup",
      offset: null,
    };
  }

  const def = PATTERNS[choice];
  const maxRow = rows - def.rows;
  const maxCol = cols - def.cols;
  const offsetRow = Math.floor(rng() * (maxRow + 1));
  const offsetCol = Math.floor(rng() * (maxCol + 1));

  const grid = makeEmpty(rows, cols);
  for (const [r, c] of def.cells) {
    grid[r + offsetRow][c + offsetCol] = 1;
  }

  return {
    grid,
    pattern: choice,
    offset: [offsetRow, offsetCol],
  };
}
