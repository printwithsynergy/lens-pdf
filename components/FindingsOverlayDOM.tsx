"use client";

/**
 * Renders preflight finding bounding boxes + F-number badges as
 * DOM elements (SVG + divs) positioned over a PDF page.
 *
 * Replaces the per-pixel canvas drawing in the legacy PageCanvas.
 * DOM-based overlays scale with CSS transforms (used by the new
 * react-pdf substrate's TransformWrapper) and stay crisp at any
 * zoom level. They're also accessible — each finding bbox is a
 * focusable button.
 */

import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { DecisionRecord, OverlayItem } from "../plugin/types";
import { collectItemRects } from "../plugin/fit";
import { SEVERITY_COLORS } from "../types";
import type { ThemeTokens } from "../plugin/services";

const TIER_STROKE: Record<string, string> = {
  error: SEVERITY_COLORS.error.stroke,
  warning: SEVERITY_COLORS.warning.stroke,
  advisory: SEVERITY_COLORS.advisory.stroke,
  info: "#94a3b8",
  neutral: "#94a3b8",
};

interface FindingsOverlayDOMProps {
  /** Rendered page width in CSS px (from PdfSubstrate's onPageRender). */
  pageWidthPx: number;
  /** Rendered page height in CSS px. */
  pageHeightPx: number;
  /** PDF page width in points (origin lower-left). */
  pageWidthPts: number;
  /** PDF page height in points. */
  pageHeightPts: number;
  /** Findings filtered to this page. */
  items: ReadonlyArray<OverlayItem>;
  /** Currently selected finding (or null). */
  selectedItem: OverlayItem | null;
  /** Click handler — fires when the user taps a bbox. */
  onItemClick: (item: OverlayItem) => void;
  /** Stable F1..FN numbers keyed by item id. */
  findingNumbers?: ReadonlyMap<string, number>;
  /** Active decisions keyed by finding id — dims any finding with
   *  an active approve/waive decision. */
  decisions?: Record<string, DecisionRecord>;
  /** Theme tokens for badge colors that fall outside the tier map. */
  tokens: ThemeTokens;
}

const EMPTY_NUMBERS: ReadonlyMap<string, number> = new Map();

function tierColor(tier: string | undefined): string {
  return TIER_STROKE[tier ?? "info"] ?? TIER_STROKE.info!;
}

interface PositionedRect {
  /** CSS px positions, origin top-left of the page. */
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PositionedItem {
  item: OverlayItem;
  /** bbox + every region, in render order. The first rect anchors the
   *  F-number badge; loc-less items never make it into this list. */
  rects: PositionedRect[];
}

function positionItems(
  items: ReadonlyArray<OverlayItem>,
  pageWidthPts: number,
  pageHeightPts: number,
  pageWidthPx: number,
  pageHeightPx: number,
): PositionedItem[] {
  const sx = pageWidthPx / pageWidthPts;
  const sy = pageHeightPx / pageHeightPts;
  const out: PositionedItem[] = [];
  for (const item of items) {
    // bbox + regions; empty for page-level / loc-less findings, which
    // are surfaced in the sidebar but never drawn on the canvas.
    const ptsRects = collectItemRects(item);
    if (ptsRects.length === 0) continue;
    const rects = ptsRects.map(([x0, y0, x1, y1]) => ({
      left: x0 * sx,
      // PDF Y origin is lower-left; flip to top-left for CSS.
      top: (pageHeightPts - y1) * sy,
      width: (x1 - x0) * sx,
      height: (y1 - y0) * sy,
    }));
    out.push({ item, rects });
  }
  return out;
}

function bboxStyle(
  pos: PositionedRect,
  color: string,
  isSelected: boolean,
  isDimmed: boolean,
): CSSProperties {
  return {
    position: "absolute",
    left: pos.left,
    top: pos.top,
    width: pos.width,
    height: pos.height,
    border: `${isSelected ? 2 : 1.5}px solid ${color}`,
    background: isSelected ? `${color}22` : `${color}11`,
    borderRadius: 1,
    cursor: "pointer",
    boxSizing: "border-box",
    opacity: isDimmed ? 0.45 : 1,
    transition: "background 0.12s, border-width 0.12s",
    pointerEvents: "auto",
  };
}

function badgeStyle(
  pos: PositionedRect,
  color: string,
  isSelected: boolean,
): CSSProperties {
  // Pill-shaped badge anchored to the bbox's top-right corner.
  const fontSize = isSelected ? 11 : 10;
  return {
    position: "absolute",
    left: pos.left + pos.width - (isSelected ? 26 : 24),
    top: pos.top - (isSelected ? 18 : 16),
    minWidth: isSelected ? 26 : 24,
    height: isSelected ? 16 : 14,
    padding: "0 6px",
    borderRadius: 999,
    background: color,
    color: "#fff",
    fontSize,
    fontWeight: 700,
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.18)",
    whiteSpace: "nowrap",
  };
}

export function FindingsOverlayDOM({
  pageWidthPx,
  pageHeightPx,
  pageWidthPts,
  pageHeightPts,
  items,
  selectedItem,
  onItemClick,
  findingNumbers = EMPTY_NUMBERS,
  decisions,
  tokens: _tokens,
}: FindingsOverlayDOMProps) {
  const positioned = useMemo(
    () =>
      positionItems(
        items,
        pageWidthPts,
        pageHeightPts,
        pageWidthPx,
        pageHeightPx,
      ),
    [items, pageWidthPts, pageHeightPts, pageWidthPx, pageHeightPx],
  );

  return (
    <div
      aria-label={`${positioned.length} preflight findings on this page`}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {positioned.map(({ item, rects }) => {
        const color = tierColor(item.tier);
        const isSelected = selectedItem?.id === item.id;
        const decision = decisions?.[item.id];
        const isDimmed = decision?.is_active === true;
        const findingN = findingNumbers.get(item.id);
        const primary = rects[0];
        return (
          <div key={item.id}>
            {rects.map((rect, ri) => (
              <button
                key={ri}
                type="button"
                aria-label={
                  rects.length > 1
                    ? `Finding: ${item.label ?? item.id} (region ${ri + 1} of ${rects.length})`
                    : `Finding: ${item.label ?? item.id}`
                }
                aria-pressed={isSelected}
                onClick={(e) => {
                  e.stopPropagation();
                  onItemClick(item);
                }}
                style={{
                  ...bboxStyle(rect, color, isSelected, isDimmed),
                  padding: 0,
                }}
              />
            ))}
            {findingN != null && primary && (
              <button
                type="button"
                aria-label={`Finding F${findingN}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onItemClick(item);
                }}
                style={badgeStyle(primary, color, isSelected)}
              >
                F{findingN}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
