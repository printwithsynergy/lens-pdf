/**
 * Viewer host context — the bridge between an embedding application
 * and the core viewer components. Two contexts live here:
 *
 * - {@link ViewerHostContext}: cross-cutting host config (API base
 *   paths, read-only flag, debug toggle, optional pdf.js fallback).
 * - {@link ViewerServicesContext}: the {@link ViewerServices} object
 *   carrying all the data-source protocols (page images, layers,
 *   separations, annotations, etc.). Components read services via
 *   {@link useViewerServices}; components decide between wired,
 *   fallback, and hidden render modes via {@link useFallbackMode}.
 *
 * Hosts mount a `<ViewerHostContext.Provider>` at the root of their
 * app and supply concrete values; the no-op defaults exported below
 * keep an unwired viewer renderable but quiet.
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
 * components. Cross-cutting toggles, base API paths, and the
 * optional PDF fallback adapter live here; per-feature data sources
 * are on {@link ViewerServices}.
 *
 * @public
 */
export interface ViewerHostContextValue {
  /**
   * Base path for viewer API calls (no trailing slash). The viewer
   * itself never builds URLs from this — it's plumbed through for
   * host-side service implementations that want a single source of
   * truth (e.g. a host's `getPageImageUrl` returning
   * ``${apiBase}/page/${n}.png``). Leave empty if your services
   * compose URLs differently.
   */
  apiBase: string;
  /**
   * Base path for job-level API calls (findings, reports, etc.).
   * Same plumbing convention as {@link apiBase}.
   */
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
 * concrete implementation; downstream plugin packs typically expose
 * a factory like `createMyHostViewerServices(...)` that returns one.
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

/**
 * Pre-built services where every protocol is a no-op default tagged
 * with the unwired marker. Hosts that only need a partial override
 * can spread this and replace the fields they've wired:
 *
 * ```ts
 * const services = { ...defaultUnwiredServices, pageImages: myPageImages };
 * ```
 *
 * @public
 */
export { defaultViewerServices as defaultUnwiredServices };

export { createPdfJsFallback } from "./pdfFallback";
export { isUnwired, markUnwired } from "../plugin/services";

export { validatePdfFile, validatePdfUrl } from "./pdfValidation";
export type { PdfValidationResult } from "./pdfValidation";

export { generateShareLink, parseShareParams } from "./shareLink";
export type { ShareLinkOptions, ParsedShareParams } from "./shareLink";

export { useLoupePDF } from "./useLoupePDF";
export type { UseLoupePDFOptions, UseLoupePDFReturn } from "./useLoupePDF";

export { LoupePDFProvider } from "./LoupePDFProvider";
export type { LoupePDFProviderProps } from "./LoupePDFProvider";
