/**
 * Viewer context — single argument passed to every plugin's `mount` /
 * `subscribe` call.
 *
 * The context is intentionally narrow: it captures viewer-state only
 * (page, zoom, pan, viewport, selection) plus the `services` surface
 * for SaaS-coupled features. **No findings, no LintPDF types** — the
 * `core/` namespace is the future LoupePDF OSS surface.
 *
 * Plugins that need richer data subscribe to it via
 * `services.annotations` or `services.pageImages`.
 *
 * @public
 */

import type { ViewerServices } from "./services";

/**
 * Read-only viewport state.
 *
 * @public
 */
export interface ViewerViewport {
  /** Width in CSS pixels. */
  readonly width: number;
  /** Height in CSS pixels. */
  readonly height: number;
}

/**
 * Read-only document metadata. Anything LintPDF-specific (job id,
 * brand spec, finding catalog) is exposed via services, not here.
 *
 * @public
 */
export interface ViewerDocumentMetadata {
  /** Total page count. */
  readonly pageCount: number;
  /** Per-page width/height in PDF points. */
  readonly pageDimensions: ReadonlyArray<{
    width: number;
    height: number;
  }>;
}

/**
 * Single argument bundle passed to plugins.
 *
 * @public
 */
export interface ViewerContext {
  /** 1-indexed current page. */
  readonly page: number;
  /** Zoom factor: 1.0 = 100%. */
  readonly zoom: number;
  /** Pan offset in CSS pixels (relative to viewport top-left). */
  readonly pan: { readonly x: number; readonly y: number };
  /** Current viewport size. */
  readonly viewport: ViewerViewport;
  /**
   * Bounding box (in PDF points) of the user's current selection,
   * or `null` if nothing is selected.
   */
  readonly selectionBbox: readonly [number, number, number, number] | null;
  /** Document metadata. */
  readonly document: ViewerDocumentMetadata;
  /** SaaS-coupled services. */
  readonly services: ViewerServices;
}
