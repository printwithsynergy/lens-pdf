/**
 * Shareable viewer link utilities.
 *
 * {@link generateShareLink} builds a URL that opens a LoupePDF viewer
 * with a specific PDF pre-loaded and settings applied.
 * {@link parseShareParams} parses those query params back into props.
 *
 * URL format:
 * ```
 * https://loupepdf.com/demo?url=<encoded>&fullscreen=true&zoom=150&page=1&mode=single&theme=dark
 * ```
 *
 * @public
 */

import type { ThemeTokens } from "../plugin/services";

// ---------------------------------------------------------------------------
// generateShareLink
// ---------------------------------------------------------------------------

/** Options for {@link generateShareLink}. */
export interface ShareLinkOptions {
  /** Base URL of the host's demo/viewer page (e.g. `https://loupepdf.com/demo`). */
  baseUrl: string;
  /** PDF URL to pre-load. */
  pdfUrl: string;
  /** Open in fullscreen mode (no site chrome). Default: false. */
  fullscreen?: boolean;
  /** Initial zoom percentage. */
  zoom?: number;
  /** Initial page number. */
  page?: number;
  /** Viewer scroll mode. */
  mode?: "scroll" | "single";
  /** Tools to enable (encoded as comma-separated in URL). */
  tools?: string[];
  /** Theme: preset name or inline token overrides. */
  theme?: "light" | "dark" | Partial<ThemeTokens>;
}

/**
 * Build a shareable viewer URL with query params.
 *
 * ```ts
 * const link = generateShareLink({
 *   baseUrl: "https://loupepdf.com/demo",
 *   pdfUrl: "https://cdn.example.com/proof.pdf",
 *   fullscreen: true,
 *   zoom: 150,
 * });
 * // → "https://loupepdf.com/demo?url=https%3A%2F%2Fcdn.example.com%2Fproof.pdf&fullscreen=true&zoom=150"
 * ```
 *
 * @public
 */
export function generateShareLink(opts: ShareLinkOptions): string {
  const url = new URL(opts.baseUrl);

  url.searchParams.set("url", opts.pdfUrl);

  if (opts.fullscreen) {
    url.searchParams.set("fullscreen", "true");
  }
  if (opts.zoom !== undefined) {
    url.searchParams.set("zoom", String(opts.zoom));
  }
  if (opts.page !== undefined) {
    url.searchParams.set("page", String(opts.page));
  }
  if (opts.mode && opts.mode !== "scroll") {
    url.searchParams.set("mode", opts.mode);
  }
  if (opts.tools && opts.tools.length > 0) {
    url.searchParams.set("tools", opts.tools.join(","));
  }
  if (opts.theme) {
    if (typeof opts.theme === "string") {
      url.searchParams.set("theme", opts.theme);
    } else {
      // Inline tokens are encoded as JSON.
      url.searchParams.set("theme", JSON.stringify(opts.theme));
    }
  }

  return url.toString();
}

// ---------------------------------------------------------------------------
// parseShareParams
// ---------------------------------------------------------------------------

/** Parsed share parameters returned by {@link parseShareParams}. */
export interface ParsedShareParams {
  /** PDF URL to pre-load, or undefined if not specified. */
  pdfUrl?: string;
  /** Whether to open in fullscreen mode. */
  fullscreen: boolean;
  /** Initial zoom percentage, or undefined. */
  zoom?: number;
  /** Initial page number, or undefined. */
  page?: number;
  /** Viewer mode, or undefined. */
  mode?: "scroll" | "single";
  /** Tools to enable, or undefined. */
  tools?: string[];
  /** Theme preset name or inline tokens, or undefined. */
  theme?: "light" | "dark" | Partial<ThemeTokens>;
}

/**
 * Parse query params from a shareable viewer URL back into props.
 * Use this in the host's page component to read URL state:
 *
 * ```ts
 * const params = parseShareParams(new URLSearchParams(window.location.search));
 * <LoupePDFDemo initialPdfUrl={params.pdfUrl} fullscreen={params.fullscreen} />
 * ```
 *
 * @public
 */
export function parseShareParams(searchParams: URLSearchParams): ParsedShareParams {
  const result: ParsedShareParams = {
    fullscreen: false,
  };

  const url = searchParams.get("url");
  if (url) result.pdfUrl = url;

  const fullscreen = searchParams.get("fullscreen");
  if (fullscreen === "true" || fullscreen === "1") result.fullscreen = true;

  const zoom = searchParams.get("zoom");
  if (zoom) {
    const parsed = parseInt(zoom, 10);
    if (!isNaN(parsed) && parsed > 0) result.zoom = parsed;
  }

  const page = searchParams.get("page");
  if (page) {
    const parsed = parseInt(page, 10);
    if (!isNaN(parsed) && parsed > 0) result.page = parsed;
  }

  const mode = searchParams.get("mode");
  if (mode === "scroll" || mode === "single") result.mode = mode;

  const tools = searchParams.get("tools");
  if (tools) result.tools = tools.split(",").filter(Boolean);

  const theme = searchParams.get("theme");
  if (theme) {
    if (theme === "light" || theme === "dark") {
      result.theme = theme;
    } else {
      try {
        result.theme = JSON.parse(theme) as Partial<ThemeTokens>;
      } catch {
        // Invalid JSON — ignore.
      }
    }
  }

  return result;
}
