/**
 * Viewer host context — the bridge between an embedding application
 * and the core viewer components.
 *
 * Phase 2 (this directory) extracts the context that was previously
 * defined in `src/types.ts` (`ViewerApiContextValue` / `ViewerApiContext`
 * / `useViewerApi`) so `src/core/` no longer needs to import from
 * `../../types`. The boundary rule that blocks `core/` from
 * referencing the LintPDF directory couldn't catch `../../types`
 * imports — this move closes that gap.
 *
 * Phase 3 (LoupePDF) extracts this directory, alongside everything
 * else under `src/core/`, into `@thinkneverland/loupe-pdf`. Hosts
 * (LintPDF SaaS, OSS embeds) supply their own concrete values via
 * `<ViewerHostContext.Provider value={...}>`.
 *
 * The legacy `useViewerApi` / `ViewerApiContext` names are still
 * re-exported from `src/types.ts` so components outside `core/` (and
 * downstream consumers) can keep their existing imports.
 *
 * @public
 */

import { createContext, useContext } from "react";
import type { PdfFallbackAdapter, ViewerServices } from "../plugin/services";
import {
  defaultThemeTokens,
  isUnwired,
  markUnwired,
  noopI18n,
  noopTelemetry,
} from "../plugin/services";

/**
 * Values the host application supplies to the viewer's core
 * components. Today this is API base URLs + a read-only flag; later
 * PRs in the Phase-2 abstraction stream will replace direct
 * URL-string consumption with `ViewerServices` (page images,
 * annotations, telemetry, i18n, theme tokens) so this surface stays
 * minimal even as the viewer's capabilities grow.
 *
 * @public
 */
export interface ViewerHostContextValue {
  /**
   * Base path for viewer API calls (no trailing slash). LintPDF
   * authenticated mode: ``/api/lintpdf/viewer/{jobId}``. Public-token
   * (share-link) mode: ``/api/lintpdf/viewer/public/{token}``.
   */
  apiBase: string;
  /** Base path for job-level API calls (findings, reports). */
  jobApiBase: string;
  /**
   * When true, hides write-only UI (annotations, verdict, comparison
   * initiation). Public-token / share-link viewers run with this on.
   */
  readOnly: boolean;
  /**
   * When true, components log a one-shot ``console.info`` whenever
   * they self-hide because their backing service is unwired. Off by
   * default so production embeds stay quiet. Hosts typically derive
   * this from an environment flag (``import.meta.env.DEV``,
   * ``process.env.NODE_ENV !== "production"``, etc.).
   */
  debug?: boolean;
  /**
   * Optional URL to the raw PDF file. Consumed by the pdf.js fallback
   * adapter (see ``createPdfJsFallback``) and by base components when
   * no service is wired.
   *
   * **Security**: this is a pure renderer. Whatever URL the host puts
   * here is fetched by the user's browser as-is — sign it, scope it,
   * and expire it like any other PDF download link. Never point this
   * at an unauthenticated path that exposes documents the viewer's
   * user shouldn't see.
   */
  pdfUrl?: string;
  /**
   * Optional in-browser fallback adapter used when a richer service
   * is unwired. See {@link PdfFallbackAdapter}. Hosts that don't set
   * this get hide-on-unwired behaviour for every fallback-capable
   * tool; hosts that set it (e.g. via ``createPdfJsFallback``) get
   * graceful degradation instead.
   */
  pdfFallback?: PdfFallbackAdapter;
}

/**
 * React context object. Default value is intentionally empty so a
 * misconfigured viewer renders nothing surprising — components that
 * read `apiBase` should treat the empty string as "no host wired up".
 *
 * @public
 */
export const ViewerHostContext = createContext<ViewerHostContextValue>({
  apiBase: "",
  jobApiBase: "",
  readOnly: false,
});

/**
 * Hook for reading the current `ViewerHostContextValue`. Returns the
 * default empty values when no provider is mounted.
 *
 * @public
 */
export function useViewerHost(): ViewerHostContextValue {
  return useContext(ViewerHostContext);
}

