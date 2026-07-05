export const ROWS = 6;
export const COLS = 22;
export const HISTORY_LENGTH = 12;

export function wrapEdges() {
  return process.env.WRAP_EDGES !== "false";
}
