export function makeEmpty(rows = 6, cols = 22) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    grid.push(new Array(cols).fill(0));
  }
  return grid;
}

function countNeighbors(grid, rows, cols, r, c, wrap) {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      let nr = r + dr;
      let nc = c + dc;
      if (wrap) {
        nr = (nr + rows) % rows;
        nc = (nc + cols) % cols;
      } else if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) {
        continue;
      }
      count += grid[nr][nc] ? 1 : 0;
    }
  }
  return count;
}

export function step(grid, wrap = true) {
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const next = makeEmpty(rows, cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const alive = grid[r][c] === 1;
      const neighbors = countNeighbors(grid, rows, cols, r, c, wrap);
      if (alive) {
        next[r][c] = neighbors === 2 || neighbors === 3 ? 1 : 0;
      } else {
        next[r][c] = neighbors === 3 ? 1 : 0;
      }
    }
  }
  return next;
}

export function isExtinct(grid) {
  for (const row of grid) {
    for (const cell of row) {
      if (cell) return false;
    }
  }
  return true;
}

export function hashGrid(grid) {
  let str = "";
  for (const row of grid) {
    for (const cell of row) {
      str += cell ? "1" : "0";
    }
  }
  // FNV-1a 32-bit
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function countLive(grid) {
  let count = 0;
  for (const row of grid) {
    for (const cell of row) {
      if (cell) count++;
    }
  }
  return count;
}
