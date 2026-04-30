/**
 * Viewer services — SaaS-coupled feature surface.
 *
 * Plugins reach annotations, page images, telemetry, i18n, and theme
 * tokens through these protocols rather than hardcoding LintPDF API
 * paths or importing LintPDF types directly. OSS hosts (post-Phase-3
 * LoupePDF) wire no-op stubs for telemetry + i18n; the LintPDF SaaS
 * provides concrete impls in `lintpdf/sources/`.
 *
 * @public
 */

import type { ColorSample, DensitometerSample } from "../types";

/**
 * Page-image source. Returns a URL the viewer renders into a canvas
 * / `<img>` tag. The viewer caches results — services should not
 * implement their own cache.
 *
 * URL builders are **synchronous**: hosts that need async signing
 * pre-resolve into a redirect proxy or blob URL upstream. Returning
 * a Promise here would force every consumer through `useEffect` +
 * state, which doesn't fit the `<img src={url}>` rendering pattern.
 *
 * @public
 */
export interface PageImageService {
  /**
   * Standard page-tile URL. The host resolves whatever path /
   * blob / signed URL is appropriate.
   */
  getPageImageUrl(args: {
    pageNum: number;
    /** Render DPI; viewer asks for the DPI it needs. */
    dpi: number;
  }): string;
}

/**
 * PDF Optional Content Group (OCG / "layer") source.
 *
 * Hosts that don't expose layers should leave the no-op default
 * (returns no layers); the `LayerPanel` then renders an empty-
 * state placeholder.
 *
 * @public
 */
export interface LayerService {
  /**
   * Synchronous URL for an isolated layer image. The host renders
   * one PNG per OCG with a transparent background; the viewer
   * composites the active subset locally.
   */
  getLayerImageUrl(args: {
    pageNum: number;
    layerIndex: number;
    dpi: number;
  }): string;
  /** List the OCGs available for the current document. */
  listLayers(): Promise<
    ReadonlyArray<{
      name: string;
      ocg_index: number;
      default_on: boolean;
    }>
  >;
}

/**
 * Per-channel separation source. Hosts that don't expose ink
 * separations leave the no-op default (returns an empty URL); the
 * SeparationCanvas renders blank stock for any unrenderable channel.
 *
 * @public
 */
export interface SeparationService {
  /**
   * Synchronous URL for an isolated channel image (one PNG per ink
   * with a transparent background). Channel name is process-ink
   * (`"Cyan"`, `"Magenta"`, `"Yellow"`, `"Black"`) or a spot ink
   * (`"Pantone Reflex Blue C"`, etc.). The host is responsible for
   * percent-encoding the channel name in whatever URL it returns.
   */
  getChannelImageUrl(args: {
    pageNum: number;
    channelName: string;
    dpi: number;
  }): string;
}

/**
 * Total-Area-Coverage heatmap source. Hosts that don't compute a
 * TAC heatmap leave the no-op default (URL returns empty, runs
 * resolves to []); the overlay renders nothing in that case.
 *
 * @public
 */
export interface TACHeatmapService {
  /** Synchronous URL for the heatmap image (per-pixel RGBA tint). */
  getHeatmapImageUrl(args: {
    pageNum: number;
    dpi: number;
    tacLimit: number;
  }): string;
  /**
   * Per-text-run TAC readings used to drive the hover-tooltip layer.
   * Coordinates are PDF points with origin at the **top-left** of the
   * page (matches poppler's ``pdftotext -bbox`` output).
   */
  listRuns(args: {
    pageNum: number;
    dpi: number;
    tacLimit: number;
  }): Promise<
    ReadonlyArray<{
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      mean_tac: number;
      limit: number;
      exceeds: boolean;
    }>
  >;
}

/**
 * Color-sampler source — picks the rendered colour at a single PDF
 * point and returns RGB + hex + total area coverage. Hosts that
 * don't expose colour sampling leave the no-op default (returns
 * `null`); the `ColorPickerTool` then shows nothing.
 *
 * @public
 */
