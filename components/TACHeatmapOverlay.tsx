"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_DPI } from "../types";
import { useViewerHost } from "../host";

/** Per-text-run TAC reading, as returned by ``/tac-heatmap/runs``.
 *
 * Coordinates are PDF points with origin at the **top-left** of the
 * page (matches poppler's ``pdftotext -bbox`` output). The overlay
 * places an SVG hit rectangle at each run and shows a tooltip with the
 * bbox's mean TAC on hover.
 */
interface TacRun {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  mean_tac: number;
  limit: number;
  exceeds: boolean;
}

interface TacRunsResponse {
  job_id: string;
  page_num: number;
  dpi: number;
  tac_limit: number;
  runs: TacRun[];
}

interface TACHeatmapOverlayProps {
  jobId: string;
  pageNum: number;
  width: number;
  height: number;
  /** Page width in PDF points — needed to place SVG hit-targets from
   *  the top-left-origin bbox coordinates. */
  pageWidthPts?: number;
  /** Page height in PDF points. */
  pageHeightPts?: number;
  opacity?: number;
  dpi?: number;
  tacLimit?: number;
}

export function TACHeatmapOverlay({
  jobId: _jobId,
  pageNum,
  width,
  height,
  pageWidthPts,
  pageHeightPts,
  opacity = 0.5,
  dpi = DEFAULT_DPI,
  tacLimit = 300,
}: TACHeatmapOverlayProps) {
  const { apiBase } = useViewerHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [heatmapImg, setHeatmapImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [runs, setRuns] = useState<TacRun[]>([]);
  const [hoveredRun, setHoveredRun] = useState<{
    run: TacRun;
    /** Tooltip position in CSS pixels relative to the overlay origin. */
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");

    const img = new Image();
    img.onload = () => {
      setHeatmapImg(img);
      setLoading(false);
    };
    img.onerror = () => {
      setError("Failed to load TAC heatmap");
      setLoading(false);
    };
    img.src = `${apiBase}/pages/${pageNum}/tac-heatmap?dpi=${dpi}&tac_limit=${tacLimit}`;
  }, [apiBase, pageNum, dpi, tacLimit]);

  // Fetch run metadata in parallel with the PNG so the tooltip layer
  // and the pixel gradient appear together. A failure here doesn't
  // knock out the heatmap itself — the SVG layer just stays empty.
  useEffect(() => {
    let cancelled = false;
    setRuns([]);
    fetch(`${apiBase}/pages/${pageNum}/tac-heatmap/runs?dpi=${dpi}&tac_limit=${tacLimit}`)
      .then((res) => (res.ok ? (res.json() as Promise<TacRunsResponse>) : null))
      .then((json) => {
        if (!cancelled && json && Array.isArray(json.runs)) {
          setRuns(json.runs);
        }
      })
      .catch(() => {
        /* non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, pageNum, dpi, tacLimit]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapImg) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = opacity;
    ctx.drawImage(heatmapImg, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
  }, [heatmapImg, width, height, opacity]);

  if (loading) {
    return (
      <div
        className="absolute left-0 top-0 flex items-center justify-center"
        style={{ width, height }}
      >
        <div className="flex flex-col items-center gap-2 rounded-lg bg-black/60 px-4 py-3">
          <svg className="h-6 w-6 animate-spin text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <span className="text-xs text-white/70">Generating heatmap</span>
        </div>
      </div>
    );
  }

  if (error) {
    return null;
  }

  // pt → CSS-pixel scale. Falls back to identity when the caller didn't
  // pass dimensions (in that case the SVG layer is skipped entirely so
  // we don't render rectangles at nonsense coordinates).
  const sx = pageWidthPts && pageWidthPts > 0 ? width / pageWidthPts : 0;
  const sy = pageHeightPts && pageHeightPts > 0 ? height / pageHeightPts : 0;
  const showTooltipLayer = sx > 0 && sy > 0 && runs.length > 0;

  return (
    <>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="pointer-events-none absolute left-0 top-0"
        style={{ width, height }}
      />

      {/* Tooltip hit-target SVG. Sits above the canvas but below any
          drawing layer — reviewers can hover to read per-run mean TAC
          without the layer eating annotation pointer events (annotation
          layer is stacked above this by PdfViewer). */}
      {showTooltipLayer && (
        <svg
          className="pointer-events-none absolute left-0 top-0"
          style={{ width, height }}
          width={width}
          height={height}
        >
          {runs.map((run, idx) => {
            const x = run.x0 * sx;
            const y = run.y0 * sy;
            const w = Math.max(1, (run.x1 - run.x0) * sx);
            const h = Math.max(1, (run.y1 - run.y0) * sy);
            return (
              <rect
                key={idx}
                x={x}
                y={y}
                width={w}
                height={h}
                fill="transparent"
                stroke="transparent"
                style={{ pointerEvents: "all", cursor: "help" }}
                onMouseEnter={() =>
                  setHoveredRun({
                    run,
                    x: x + w / 2,
                    y,
                  })
                }
                onMouseLeave={() => setHoveredRun(null)}
              />
            );
          })}
        </svg>
      )}

      {hoveredRun && (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-md px-2 py-1 text-xs font-medium text-white shadow-lg"
          style={{
            left: hoveredRun.x,
            top: Math.max(0, hoveredRun.y - 4),
            backgroundColor: hoveredRun.run.exceeds
              ? "rgba(220, 38, 38, 0.95)"
              : "rgba(37, 99, 235, 0.92)",
          }}
        >
          Mean TAC {Math.round(hoveredRun.run.mean_tac)}%
          {hoveredRun.run.exceeds
            ? ` — exceeds ${Math.round(hoveredRun.run.limit)}% limit`
            : ` (limit ${Math.round(hoveredRun.run.limit)}%)`}
        </div>
      )}

      {/* Legend - positioned above mobile bottom sheet */}
      <div className="absolute bottom-20 right-2 rounded bg-black/80 p-2 text-xs text-white shadow-lg sm:bottom-2">
        <p className="mb-1 font-semibold">TAC Coverage</p>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ backgroundColor: "rgb(0, 180, 0)" }} />
          <span>&lt; 250%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ backgroundColor: "rgb(255, 200, 0)" }} />
          <span>250–{tacLimit}%</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block h-2 w-4 rounded" style={{ backgroundColor: "rgb(255, 0, 0)" }} />
          <span>&ge; {tacLimit}%</span>
        </div>
      </div>
    </>
  );
}
