import { useState, type CSSProperties } from "react";
import { Showcase } from "./Showcase";
import { SmokeTest } from "./SmokeTest";

/**
 * Demo entry point — top-level switch between:
 *
 *  - **Findings showcase** (default) — mounts the full `LensPDFDemo`
 *    against a sample PDF + curated `OverlayItem`s that exercise the
 *    new finding behaviors (zoom-to-fit on select, multi-region
 *    highlighting, loc-less = annotation only, cross-page jumps).
 *
 *  - **Hide-on-unwired smoke** — the original smoke test from PR #3 /
 *    #4: flips between empty, pdf.js fallback, and fully-mocked host
 *    contexts to verify every component hides silently when its
 *    services aren't wired.
 */

type Mode = "showcase" | "smoke";

export function App() {
  const [mode, setMode] = useState<Mode>("showcase");
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#020617",
      }}
    >
      <nav
        style={{
          display: "flex",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid #1e293b",
          background: "#0b1220",
          alignItems: "center",
        }}
      >
        <button onClick={() => setMode("showcase")} style={tabStyle(mode === "showcase")}>
          Findings showcase
        </button>
        <button onClick={() => setMode("smoke")} style={tabStyle(mode === "smoke")}>
          Hide-on-unwired smoke
        </button>
        <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 11 }}>
          LensPDF demo · pnpm dev
        </span>
      </nav>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {mode === "showcase" ? <Showcase /> : <SmokeTest />}
      </div>
    </div>
  );
}

function tabStyle(active: boolean): CSSProperties {
  return {
    padding: "6px 12px",
    background: active ? "#1d4ed8" : "#0f172a",
    color: active ? "#fff" : "#cbd5e1",
    border: "1px solid",
    borderColor: active ? "#3b82f6" : "#1e293b",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
  };
}
