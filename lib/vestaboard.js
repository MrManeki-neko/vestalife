const VESTABOARD_URL = "https://cloud.vestaboard.com/";
const LIVE_CODE = 71;
const DEAD_CODE = 0;

export function gridToCodes(grid) {
  return grid.map((row) => row.map((cell) => (cell ? LIVE_CODE : DEAD_CODE)));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptPush(codes, token) {
  try {
    const res = await fetch(VESTABOARD_URL, {
      method: "POST",
      headers: {
        "X-Vestaboard-Token": token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ characters: codes }),
    });
    return res;
  } catch (err) {
    return { ok: false, status: 0, _networkError: err };
  }
}

export async function pushToVestaboard(codes, token) {
  const first = await attemptPush(codes, token);

  if (first.ok || (first.status >= 200 && first.status < 300)) {
    return { ok: true };
  }

  if (first.status === 429 || first.status >= 500) {
    await delay(2000);
    const second = await attemptPush(codes, token);
    if (second.ok || (second.status >= 200 && second.status < 300)) {
      return { ok: true };
    }
    return {
      ok: false,
      error: `Vestaboard push failed after retry with status ${second.status}`,
    };
  }

  return {
    ok: false,
    error: `Vestaboard push failed with status ${first.status}`,
  };
}
