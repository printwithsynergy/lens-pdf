/**
 * Viewer services — host-supplied data-source protocols.
 *
 * Components reach page images, layers, separations, annotations,
 * telemetry, i18n, and theme tokens through these protocols rather
 * than hardcoding any backend specifics. Hosts implement the
 * protocols their backend supports; the rest fall through to no-op
 * defaults (see `host/index.ts`) and the consuming components
 * self-hide.
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
   * verbatim in its readout panel. Distinct error paths a typical
   * server-side implementation produces:
   *   - "No separations available for this page." — backend signals
   *     the page can't be split (e.g. RGB-only document, no CMYK)
   *   - "Sampling failed (NNN)" — backend non-2xx other than the
   *     "no separations" case
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
 * One annotation record exposed by `AnnotationService.list()` and
 * `getForPage()`. `fabricJson` is the serialised Fabric.js canvas
 * snapshot — opaque to `core/`, only the host + the canvas component
 * inspect it.
 *
 * @public
 */
export interface AnnotationEntry {
  id: string;
  jobId: string;
  pageNum: number;
  authorEmail: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  fabricJson?: unknown;
}

/**
 * Annotation source. Phase-2 shape replaces the speculative
 * `list/create/update/remove` Protocol with concrete methods that
 * match actual call sites: per-page upsert (canvas autosave),
 * per-page load (canvas init), full list (sidebar thread), delete by
 * id (sidebar thread).
 *
 * Hosts that don't expose annotations leave the no-op default
 * (returns empty list / null). The `<AnnotationCanvas>` and
 * `<AnnotationThread>` components both gracefully render their
 * empty states.
 *
 * @public
 */
export interface AnnotationService {
  /** List every annotation for the current job (every page, every author). */
  list(): Promise<ReadonlyArray<AnnotationEntry>>;
  /**
   * Load the active author's saved drawing for one page. Returns
   * `null` when nothing is saved yet (or the author isn't logged in).
   */
  getForPage(pageNum: number): Promise<AnnotationEntry | null>;
  /**
   * Upsert the active author's drawing for one page. Best-effort —
   * implementations should swallow network errors so flaky
   * connectivity doesn't block the user from continuing to draw.
   */
  saveForPage(pageNum: number, fabricJson: unknown): Promise<void>;
  /** Delete a single annotation by id. */
  remove(id: string): Promise<void>;
}

/**
 * Report-export source — supplies the URLs the drawer / toolbar
 * link to for the HTML report viewer and PDF download. Hosts that
 * don't expose report exports leave the no-op default (returns
 * empty strings); the consuming menu items render but their links
 * resolve to the current page (still inert).
 *
 * @public
 */
export interface ReportsService {
  /** URL the "View HTML Report" link points at. */
  getHtmlReportUrl(): string;
  /** URL the "Download PDF" link points at. */
  getPdfDownloadUrl(): string;
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
 * Optional in-browser fallback that pulls "minimum data" directly from
 * a raw PDF blob when a host hasn't wired a richer service. Hosts that
 * supply this — typically by calling ``createPdfJsFallback(pdfUrl)``
 * exported from ``@printwithsynergy/loupe-pdf/host`` — let the viewer
 * keep tools like PageCanvas, PageNavigator, MeasureTool, LayerPanel,
 * and ColorPickerTool functional without a server backend.
 *
 * **Capabilities not covered**: true ink separations (CMYK/spot
 * channels), TAC heatmaps, and the densitometer all require server-
 * side rendering (Ghostscript/MuPDF). pdf.js only renders to RGB, so
 * those tools stay hidden when their dedicated services are unwired.
 *
 * Every method returns a Promise so the adapter can lazy-load pdf.js
 * on first use. ``sampleColorAt`` returns ``null`` on failure to match
 * the {@link ColorSampleService} contract.
 *
 * @public
 */
export interface PdfFallbackAdapter {
  getPageCount(): Promise<number>;
  getPageDimensions(pageNum: number): Promise<{
    widthPts: number;
    heightPts: number;
  }>;
  renderPageToUrl(args: { pageNum: number; dpi: number }): Promise<string>;
  listLayers(): Promise<
    ReadonlyArray<{ name: string; ocg_index: number; default_on: boolean }>
  >;
  sampleColorAt(args: {
    pageNum: number;
    pdfX: number;
    pdfY: number;
    dpi?: number;
  }): Promise<ColorSample | null>;
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
  readonly reports: ReportsService;
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
 * Default theme tokens — neutral light palette. Hosts typically
 * override these with their tenant or product branding.
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

/**
 * Dark theme tokens — dark-mode palette. Drop-in alternative to
 * {@link defaultThemeTokens} for hosts that want a dark chrome.
 *
 * @public
 */
export const darkThemeTokens: ThemeTokens = {
  primary: "#0f172a",
  accent: "#3b82f6",
  bg: "#0e0a14",
  fg: "#f5f3f7",
  border: "#2b2138",
};

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

/**
 * Non-enumerable marker tagged onto every default no-op service so
 * components can tell "host didn't wire this" apart from "host wired
 * something that returned no data". Components use the former to hide
 * themselves outright; the latter still renders an empty state because
 * the host explicitly opted in.
 */
const UNWIRED_MARKER = Symbol.for("@printwithsynergy/loupe-pdf:unwired");

/**
 * Tag a service object as a no-op default. Hosts almost never call
 * this — it's used internally by ``defaultViewerServices`` and
 * exposed only so unit tests / advanced hosts can simulate the
 * unwired state.
 *
 * @public
 */
export function markUnwired<T extends object>(service: T): T {
  Object.defineProperty(service, UNWIRED_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });
  return service;
}

/**
 * Returns ``true`` when the given service is the no-op default — i.e.
 * the host did not wire a real implementation. Components call this
 * to decide between hiding themselves (unwired) and rendering an
 * empty state (wired but returned no data).
 *
 * @public
 */
export function isUnwired(service: object | null | undefined): boolean {
  if (!service) return true;
  return (service as Record<symbol, unknown>)[UNWIRED_MARKER] === true;
}
