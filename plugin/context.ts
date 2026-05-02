/**
 * Viewer context — single argument passed to every plugin's `mount` /
 * `subscribe` call.
 *
 * The context is intentionally narrow: viewer state only (page,
 * zoom, pan, viewport, selection) plus the `services` surface for
 * data sources. No host- or domain-shaped types live here — those
 * belong in plugin packs.
 *
 * Plugins that need richer data subscribe to it via the relevant
 * service (`services.annotations`, `services.pageImages`, etc.).
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
 * Read-only document metadata. Anything host- or domain-specific
 * (job id, brand spec, finding catalog, audit verdict) is exposed
 * via services or plugin payloads, not here.
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
  /** Host-supplied data-source services. */
  readonly services: ViewerServices;
}