// ---------------------------------------------------------------------------
// ViewerServices context
// ---------------------------------------------------------------------------

/**
 * No-op default services. URL builders return empty strings; the
 * other protocols are filled with the no-op stubs already defined
 * in `core/plugin/services`. Hosts that supply a partial
 * `ViewerServices` in their provider override only the fields they
 * actually have.
 *
 * Choosing empty-string for URL builders (rather than throwing)
 * keeps the boundary forgiving — a misconfigured viewer renders
 * blank tiles, but doesn't crash.
 */
const defaultViewerServices: ViewerServices = {
  pageImages: markUnwired({
    getPageImageUrl: () => "",
  }),
  layers: markUnwired({
    getLayerImageUrl: () => "",
    listLayers: async () => [],
  }),
  separations: markUnwired({
    getChannelImageUrl: () => "",
  }),
  tacHeatmap: markUnwired({
    getHeatmapImageUrl: () => "",
    listRuns: async () => [],
  }),
  colorSample: markUnwired({
    sampleAt: async () => null,
  }),
  densitometer: markUnwired({
    sampleAt: async () => {
      throw new Error("No separations available for this page.");
    },
  }),
  annotations: markUnwired({
    list: async () => [],
    getForPage: async () => null,
    saveForPage: async () => {},
    remove: async () => {},
  }),
  reports: markUnwired({
    getHtmlReportUrl: () => "",
    getPdfDownloadUrl: () => "",
  }),
  telemetry: noopTelemetry,
  i18n: noopI18n,
  tokens: defaultThemeTokens,
};

/**
 * React context carrying the active `ViewerServices` instance.
 * `<ViewerServicesContext.Provider value={...}>` mounts a host's
 * concrete impl (LintPDF SaaS supplies one via
 * `createLintPDFViewerServices` in `src/lintpdf/sources/services`).
 *
 * @public
 */
export const ViewerServicesContext = createContext<ViewerServices>(
  defaultViewerServices,
);

/**
 * Hook for reading the active `ViewerServices`. Returns the no-op
 * defaults when no provider is mounted.
 *
 * @public
 */
export function useViewerServices(): ViewerServices {
  return useContext(ViewerServicesContext);
}

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

const loggedHideOnce = new Set<string>();

/**
 * One-shot ``console.info`` for components that self-hide because
 * their backing service is unwired. Silent unless ``host.debug`` is
 * on, and deduped per-component-name so a thousand re-renders don't
 * spam the console.
 *
 * @public
 */
export function logUnwiredHide(componentName: string, serviceName: string): void {
  const key = `${componentName}:${serviceName}`;
  if (loggedHideOnce.has(key)) return;
  loggedHideOnce.add(key);
  // eslint-disable-next-line no-console
  console.info(
    `[loupe-pdf] ${componentName} hidden — host did not wire \`services.${serviceName}\`. ` +
      `Provide an implementation, or set \`pdfFallback\` on the host context to use the in-browser PDF fallback.`,
  );
}

/**
 * Helper hook used by fallback-capable components. Returns a stable
 * tuple describing how the component should render its data source:
 *
 *   - ``mode: "wired"``   — host provided the dedicated service; use it.
 *   - ``mode: "fallback"`` — service unwired but ``pdfFallback`` is
 *     present; use the fallback adapter.
 *   - ``mode: "hidden"``  — neither is available; render ``null``.
 *
 * Components are responsible for calling {@link logUnwiredHide} from
 * an effect when they choose to hide; this hook deliberately doesn't
 * log on its own so callers control the message.
 *
 * @public
 */
export function useFallbackMode(
  service: object | null | undefined,
): "wired" | "fallback" | "hidden" {
  const { pdfFallback } = useViewerHost();
  if (!isUnwired(service)) return "wired";
  if (pdfFallback) return "fallback";
  return "hidden";
}

export { createPdfJsFallback } from "./pdfFallback";
export { isUnwired, markUnwired } from "../plugin/services";