export interface ColorSampleService {
  /**
   * Sample at the given PDF coordinates (origin lower-left). Returns
   * `null` on any failure — the tool deliberately swallows errors so
   * a flaky network doesn't push a popover with a confusing chrome
   * fallback colour.
   */
  sampleAt(args: {
    pageNum: number;
    pdfX: number;
    pdfY: number;
    /** Optional render DPI override; service decides the default. */
    dpi?: number;
  }): Promise<ColorSample | null>;
}

/**
 * Densitometer source — reads ink-channel percentages + Total Area
 * Coverage at a PDF point. Hosts that can't split ink channels
 * (RGB-only documents, no Ghostscript) leave the no-op default —
 * `sampleAt` then throws a `"No separations"` error so the tool
 * renders its friendly amber banner.
 *
 * @public
 */
export interface DensitometerService {
  /**
   * Sample at the given PDF coordinates. On success returns the
   * ink-channel readings + TAC. On failure throws an `Error` with
   * a short user-facing message — the tool surfaces `.message`
   * verbatim in its readout panel. Distinct error paths the LintPDF
   * impl produces:
   *   - "No separations available for this page." — engine 422
   *     (RGB-only document, no CMYK to split)
   *   - "Sampling failed (NNN)" — engine non-2xx other than 422
   *   - "Network error" — fetch rejected
   */
  sampleAt(args: {
    pageNum: number;
    pdfX: number;
    pdfY: number;
    /** Optional render DPI override; service decides the default. */
    dpi?: number;
    tacLimit: number;
  }): Promise<DensitometerSample>;
}

/**
 * Annotation CRUD interface. The viewer doesn't own annotation state —
 * it subscribes to a source via `AnnotationSourceProvider` and writes
 * back through this service.
 *
 * @public
 */
export interface AnnotationService {
  list(): Promise<ReadonlyArray<unknown>>;
  create(annotation: unknown): Promise<unknown>;
  update(id: string, patch: Partial<unknown>): Promise<unknown>;
  remove(id: string): Promise<void>;
}

/**
 * Telemetry / analytics. No-op default keeps OSS hosts fast.
 *
 * @public
 */
export interface TelemetryService {
  track(event: string, properties?: Record<string, unknown>): void;
}

/**
 * Internationalisation. No-op default returns the key unchanged.
 *
 * @public
 */
export interface I18nService {
  t(key: string, params?: Record<string, string | number>): string;
}

/**
 * Theme tokens. Plugins that need brand colours read them from here
 * rather than hardcoding hex strings.
 *
 * @public
 */
export interface ThemeTokens {
  readonly primary: string;
  readonly accent: string;
  readonly bg: string;
  readonly fg: string;
  readonly border: string;
}

/**
 * Aggregate service surface exposed via `ViewerContext.services`.
 *
 * @public
 */
export interface ViewerServices {
  readonly pageImages: PageImageService;
  readonly layers: LayerService;
  readonly separations: SeparationService;
  readonly tacHeatmap: TACHeatmapService;
  readonly colorSample: ColorSampleService;
  readonly densitometer: DensitometerService;
  readonly annotations: AnnotationService;
  readonly telemetry: TelemetryService;
  readonly i18n: I18nService;
  readonly tokens: ThemeTokens;
}

// ---------------------------------------------------------------------------
// No-op stubs (used by OSS hosts and tests)
// ---------------------------------------------------------------------------

/**
 * Telemetry stub — drops every event on the floor.
 *
 * @public
 */
export const noopTelemetry: TelemetryService = {
  track: () => {},
};

/**
 * I18n stub — returns the key unchanged. Suitable for English-only
 * environments and tests.
 *
 * @public
 */
export const noopI18n: I18nService = {
  t: (key: string, params?: Record<string, string | number>) => {
    if (!params) return key;
    return Object.entries(params).reduce(
      (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
      key,
    );
  },
};

/**
 * Default theme tokens — neutral light palette. LintPDF host overrides
 * these from tenant branding.
 *
 * @public
 */
export const defaultThemeTokens: ThemeTokens = {
  primary: "#0f172a",
  accent: "#3b82f6",
  bg: "#ffffff",
  fg: "#0f172a",
  border: "#e2e8f0",
};
