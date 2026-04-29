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

/**
 * Page-image source. Returns a URL the viewer can render into a
 * canvas / `<img>` tag. The viewer caches results — services should
 * not implement their own cache.
 *
 * @public
 */
export interface PageImageService {
  getPageImageUrl(args: {
    pageNum: number;
    /** Render DPI; viewer asks for the DPI it needs. */
    dpi: number;
  }): Promise<string>;
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
