"use client";

import { useCallback, useRef, useState } from "react";
import type { MeasurementUnit } from "../plugin/types";
import { defaultMeasurementUnits } from "../units";

interface MeasureToolProps {
  pageWidthPts: number;
  pageHeightPts: number;
  canvasWidth: number;
  canvasHeight: number;
  /**
   * Measurement units to display in the readout. Defaults to
   * `[mmUnit, inchUnit, pointUnit]`. Pass `allMeasurementUnits` to
   * include pica + agate, or any custom subset/extension.
   */
  units?: ReadonlyArray<MeasurementUnit>;
}

interface Measurement {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Distance in PDF points — the canonical measurement. The
   *  rendered readout converts this through each unit's
   *  `fromPoints`. */
  distancePts: number;
}

export function MeasureTool({
  pageWidthPts,
  pageHeightPts,
  canvasWidth,
  canvasHeight,
  units = defaultMeasurementUnits,
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
    setMeasurement({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      distancePts,
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
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "crosshair",
        zIndex: 25,
        touchAction: "none",
      }}
    >
      {/* Ruler line (during drag or after measurement) */}
      {start && end && (
        <svg
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
          }}
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

      {/* Measurement label — opaque dark background so the readout
          stays legible over light artwork, dark backgrounds, photos,
          ruler tick marks, etc. */}
      {measurement && (
        <div
          style={{
            position: "absolute",
            left: midX + 8,
            top: midY - 24,
            zIndex: 30,
            pointerEvents: "none",
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid rgba(34, 197, 94, 0.6)",
            background: "rgba(15, 23, 42, 0.95)",
            color: "#bbf7d0",
            fontSize: 12,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontWeight: 500,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
          }}
        >
          {units
            .map((u) => {
              const value = u.fromPoints(measurement.distancePts);
              const rounded =
                u.id === "in"
                  ? Math.round(value * 1000) / 1000
                  : Math.round(value * 100) / 100;
              return `${rounded} ${u.label}`;
            })
            .join(" · ")}
        </div>
      )}

      {/* Drag hint — inline-styled so it always renders even when the
          host application doesn't include Tailwind utilities. */}
      {!start && (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 16,
            transform: "translateX(-50%)",
            zIndex: 30,
            pointerEvents: "none",
            padding: "4px 12px",
            borderRadius: 4,
            background: "rgba(0, 0, 0, 0.75)",
            color: "#fff",
            fontSize: 12,
            whiteSpace: "nowrap",
          }}
        >
          {isTouch
            ? "Tap and drag to measure distance."
            : "Click and drag to measure distance. Hold Shift to snap."}
        </div>
      )}
    </div>
  );
}
