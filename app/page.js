import { createStore } from "../lib/store.js";
import { countLive } from "../lib/conway.js";

export const dynamic = "force-dynamic";

function Message({ children }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#888",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        fontSize: "1.1rem",
      }}
    >
      {children}
    </main>
  );
}

function Board({ doc }) {
  const grid = doc.grid;
  const liveCells = countLive(grid);
  const seedLabel = doc.seed
    ? `seeded from ${doc.seed.pattern} at gen ${doc.seed.seededAtGen}`
    : "no seed info";

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#ccc",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "monospace",
        gap: "1.5rem",
        padding: "2rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateRows: `repeat(${grid.length}, 1fr)`,
          gap: "3px",
          background: "#000",
          padding: "8px",
          borderRadius: "4px",
        }}
      >
        {grid.map((row, r) => (
          <div key={r} style={{ display: "flex", gap: "3px" }}>
            {row.map((cell, c) => (
              <div
                key={c}
                style={{
                  width: "16px",
                  height: "16px",
                  background: cell ? "#f5f5f0" : "#1a1a1a",
                  borderRadius: "2px",
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center", fontSize: "0.9rem", lineHeight: 1.6 }}>
        <div>
          generation {doc.generation} &mdash; {liveCells} live cells
        </div>
        <div>{seedLabel}</div>
        <div>updated {doc.updatedAt}</div>
        {doc.lastPushOk === false && (
          <div style={{ color: "#c66" }}>last Vestaboard push failed</div>
        )}
      </div>
    </main>
  );
}

export default async function Page() {
  let doc = null;
  let errored = false;

  try {
    const store = createStore();
    doc = await store.get();
  } catch (err) {
    errored = true;
  }

  if (errored) {
    return <Message>vestalife is not configured yet.</Message>;
  }

  if (!doc) {
    return <Message>vestalife has not been seeded yet.</Message>;
  }

  return <Board doc={doc} />;
}
