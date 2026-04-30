"use client";

import { useCallback, useState } from "react";
import type { DensitometerSample } from "../types";
import { useViewerHost } from "../host";

interface DensitometerToolProps {
  jobId: string;
  pageNum: number;
  pageWidthPts: number;
  pageHeightPts: number;
  canvasWidth: number;
  canvasHeight: number;
  /** TAC limit in percent (default 300). Matches separations config. */
  tacLimit?: number;
}

/**
 * Real CMYK + spot-channel densitometer. Samples each ink channel at the
 * clicked point and reports:
 *
 *   C  62.3%  M  18.1%
 *   Y   4.7%  K  91.5%
 *   ────────────────
 *   TAC 176.6%   (under 300)
 *
 * Falls back to a friendly "no separations" message on RGB/greyscale
 * source PDFs where the engine can't split CMYK.
 */
export function DensitometerTool({
  jobId: _jobId,
  pageNum,
  pageWidthPts,
  pageHeightPts,
  canvasWidth,
  canvasHeight,
  tacLimit = 300,
}: DensitometerToolProps) {
  const { apiBase } = useViewerHost();
  const [sample, setSample] = useState<DensitometerSample | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAt = useCallback(
    async (clickX: number, clickY: number) => {
      const pdfX = (clickX / canvasWidth) * pageWidthPts;
      const pdfY = pageHeightPts - (clickY / canvasHeight) * pageHeightPts;

      setPosition({ x: clickX, y: clickY });
      setLoading(true);
      setError(null);
      setSample(null);

      try {
        const resp = await fetch(
          `${apiBase}/pages/${pageNum}/densitometer` +
            `?x=${pdfX.toFixed(1)}&y=${pdfY.toFixed(1)}&dpi=300&tac_limit=${tacLimit}`,
        );
        if (resp.ok) {
          const data: DensitometerSample = await resp.json();
          setSample(data);
        } else if (resp.status === 422) {
          const body = await resp.json().catch(() => ({ detail: "No separations" }));
          setError(body.detail ?? "No separations available for this page.");
        } else {
          setError(`Sampling failed (${resp.status})`);
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    },
    [apiBase, pageNum, pageWidthPts, pageHeightPts, canvasWidth, canvasHeight, tacLimit],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      void pickAt(e.clientX - rect.left, e.clientY - rect.top);
    },
    [pickAt],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0]!;
      const rect = e.currentTarget.getBoundingClientRect();
      void pickAt(touch.clientX - rect.left, touch.clientY - rect.top);
    },
    [pickAt],
  );

  // Map channel name to a solid swatch colour for the readout. Process
  // channels use the standard CMYK primaries; any spot channel falls back
  // to neutral grey.
  const swatchFor = (name: string): string => {
    const n = name.toLowerCase();
    if (n.startsWith("c") && !n.includes("o")) return "#00b7eb";
    if (n.startsWith("m")) return "#e91e63";
    if (n.startsWith("y")) return "#fdd835";
    if (n.startsWith("k") || n.startsWith("b")) return "#111827";
    return "#94a3b8";
  };

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      style={{ zIndex: 25, touchAction: "none" }}
      onClick={handleClick}
      onTouchStart={handleTouch}
    >
      {position && (sample || loading || error) && (
        <div
          className="pointer-events-none absolute z-30 rounded-lg border border-white/20 bg-black/90 px-3 py-2 text-xs text-white shadow-xl"
          style={{
            left: Math.min(position.x + 16, canvasWidth - 230),
            top: Math.min(position.y + 16, canvasHeight - 140),
            minWidth: 200,
          }}
        >
          {loading && <div className="text-[11px] text-slate-300">Sampling separations…</div>}
          {error && !loading && (
            <div className="space-y-1">
              <div className="font-semibold text-amber-300">Densitometer</div>
              <div className="text-[11px] text-slate-300">{error}</div>
            </div>
          )}
          {sample && !loading && (
            <>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Densitometer
                </span>
                <span className="text-[10px] text-slate-400">@300dpi</span>
              </div>
              <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px]">
                {sample.channels.map((ch) => (
                  <div key={ch.name} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-sm border border-white/30"
                      style={{ backgroundColor: swatchFor(ch.name) }}
                    />
                    <span className="w-6 text-slate-300">{ch.name.slice(0, 1).toUpperCase()}</span>
                    <span className="flex-1 text-right tabular-nums">
                      {ch.percent.toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/15 pt-1.5">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-slate-300">TAC</span>
                  <span
                    className={`tabular-nums font-bold ${
                      sample.limit_exceeded ? "text-rose-400" : "text-emerald-300"
                    }`}
                  >
                    {sample.tac.toFixed(1)}%
                  </span>
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  {sample.limit_exceeded
                    ? `over ${sample.tac_limit}% limit`
                    : `under ${sample.tac_limit}% limit`}
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {/* Crosshair at last-clicked point */}
      {position && (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            left: position.x - 8,
            top: position.y - 8,
            width: 16,
            height: 16,
            border: "2px solid white",
            borderRadius: "50%",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      )}
    </div>
  );
}
