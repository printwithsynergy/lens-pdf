/**
 * Viewer plugin protocol — slot types + plugin shape.
 *
 * Plugins extend the viewer without modifying core. Each plugin
 * declares the slot it mounts into; the registry resolves slot
 * lookups in order.
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
 * Anything host- or domain-shaped (host-specific findings,
 * brand-spec violations, audit verdicts) belongs in a plugin pack,
 * not core.
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
  /**
   * Optional opt-in override: when set, this plugin **replaces** the
   * plugin with the given id in slot lookups. The replaced plugin
   * stays registered (callers can still inspect it via `listAll()`),
   * but `getPluginsForSlot()` returns this one instead.
   *
   * Use case: a third-party plugin pack ships its own findings panel
   * by registering a `PanelPlugin` with
   * `replaces: "vendor.findings.default"`. The viewer mounts the
   * third-party panel; the original stays out of the slot.
   *
   * Constraints:
   * - The replacement must declare the same `slot` as the target.
   *   Cross-slot overrides are not supported (panels can't replace
   *   overlays, etc.).
   * - At most one plugin can claim a given `replaces` target. A
   *   second registration that targets the same id throws.
   * - The target id does not need to be registered yet — the
   *   override registers cleanly even before the target loads, and
   *   starts shadowing as soon as the target appears.
   */
  replaces?: string;
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
 * `MeasureTool` core component. The viewer ships millimetre, inch,
 * point, pica, and agate by default (see `units/`); hosts can
 * extend with their own.
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
 * Plugins and host adapters translate their domain types (findings,
 * annotations, brand-spec violations, etc.) into `OverlayItem`s
 * before handing them to a core component. The shape is
 * deliberately minimal — anything richer that callers need to
 * round-trip (per-finding metadata, click handlers, hover tooltips)
 * goes through ``data: Record<string, unknown>``.
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
   * default mapping treats ``"error"`` as red, ``"warning"`` as
   * amber, ``"advisory"`` as blue.
   */
  readonly tier?: "error" | "warning" | "advisory" | "info" | "neutral";
  /** Optional CSS hex colour override (e.g., ``"#ff5722"``). */
  readonly color?: string;
  /** Optional short label rendered alongside the bbox. */
  readonly label?: string;
  /**
   * Optional longer description used by tooltip-style renderers.
   * The host adapter is responsible for any domain-specific
   * cleanup before populating this field (e.g., stripping long
   * PDF object references that would blow out the tooltip).
   */
  readonly description?: string;
  /**
   * Optional short identifier code rendered alongside the tier
   * (e.g., a vendor-specific check id like ``"PRINT_001"``).
   * Renderers typically display this in a code badge in tooltips.
   */
  readonly code?: string;
  /** Free-form payload for round-tripping host-specific data. */
  readonly data?: Record<string, unknown>;
}
