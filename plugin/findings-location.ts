/**
 * Findings location helpers — split OverlayItems into "located in
 * viewer" (those with a position the canvas can highlight + click)
 * and "informational" (page-level metadata that's still surfaced
 * to consumers, just not as a clickable overlay).
 *
 * Adapter authors moving findings from other preflight engines
 * (callas pdfToolbox, PitStop, Acrobat, lint-pdf, custom rule
 * engines) into Lens's contract should rely on these helpers to
 * categorise each finding the same way Lens's canvas does — there
 * is one source of truth for "can the viewer locate this?".
 *
 * @module
 */

import type { OverlayItem } from "./types";

/**
 * Decide whether an OverlayItem can be located on the page.
 *
 * Returns ``true`` when the item carries a bbox the canvas can
 * draw + tooltip + jump to, or a non-empty ``regions`` array for
 * multi-rect findings. Returns ``false`` for page-level items
 * (whole-page metadata, classification labels, document-scoped
 * advisories, etc.) — those should be surfaced separately and
 * NOT made clickable, since the click has nowhere to go.
 *
 * Hosts MUST use this predicate (not a bare ``item.bbox != null``
 * check) so future overlay kinds (regions, polygons, masks) stay
 * supported without each consumer growing its own duplicated
 * heuristic.
 */
export function hasViewerLocation(item: OverlayItem): boolean {
  if (Array.isArray(item.bbox) && item.bbox.length === 4) return true;
  // A multi-rect finding is located by its ``regions`` alone — adapter
  // authors that emit ``regions`` don't need to also set ``bbox`` for
  // the canvas to highlight + frame the item.
  if (Array.isArray(item.regions) && item.regions.length > 0) return true;
  return false;
}

/**
 * Split OverlayItems into ``{ located, informational }``.
 *
 * Order within each bucket is preserved — useful when the host
 * sorts findings by tier / page / severity before passing them
 * in and wants the sidebar to render in the same order.
 *
 * @example
 * ```ts
 * import { splitFindingsByLocation } from "@printwithsynergy/lens-pdf";
 *
 * const { located, informational } = splitFindingsByLocation(items);
 * // Pass `located` to <LensPDF items={...}> so only locatable
 * // findings draw on the canvas; render `informational` in a
 * // separate non-clickable section of your sidebar.
 * ```
 */
export function splitFindingsByLocation<T extends OverlayItem>(
  items: readonly T[],
): { located: T[]; informational: T[] } {
  const located: T[] = [];
  const informational: T[] = [];
  for (const item of items) {
    if (hasViewerLocation(item)) {
      located.push(item);
    } else {
      informational.push(item);
    }
  }
  return { located, informational };
}

/**
 * Assign stable 1-based F-numbers to every finding in input order.
 *
 * Returns a ``Map<id, number>`` so the viewer can render ``F1``…``FN``
 * badges that stay consistent across filter changes (the number
 * reflects global position in the finding list, not a filtered index).
 *
 * Findings use a separate numbering sequence from hand-drawn
 * annotations, which use their own ``#1``, ``#2``, … counter.
 */
export function buildFindingNumberMap(items: readonly OverlayItem[]): Map<string, number> {
  const map = new Map<string, number>();
  let n = 1;
  for (const item of items) {
    map.set(item.id, n++);
  }
  return map;
}
