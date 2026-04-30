"use client";

interface ZoomControlsProps {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  /** Compact mode: smaller buttons, no border. */
  compact?: boolean;
  /** Dark theme: light text on dark background. */
  dark?: boolean;
}

const ZOOM_STEPS = [25, 50, 75, 100, 125, 150, 200, 300, 400];

export function ZoomControls({ zoom, onZoomChange, compact, dark }: ZoomControlsProps) {
  const zoomIn = () => {
    const next = ZOOM_STEPS.find((z) => z > zoom);
    if (next) onZoomChange(next);
  };

  const zoomOut = () => {
    const prev = [...ZOOM_STEPS].reverse().find((z) => z < zoom);
    if (prev) onZoomChange(prev);
  };

  if (compact) {
    const btnClass = dark
      ? "rounded p-1 text-xs text-slate-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
      : "rounded p-1 text-xs hover:bg-muted disabled:opacity-40";
    const selectClass = dark
      ? "rounded border border-white/10 bg-white/[0.04] px-1 py-0.5 text-xs text-white outline-none"
      : "rounded border px-1 py-0.5 text-xs";

    return (
      <div className="flex items-center gap-0.5">
        <button onClick={zoomOut} disabled={zoom <= ZOOM_STEPS[0]!} className={btnClass} title="Zoom out">
          −
        </button>
        <select value={zoom} onChange={(e) => onZoomChange(Number(e.target.value))} className={selectClass}>
          {ZOOM_STEPS.map((z) => (
            <option key={z} value={z}>
              {z}%
            </option>
          ))}
        </select>
        <button onClick={zoomIn} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!} className={btnClass} title="Zoom in">
          +
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={zoomOut}
        disabled={zoom <= ZOOM_STEPS[0]!}
        className="rounded border px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
        title="Zoom out"
      >
        −
      </button>
      <select
        value={zoom}
        onChange={(e) => onZoomChange(Number(e.target.value))}
        className="rounded border px-1 py-1 text-sm"
      >
        {ZOOM_STEPS.map((z) => (
          <option key={z} value={z}>
            {z}%
          </option>
        ))}
      </select>
      <button
        onClick={zoomIn}
        disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]!}
        className="rounded border px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
        title="Zoom in"
      >
        +
      </button>
    </div>
  );
}
