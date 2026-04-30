"use client";

import { useCallback, useState } from "react";
import type { ColorSample } from "../types";
import { useViewerServices } from "../host";

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
  const { colorSample } = useViewerServices();
  const [sample, setSample] = useState<ColorSample | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);

  const pickAt = useCallback(
    async (clickX: number, clickY: number) => {
      // Convert to PDF coordinates (origin lower-left)
      const pdfX = (clickX / canvasWidth) * pageWidthPts;
      const pdfY = pageHeightPts - (clickY / canvasHeight) * pageHeightPts;

      setPosition({ x: clickX, y: clickY });
      setLoading(true);
      try {
        const data = await colorSample.sampleAt({ pageNum, pdfX, pdfY });
        if (data) setSample(data);
      } finally {
        setLoading(false);
      }
    },
    [colorSample, pageNum, pageWidthPts, pageHeightPts, canvasWidth, canvasHeight],
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
