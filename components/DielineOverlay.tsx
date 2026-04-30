"use client";

import { useState } from "react";
import type { DielineResult, PageInfo } from "../types";

interface DielineOverlayProps {
  page: PageInfo;
  canvasWidth: number;
  canvasHeight: number;
  dieline: DielineResult | null | undefined;
}

/**
 * DielineOverlay — standalone info-icon overlay for dieline
 * regions. Renders one ``i`` chip at the centroid of each
 * extracted region so operators can click to see width/height
 * in mm + inches. Independent of ``BoxOverlay`` so users don't
 * have to flip on the Trim/Bleed Boxes toolbar to see dieline
 * sizes.
 */
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

function ptToInches(pts: number): number {
  return pts / 72;
}

function formatSize(widthPts: number, heightPts: number) {
  return {
    mm: `${(widthPts * 25.4 / 72).toFixed(2)} × ${(heightPts * 25.4 / 72).toFixed(2)} mm`,
    inches: `${ptToInches(widthPts).toFixed(3)} × ${ptToInches(heightPts).toFixed(3)} in`,
  };
}

export function DielineOverlay({
  page,
  canvasWidth,
  canvasHeight,
  dieline,
}: DielineOverlayProps) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const regions = dieline?.regions ?? [];
  if (regions.length === 0) return null;
  const color = dieline?.multi_color ? "#ef4444" : "#dc2626";

  return (
    <div className="absolute inset-0" style={{ zIndex: 16 }}>
      {regions.map((region, idx) => {
        const box = {
          x0: region.x0,
          y0: region.y0,
          x1: region.x1,
          y1: region.y1,
        };
        const px = boxToPixels(box, page, canvasWidth, canvasHeight);
        const cx = px.left + px.width / 2;
        const cy = px.top + px.height / 2;
        const size = formatSize(region.x1 - region.x0, region.y1 - region.y0);
        const isOpen = openIdx === idx;
        const label = regions.length > 1 ? `Dieline ${idx + 1}` : "Dieline";
        return (
          <div
            key={`die-icon-${idx}`}
            className="absolute"
            style={{ left: Math.max(0, cx - 8), top: Math.max(0, cy - 8) }}
          >
            <button
              type="button"
              aria-label={`${label} size`}
              title={`Show ${label.toLowerCase()} size`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenIdx(isOpen ? null : idx);
              }}
              className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ring-1 ring-black/30"
              style={{ backgroundColor: color }}
            >
              i
            </button>
            {isOpen && (
              <div
                className="absolute left-6 top-0 z-20 w-max rounded-md bg-black/90 px-3 py-2 text-xs text-white shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-1 flex items-center gap-2 border-b border-white/10 pb-1">
                  <span
                    className="inline-block h-2 w-2 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-semibold">{label}</span>
                  {dieline?.multi_color && (
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
    </div>
  );
}
