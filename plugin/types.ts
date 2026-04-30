/**
 * Viewer plugin protocol — slot types + plugin shape.
 *
 * Phase 1 introduces this protocol alongside the existing flat
 * component layout. New features land as plugins; the existing 28
 * components stay in `src/` until Phase 2 moves them under
 * `core/components/` and `lintpdf/plugins/`.
 *
 * Slots map to where a plugin's `mount()` return value renders:
 * - `overlay.canvas` — absolutely-positioned over the page canvas;
 *   draws annotation/finding overlays.
 * - `panel.right`, `panel.left`, `panel.bottom` — side/bottom panels.
 * - `toolbar.top`, `toolbar.left`, `toolbar.bottom` — toolbar pills.
 * - `annotation.source` — non-visual; supplies annotation data via
 *   `AnnotationSourceProvider`.
 * - `dialog.modal` — modal dialog launched from another plugin.
 *
 * After Phase 3 the `core/` package ships as `@thinkneverland/loupe-pdf`
 * (MIT, OSS) and the LintPDF-flavoured plugins ship as
 * `@thinkneverland/loupe-plugin-lintpdf` (proprietary).
 *
 * @public
 */

import type { ReactNode } from "react";

import type { ViewerContext } from "./context";

/**
 * Slot identifiers a plugin can mount into.
 *
 * @public
 */
export type ViewerSlot =
  | "overlay.canvas"
  | "panel.right"
  | "panel.left"
  | "panel.bottom"
  | "toolbar.top"
  | "toolbar.left"
  | "toolbar.bottom"
  | "annotation.source"
  | "dialog.modal";

/**
 * Common manifest shared by every plugin shape.
 *
 * @public
 */
export interface ViewerPluginManifest {
  /** Stable plugin id. Convention: `<vendor>.<area>.<feature>`. */
  id: string;
  /** SemVer string — bump on protocol-affecting changes. */
  version: string;
  /** Slot the plugin mounts into. */
  slot: ViewerSlot;
}

/**
 * A plugin that draws on the page-overlay canvas. The mount function
 * returns React nodes positioned within the page overlay layer.
 *
 * @public
 */
export interface OverlayPlugin extends ViewerPluginManifest {
  slot: "overlay.canvas";
  mount(ctx: ViewerContext): ReactNode;
}

/**
 * A plugin that renders into a side or bottom panel.
 *
 * @public
 */
export interface PanelPlugin extends ViewerPluginManifest {
  slot: "panel.right" | "panel.left" | "panel.bottom";
  /** Display title for the panel header / tab. */
  title: string;
  /** Sort order within the panel slot — lower renders first. */
  order?: number;
  mount(ctx: ViewerContext): ReactNode;
}

/**
 * A plugin that contributes a toolbar control (icon button, dropdown,
 * or arbitrary widget).
 *
 * @public
 */
export interface ToolbarPlugin extends ViewerPluginManifest {
  slot: "toolbar.top" | "toolbar.left" | "toolbar.bottom";
  /** Sort order within the toolbar — lower renders first. */
  order?: number;
  mount(ctx: ViewerContext): ReactNode;
}

/**
 * A non-visual plugin that supplies annotation data to the viewer.
 *
 * The viewer subscribes to `subscribe(callback)`; the provider invokes
 * the callback with the current annotation list and on every change.
 *
 * @public
 */
export interface AnnotationSourceProvider extends ViewerPluginManifest {
  slot: "annotation.source";
  /** Called on mount; returns an unsubscribe function. */
  subscribe(
    ctx: ViewerContext,
    onChange: (annotations: ReadonlyArray<unknown>) => void,
  ): () => void;
}

/**
 * A plugin that can launch a modal dialog.
 *
 * @public
 */
export interface DialogPlugin extends ViewerPluginManifest {
  slot: "dialog.modal";
  mount(ctx: ViewerContext): ReactNode;
}

/**
 * Discriminated union of every plugin shape. Use this when the slot
 * is unknown at compile time.
 *
 * @public
 */
export type ViewerPlugin =
  | OverlayPlugin
  | PanelPlugin
  | ToolbarPlugin
  | AnnotationSourceProvider
  | DialogPlugin;

/**
 * Measurement-unit plugin — pluggable unit definition for the
 * `MeasureTool` core component. Phase 2 adds millimeter, inch,
 * point, pica, agate; Phase 1 reserves the slot.
 *
 * @public
 */
export interface MeasurementUnit {
  /** Stable id (e.g., `"mm"`, `"in"`). */
  id: string;
  /** Display label. */
  label: string;
  /** Conversion from PDF points (1 pt = 1/72 inch) to this unit. */
  fromPoints(points: number): number;
  /** Inverse conversion. */
  toPoints(value: number): number;
}

/**
 * Generic overlay item rendered on top of a page canvas.
 *
 * Phase 2 abstraction: replaces the LintPDF-specific `ViewerFinding`
 * type that `PageCanvas` and `PageNavigator` previously consumed.
 * Plugins (and the LintPDF host) translate their domain types
 * (findings, annotations, brand-spec violations) into `OverlayItem`s
 * before handing them to a core component.
 *
 * The shape is deliberately minimal. Anything richer that callers
 * need to round-trip (per-finding metadata, click handlers, hover
 * tooltips) goes through ``data: Record<string, unknown>``.
 *
 * After Phase 3 this interface ships as part of the LoupePDF OSS
 * surface; LintPDF's ``viewer-shared/lintpdf`` pack provides a
 * ``findingToOverlayItem(finding)`` adapter.
 *
 * @public
 */
export interface OverlayItem {
  /** Stable identifier for selection / hover / dedupe. */
  readonly id: string;
  /** 1-indexed page number this item belongs to. */
  readonly page: number;
  /**
   * Optional bounding box in PDF points: ``[x0, y0, x1, y1]``. When
   * absent, the item applies to the whole page (the renderer may
   * draw a page-level indicator instead of a bbox).
   */
  readonly bbox?: readonly [number, number, number, number];
  /**
   * Severity-like tier the renderer maps to a colour. Hosts can
   * supply their own palette via ``ViewerServices.tokens``; the
   * default LintPDF mapping treats ``"error"`` as red,
   * ``"warning"`` as amber, ``"advisory"`` as blue.
   */
  readonly tier?: "error" | "warning" | "advisory" | "info" | "neutral";
  /** Optional CSS hex colour override (e.g., ``"#ff5722"``). */
  readonly color?: string;
  /** Optional short label rendered alongside the bbox. */
  readonly label?: string;
  /**
   * Optional longer description used by tooltip-style renderers.
   * The host adapter is responsible for any domain-specific
   * cleanup (e.g., LintPDF strips long PDF object references
   * before populating this field).
   */
  readonly description?: string;
  /**
   * Optional short identifier code rendered alongside the tier
   * (e.g., LintPDF inspection_id ``"LPDF_PRINT_001"``). Renderers
   * typically display this in a code badge in tooltips.
   */
  readonly code?: string;
  /** Free-form payload for round-tripping host-specific data. */
  readonly data?: Record<string, unknown>;
}
