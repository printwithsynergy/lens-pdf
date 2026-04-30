"use client";

import { useCallback, useRef, useState } from "react";

interface MeasureToolProps {
  pageWidthPts: number;
  pageHeightPts: number;
  canvasWidth: number;
  canvasHeight: number;
}

interface Measurement {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distancePts: number;
  distanceMm: number;
  distanceIn: number;
}

export function MeasureTool({
  pageWidthPts,
  pageHeightPts,
  canvasWidth,
  canvasHeight,
}: MeasureToolProps) {
  const [measuring, setMeasuring] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const pixelToPts = useCallback(
    (px: number, py: number) => {
      const ptsX = (px / canvasWidth) * pageWidthPts;
      const ptsY = (py / canvasHeight) * pageHeightPts;
      return { x: ptsX, y: ptsY };
    },
    [canvasWidth, canvasHeight, pageWidthPts, pageHeightPts],
  );

  const beginMeasure = useCallback(
    (clientX: number, clientY: number, el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      setStart({ x, y });
      setEnd(null);
      setMeasurement(null);
      setMeasuring(true);
    },
    [],
  );

  const moveMeasure = useCallback(
    (clientX: number, clientY: number, el: HTMLElement, shiftKey?: boolean) => {
      if (!measuring || !start) return;
      const rect = el.getBoundingClientRect();
      let x = clientX - rect.left;
      let y = clientY - rect.top;
      if (shiftKey) {
        const dx = Math.abs(x - start.x);
        const dy = Math.abs(y - start.y);
        if (dx > dy) y = start.y;
        else x = start.x;
      }
      setEnd({ x, y });
    },
    [measuring, start],
  );

  const finishMeasure = useCallback(() => {
    if (!measuring || !start || !end) {
      setMeasuring(false);
      return;
    }
    const p1 = pixelToPts(start.x, start.y);
    const p2 = pixelToPts(end.x, end.y);
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const distancePts = Math.sqrt(dx * dx + dy * dy);
    const distanceMm = distancePts * (25.4 / 72);
    const distanceIn = distancePts / 72;
    setMeasurement({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      distancePts: Math.round(distancePts * 100) / 100,
      distanceMm: Math.round(distanceMm * 100) / 100,
      distanceIn: Math.round(distanceIn * 1000) / 1000,
    });
    setMeasuring(false);
  }, [measuring, start, end, pixelToPts]);

  // Mouse handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => beginMeasure(e.clientX, e.clientY, e.currentTarget),
    [beginMeasure],
  );
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => moveMeasure(e.clientX, e.clientY, e.currentTarget, e.shiftKey),
    [moveMeasure],
  );
  const handleMouseUp = useCallback(() => finishMeasure(), [finishMeasure]);

  // Touch handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0]!;
      beginMeasure(t.clientX, t.clientY, e.currentTarget);
    },
    [beginMeasure],
  );
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0]!;
      moveMeasure(t.clientX, t.clientY, e.currentTarget);
    },
    [moveMeasure],
  );
  const handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      e.preventDefault();
      finishMeasure();
    },
    [finishMeasure],
  );

  const isTouch = typeof window !== "undefined" && "ontouchstart" in window;

  const midX = start && end ? (start.x + end.x) / 2 : 0;
  const midY = start && end ? (start.y + end.y) / 2 : 0;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ zIndex: 25, touchAction: "none" }}
    >
      {/* Ruler line (during drag or after measurement) */}
      {start && end && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={canvasWidth}
          height={canvasHeight}
        >
          <line
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="6 3"
          />
          {/* Endpoint dots */}
          <circle cx={start.x} cy={start.y} r={4} fill="#22c55e" />
          <circle cx={end.x} cy={end.y} r={4} fill="#22c55e" />
        </svg>
      )}

      {/* Measurement label */}
      {measurement && (
        <div
          className="pointer-events-none absolute z-30 rounded bg-green-900/90 px-2 py-1 text-xs font-mono text-green-100 shadow-lg"
          style={{ left: midX + 8, top: midY - 24 }}
        >
          {measurement.distanceMm} mm &middot; {measurement.distanceIn}&quot; &middot; {measurement.distancePts} pt
        </div>
      )}

      {/* Drag hint */}
      {!start && (
        <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white">
          {isTouch ? "Tap and drag to measure distance." : "Click and drag to measure distance. Hold Shift to snap."}
        </div>
      )}
    </div>
  );
}
