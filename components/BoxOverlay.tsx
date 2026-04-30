"use client";

import { useState } from "react";
import type { DielineResult, PageInfo } from "../types";

interface BoxOverlayProps {
  page: PageInfo;
  canvasWidth: number;
  canvasHeight: number;
  /** Dieline payload; used to drop a per-region info icon at the
   *  centroid of each artwork cut area, in addition to the
   *  standard trim/bleed/crop page boxes. */
  dieline?: DielineResult | null;
}

/** Convert a PDF-coordinate box to pixel-space for the canvas. */
function boxToPixels(
  box: { x0: number; y0: number; x1: number; y1: number },
  page: PageInfo,
  canvasWidth: number,
  canvasHeight: number,
) {
  const scaleX = canvasWidth / page.width_pts;
  const scaleY = canvasHeight / page.height_pts;
  const mb = page.media_box;

  return {
    left: (box.x0 - mb.x0) * scaleX,
    top: canvasHeight - (box.y1 - mb.y0) * scaleY,
    width: (box.x1 - box.x0) * scaleX,
    height: (box.y1 - box.y0) * scaleY,
  };
}

function ptToMm(pts: number): number {
  return pts * 25.4 / 72;
}

function ptToInches(pts: number): number {
  return pts / 72;
}

function formatSize(widthPts: number, heightPts: number): {
  mm: string;
  inches: string;
} {
  return {
    mm: `${ptToMm(widthPts).toFixed(2)} × ${ptToMm(heightPts).toFixed(2)} mm`,
    inches: `${ptToInches(widthPts).toFixed(3)} × ${ptToInches(heightPts).toFixed(3)} in`,
  };
}

/**
 * BoxOverlay — Trim / Bleed / Crop box indicators with a clickable
 * info icon per box that reveals the dimensions in both millimetres
 * and inches. Multi-artwork files (front + back in one PDF) can have
 * different trim/bleed regions per page; the per-box popover lets
 * operators verify each one without mental conversion.
 */
export function BoxOverlay({ page, canvasWidth, canvasHeight, dieline }: BoxOverlayProps) {
  const [openPopover, setOpenPopover] = useState<string | null>(null);

  const boxes: {
    label: string;
    color: string;
    dashArray: string;
    box: { x0: number; y0: number; x1: number; y1: number };
  }[] = [];

  if (page.trim_box) {
    boxes.push({
      label: "Trim",
      color: "#3b82f6",
      dashArray: "none",
      box: page.trim_box,
    });
  }

  if (page.bleed_box) {
    boxes.push({
      label: "Bleed",
      color: "#22c55e",
      dashArray: "8 4",
      box: page.bleed_box,
    });
  }

  if (page.crop_box) {
    boxes.push({
      label: "Crop",
      color: "#a855f7",
      dashArray: "4 2",
      box: page.crop_box,
    });
  }

  if (boxes.length === 0) return null;

  return (
    <div
      className="absolute inset-0"
      style={{ zIndex: 15 }}
    >
      <svg
        width={canvasWidth}
        height={canvasHeight}
        style={{ pointerEvents: "none" }}
      >
        {boxes.map(({ label, color, dashArray, box }) => {
          const px = boxToPixels(box, page, canvasWidth, canvasHeight);
          return (
            <g key={label}>
              <rect
                x={px.left}
                y={px.top}
                width={px.width}
                height={px.height}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeDasharray={dashArray}
                opacity={0.8}
              />
              <text
                x={px.left + 22}
                y={px.top - 4}
                fill={color}
                fontSize={10}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Per-box info icons. Separate from the SVG so they can
          receive pointer events while the SVG grid stays
          non-interactive. */}
      {boxes.map(({ label, color, box }) => {
        const px = boxToPixels(box, page, canvasWidth, canvasHeight);
        const size = formatSize(box.x1 - box.x0, box.y1 - box.y0);
        const isOpen = openPopover === label;
        return (
          <div key={`icon-${label}`} className="absolute" style={{
            left: Math.max(0, px.left + 4),
            top: Math.max(0, px.top - 20),
          }}>
            <button
              type="button"
              aria-label={`${label} size`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenPopover(isOpen ? null : label);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ring-1 ring-black/20"
              style={{ backgroundColor: color }}
              title={`Show ${label.toLowerCase()} size`}
            >
              i
            </button>
            {isOpen && (
              <div
                className="absolute left-5 top-0 z-20 w-max rounded-md bg-black/90 px-3 py-2 text-xs text-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center gap-2 border-b border-white/10 pb-1">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-semibold">{label} size</span>
                </div>
                <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                  <span className="text-slate-400">Metric</span>
                  <span className="font-mono">{size.mm}</span>
                  <span className="text-slate-400">Imperial</span>
                  <span className="font-mono">{size.inches}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Per-dieline-region info icons. Placed at each region's
          centroid so multi-artwork files (circle + rectangle on one
          sheet) get one size popover per island instead of a single
          bounding-box aggregate. */}
      {dieline?.regions?.map((region, idx) => {
        const label = `Dieline ${idx + 1}`;
        const box = { x0: region.x0, y0: region.y0, x1: region.x1, y1: region.y1 };
        const px = boxToPixels(box, page, canvasWidth, canvasHeight);
        const size = formatSize(region.x1 - region.x0, region.y1 - region.y0);
        const isOpen = openPopover === label;
        const cx = px.left + px.width / 2;
        const cy = px.top + px.height / 2;
        const color = dieline.multi_color ? "#ef4444" : "#dc2626";
        return (
          <div
            key={`die-${idx}`}
            className="absolute"
            style={{ left: Math.max(0, cx - 8), top: Math.max(0, cy - 8) }}
          >
            <button
              type="button"
              aria-label={`${label} size`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenPopover(isOpen ? null : label);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white shadow ring-1 ring-black/20"
              style={{ backgroundColor: color }}
              title={`Show ${label.toLowerCase()} size`}
            >
              i
            </button>
            {isOpen && (
              <div
                className="absolute left-5 top-0 z-20 w-max rounded-md bg-black/90 px-3 py-2 text-xs text-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center gap-2 border-b border-white/10 pb-1">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-semibold">{label}</span>
                  {dieline.multi_color && (
                    <span className="ml-1 rounded bg-red-500/20 px-1 py-0.5 text-[9px] font-semibold text-red-300">
                      multi-colour
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
                  <span className="text-slate-400">Metric</span>
                  <span className="font-mono">{size.mm}</span>
                  <span className="text-slate-400">Imperial</span>
                  <span className="font-mono">{size.inches}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Legend */}
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 p-2 text-xs text-white">
        <p className="mb-1 font-semibold">Page Boxes</p>
        {boxes.map(({ label, color }) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-4 rounded"
              style={{ backgroundColor: color }}
            />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
