"use client";

import { useCallback, useState } from "react";
import type { ColorSample } from "../../types";
import { useViewerHost } from "../host";

interface ColorPickerToolProps {
  jobId: string;
  pageNum: number;
  pageWidthPts: number;
  pageHeightPts: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function ColorPickerTool({
  jobId: _jobId,
  pageNum,
  pageWidthPts,
  pageHeightPts,
  canvasWidth,
  canvasHeight,
}: ColorPickerToolProps) {
  const { apiBase } = useViewerHost();
  const [sample, setSample] = useState<ColorSample | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert to PDF coordinates (origin lower-left)
      const pdfX = (clickX / canvasWidth) * pageWidthPts;
      const pdfY = pageHeightPts - (clickY / canvasHeight) * pageHeightPts;

      setPosition({ x: clickX, y: clickY });
      setLoading(true);

      try {
        const resp = await fetch(
          `${apiBase}/pages/${pageNum}/sample?x=${pdfX.toFixed(1)}&y=${pdfY.toFixed(1)}&dpi=300`,
        );
        if (resp.ok) {
          const data = await resp.json();
          setSample(data);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    },
    [apiBase, pageNum, pageWidthPts, pageHeightPts, canvasWidth, canvasHeight],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0]!;
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = touch.clientX - rect.left;
      const clickY = touch.clientY - rect.top;
      const pdfX = (clickX / canvasWidth) * pageWidthPts;
      const pdfY = pageHeightPts - (clickY / canvasHeight) * pageHeightPts;
      setPosition({ x: clickX, y: clickY });
      setLoading(true);
      fetch(`${apiBase}/pages/${pageNum}/sample?x=${pdfX.toFixed(1)}&y=${pdfY.toFixed(1)}&dpi=300`)
        .then((r) => r.ok ? r.json() : null)
        .then((data) => { if (data) setSample(data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    },
    [apiBase, pageNum, pageWidthPts, pageHeightPts, canvasWidth, canvasHeight],
  );

  return (
    <div
      className="absolute inset-0 cursor-crosshair"
      style={{ zIndex: 25, touchAction: "none" }}
      onClick={handleClick}
      onTouchStart={handleTouch}
    >
      {position && sample && (
        <div
          className="pointer-events-none absolute z-30 rounded-lg border bg-black/90 px-3 py-2 text-xs text-white shadow-lg"
          style={{
            left: Math.min(position.x + 16, canvasWidth - 200),
            top: Math.min(position.y + 16, canvasHeight - 100),
          }}
        >
          <div className="mb-1 flex items-center gap-2">
            <div
              className="h-4 w-4 rounded border border-white/30"
              style={{ backgroundColor: sample.hex }}
            />
            <span className="font-mono font-bold">{sample.hex.toUpperCase()}</span>
          </div>
          <div className="space-y-0.5 text-[10px] text-gray-300">
            <div>
              RGB: {sample.rgb[0]}, {sample.rgb[1]}, {sample.rgb[2]}
            </div>
            {sample.tac !== null && <div>TAC: {sample.tac.toFixed(1)}%</div>}
          </div>
        </div>
      )}
      {position && loading && (
        <div
          className="pointer-events-none absolute z-30 rounded border bg-black/80 px-2 py-1 text-[10px] text-white"
          style={{ left: position.x + 16, top: position.y + 16 }}
        >
          Sampling...
        </div>
      )}
      {/* Crosshair cursor indicator */}
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
