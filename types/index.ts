/**
 * Core viewer types — generic PDF/canvas shapes consumed by
 * components in `src/core/components/`.
 *
 * Phase 2 extracted these out of `src/types.ts` so `src/core/`
 * doesn't have to import from a LintPDF-flavoured location. The
 * legacy names are still re-exported from `src/types.ts` for
 * back-compat, so consumers outside `core/` don't need to update.
 *
 * After Phase 3 this directory ships as part of the LoupePDF OSS
 * surface; LintPDF-specific extensions (`AuditVerdict`,
 * `ViewerFinding`, `ArtSizeMM`, etc.) stay in `src/types.ts`
 * (becoming part of `@thinkneverland/loupe-plugin-lintpdf`).
 *
 * @public
 */

// ---------------------------------------------------------------------------
// PDF page geometry
// ---------------------------------------------------------------------------

/** PDF box in PDF points: lower-left + upper-right corners. */
export interface PageBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Per-page metadata returned by the engine. */
export interface PageInfo {
  page_num: number;
  width_pts: number;
  height_pts: number;
  media_box: PageBox;
  crop_box: PageBox | null;
  trim_box: PageBox | null;
  bleed_box: PageBox | null;
  rotation: number;
}

/**
 * Dieline detection verdict. `source`:
 * - `"name"`     — name-match heuristic (CutContour, Dieline, etc.)
 * - `"vision"`   — vision-model spatial-reasoning fallback
 * - `"missing"`  — no dieline found
 */
export interface DielineResult {
  source: "name" | "vision" | "missing";
  polylines: number[][][];
  spot_name: string | null;
  confidence: number;
  /** Per-artwork bboxes extracted from dieline strokes. */
  regions?: Array<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    width_mm: number;
    height_mm: number;
  }>;
  /** True when the dieline layer paints in more than one colour. */
  multi_color?: boolean;
}

// ---------------------------------------------------------------------------
// Optional Content Groups (PDF "layers")
// ---------------------------------------------------------------------------

/** Optional Content Group entry surfaced by the layer panel. */
export interface LayerInfo {
  name: string;
  ocg_index: number;
  default_on: boolean;
}

// ---------------------------------------------------------------------------
// Color picker / densitometer
// ---------------------------------------------------------------------------

export interface ColorSample {
  x: number;
  y: number;
  rgb: [number, number, number];
  hex: string;
  tac: number | null;
}

export interface DensitometerChannel {
  name: string;
  percent: number;
}

export interface DensitometerSample {
  x: number;
  y: number;
  dpi: number;
  channels: DensitometerChannel[];
  tac: number;
  tac_limit: number;
  limit_exceeded: boolean;
}

// ---------------------------------------------------------------------------
// Viewer config
// ---------------------------------------------------------------------------

/**
 * Capabilities the viewer can request data for. Hosts unaware of a
 * key can leave it unset; the viewer treats absence as "not
 * available".
 */
export type ViewerCapabilityKey =
  | "findings"
  | "separations"
  | "tac"
  | "tac_runs"
  | "tiles_warmed"
  | "layers"
  | "fonts"
  | "images"
  | "thumbnails"
  | "metadata";

/** Source of preflight findings for the current job. */
export type PreflightSourceMode = "engine" | "external" | "minimal";

export interface ViewerConfig {
  enable_separations: boolean;
  enable_tac_heatmap: boolean;
  enable_annotations: boolean;
  /** Public share-link only: whether anonymous visitors may create annotations. */
  allow_annotations?: boolean;
  enable_measurement: boolean;
  enable_comparison: boolean;
  enable_layers: boolean;
  enable_findings_panel: boolean;
  enable_page_thumbnails: boolean;
  enable_zoom: boolean;
  enable_download: boolean;
  enable_html_report_link: boolean;
  verdict_mode: "auto" | "manual" | "disabled";
  default_zoom: number;
  default_dpi: number;
  default_tac_limit: number;
  viewer_logo_url: string | null;
  viewer_accent_color: string | null;
  toolbar_position: "top" | "bottom";
  dark_mode: boolean;
  /** Resolved branding — null fields when `anonymous` is true. */
  brand_name: string | null;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
  brand_accent_color: string | null;
  /** True when the viewer must hide all tenant + host chrome. */
  anonymous: boolean;
  tenant_name: string | null;
  support_email: string | null;
  /** How findings were produced for this job. */
  preflight_source: PreflightSourceMode;
  /** Per-capability availability map (true = backed by data). */
  capabilities: Partial<Record<ViewerCapabilityKey, boolean>>;
  /** Plan-gate: false means the tenant may not invoke on-demand
   *  capability fill-in. */
  capability_fillin_enabled: boolean;
  /** Plan-gate: false means the viewer must hide annotation toolbar. */
  annotations_enabled: boolean;
  /** Plan-gate: empty means report downloads are not available. */
  allowed_report_formats: string[];
  tile_cdn_base: string | null;
}

export const DEFAULT_VIEWER_CONFIG: ViewerConfig = {
  enable_separations: true,
  enable_tac_heatmap: true,
  enable_annotations: true,
  enable_measurement: true,
  enable_comparison: true,
  enable_layers: true,
  enable_findings_panel: true,
  enable_page_thumbnails: true,
  enable_zoom: true,
  enable_download: true,
  enable_html_report_link: true,
  verdict_mode: "auto",
  default_zoom: 100,
  default_dpi: 150,
  default_tac_limit: 300,
  viewer_logo_url: null,
  viewer_accent_color: null,
  toolbar_position: "top",
  dark_mode: false,
  brand_name: null,
  brand_logo_url: null,
  brand_primary_color: "#1a3a7a",
  brand_accent_color: "#2563eb",
  anonymous: false,
  tenant_name: null,
  support_email: null,
  preflight_source: "engine",
  capabilities: {
    findings: true,
    separations: true,
    tac: true,
    tac_runs: true,
    tiles_warmed: false,
    layers: true,
    fonts: true,
    images: true,
    thumbnails: true,
    metadata: true,
  },
  capability_fillin_enabled: true,
  annotations_enabled: true,
  allowed_report_formats: ["json", "html", "pdf", "xml"],
  tile_cdn_base: null,
};

// ---------------------------------------------------------------------------
// Render constants
// ---------------------------------------------------------------------------

/**
 * Severity-keyed fill/stroke palette. The keys mirror
 * `OverlayItem["tier"]`'s `error` / `warning` / `advisory` values
 * so canvas renderers can index in directly.
 */
export const SEVERITY_COLORS = {
  error: { fill: "rgba(239, 68, 68, 0.15)", stroke: "#ef4444" },
  warning: { fill: "rgba(245, 158, 11, 0.15)", stroke: "#f59e0b" },
  advisory: { fill: "rgba(59, 130, 246, 0.15)", stroke: "#3b82f6" },
} as const;

/** Default render DPI for canvas-backed page tiles. */
export const DEFAULT_DPI = 150;

/** Default DPI for thumbnail/page-navigator tiles. */
export const THUMBNAIL_DPI = 72;
