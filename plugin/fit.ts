/**
 * Geometry helpers for framing a finding on the page.
 *
 * `computeFitScale` returns the transform scale that fits a rectangle
 * into the viewport with padding (clamped to the viewer's zoom limits);
 * `unionBbox` collapses a finding's bbox + regions into one bounding
 * rect so a multi-region finding frames as a single group.
 *
 * Pure + side-effect free so the zoom math is unit-testable without a
 * DOM or the react-zoom-pan-pinch runtime.
 *
 * @module
 */

import type { OverlayItem } from "./types";

/** PDF-points bounding box: ``[x0, y0, x1, y1]`` (origin lower-left). */
export type Bbox = readonly [number, number, number, number];

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export interface FitScaleOptions {
  /** CSS-px gap kept between the framed rect and each viewport edge. */
  padding?: number;
  /** Lower zoom bound (transform scale, 1 = 100%). */
  minScale?: number;
  /** Upper zoom bound — stops a tiny finding zooming to a blurry crop. */
  maxScale?: number;
}

/**
 * Scale (1 = 100%) that frames a ``rectWidthPx × rectHeightPx``
 * rectangle inside a ``viewportWidthPx × viewportHeightPx`` viewport,
 * leaving ``padding`` px around it, clamped to ``[minScale, maxScale]``.
 *
 * Degenerate inputs (non-positive rect or viewport) fall back to a
 * clamped 1.0 so a caller never divides by zero or applies NaN.
 */
export function computeFitScale(
  rectWidthPx: number,
  rectHeightPx: number,
  viewportWidthPx: number,
  viewportHeightPx: number,
  options: FitScaleOptions = {},
): number {
  const padding = options.padding ?? 48;
  const minScale = options.minScale ?? 0.25;
  const maxScale = options.maxScale ?? 4;
  if (
    !(rectWidthPx > 0) ||
    !(rectHeightPx > 0) ||
    !(viewportWidthPx > 0) ||
    !(viewportHeightPx > 0)
  ) {
    return clamp(1, minScale, maxScale);
  }
  const availW = Math.max(1, viewportWidthPx - 2 * padding);
  const availH = Math.max(1, viewportHeightPx - 2 * padding);
  const fit = Math.min(availW / rectWidthPx, availH / rectHeightPx);
  return clamp(fit, minScale, maxScale);
}

/**
 * Smallest bbox covering every rect in ``rects``, or ``null`` when the
 * list is empty. Corners are normalized, so a rect that arrives with
 * swapped ``x0/x1`` or ``y0/y1`` still contributes correctly.
 */
export function unionBbox(rects: readonly Bbox[]): Bbox | null {
  if (rects.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [a, b, c, d] of rects) {
    x0 = Math.min(x0, a, c);
    y0 = Math.min(y0, b, d);
    x1 = Math.max(x1, a, c);
    y1 = Math.max(y1, b, d);
  }
  return [x0, y0, x1, y1];
}

/**
 * Every locatable rect on a finding: its ``bbox`` (when present)
 * followed by each entry in ``regions``. Empty for page-level /
 * loc-less findings, which the viewer surfaces in the sidebar but
 * never draws or frames.
 */
export function collectItemRects(item: OverlayItem): Bbox[] {
  const rects: Bbox[] = [];
  if (item.bbox) rects.push(item.bbox);
  if (item.regions) {
    for (const r of item.regions) rects.push(r);
  }
  return rects;
}

/** Union of all of a finding's rects, or ``null`` when loc-less. */
export function itemFocusBbox(item: OverlayItem): Bbox | null {
  return unionBbox(collectItemRects(item));
}

/**
 * Element-wise equality on two bboxes (treating ``null`` as a valid
 * value). Used by the substrate's focus effect to dedupe re-framing:
 * if a finding's id stays the same but its bbox/regions change
 * (e.g. live preflight enriches it in place), we still want to
 * re-fit, but rapid re-renders that hand us an equivalent rect
 * shouldn't yank the view back.
 */
export function rectsEqual(a: Bbox | null, b: Bbox | null): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}
