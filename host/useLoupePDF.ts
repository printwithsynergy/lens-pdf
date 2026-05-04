/**
 * `useLoupePDF` — React hook that manages all viewer state.
 *
 * Returns everything a consumer needs to render a viewer: context
 * values, fallback adapter, page/zoom/layer/tool state, and
 * computed canvas dimensions. Pass the return value to
 * {@link LoupePDFProvider} (or spread into `<LoupePDFViewer>`) and
 * you're done — no manual context wiring required.
 *
 * @public
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PdfFallbackAdapter, ThemeTokens, ViewerServices } from "../plugin/services";
import { defaultThemeTokens, markUnwired, noopI18n, noopTelemetry } from "../plugin/services";
import type { PageInfo } from "../types";
import { pageInfoFromDimensions } from "../types";
import { createPdfJsFallback } from "../fallback-pdfjs";
import type { ViewerHostContextValue } from "./index";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for {@link useLoupePDF}. */
export interface UseLoupePDFOptions {
  /** Theme tokens. Merged onto defaults. */
  tokens?: Partial<ThemeTokens>;
  /** Partial wired services — unwired fields auto-filled with no-op defaults. */
  services?: Partial<ViewerServices>;
  /** Initial zoom percentage. Default 100. */
  initialZoom?: number;
  /** Viewer mode. Default "scroll". */
  mode?: "scroll" | "single";
  /** Override pdf.js worker URL. Uses CDN default when omitted. */
  workerSrc?: string;
  /** Initial page number (1-indexed). Default 1. */
  initialPage?: number;
}

// ---------------------------------------------------------------------------
// Return
// ---------------------------------------------------------------------------

/** Full viewer state returned by {@link useLoupePDF}. */
export interface UseLoupePDFReturn {
  // Context values — feed to <LoupePDFProvider>
  hostValue: ViewerHostContextValue;
  servicesValue: ViewerServices;

  // Fallback adapter
  fallback: PdfFallbackAdapter | undefined;

  // Page state
  pageCount: number | null;
  currentPage: number;
  setCurrentPage: (n: number) => void;
  currentPageInfo: PageInfo;
  pages: PageInfo[];
  pageDims: Map<number, { widthPts: number; heightPts: number }>;

  // Zoom
  zoom: number;
  setZoom: (z: number) => void;
  canvasWidth: number;
  canvasHeight: number;

  // Layers
  enabledLayers: Set<number>;
  toggleLayer: (ocgIndex: number) => void;
  setAllLayers: (enabled: boolean) => void;
  hasLayers: boolean;

  // Tools
  activeTool: "none" | "color-picker" | "measure";
  setActiveTool: (t: "none" | "color-picker" | "measure") => void;

  // Error
  error: string | null;
  setError: (e: string | null) => void;
}

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_PAGE: PageInfo = pageInfoFromDimensions(1, 612, 792);

const PTS_TO_PX = 96 / 72;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages all LoupePDF viewer state. Pair with `<LoupePDFProvider>`
 * or `<LoupePDFViewer>` for rendering.
 *
 * ```tsx
 * const viewer = useLoupePDF("https://cdn.example.com/proof.pdf");
 * return (
 *   <LoupePDFProvider value={viewer}>
 *     <PageCanvas page={viewer.currentPageInfo} zoom={viewer.zoom} ... />
 *   </LoupePDFProvider>
 * );
 * ```
 *
 * @public
 */
export function useLoupePDF(
  pdfUrl: string | undefined,
  opts: UseLoupePDFOptions = {},
): UseLoupePDFReturn {
  const {
    tokens: tokenOverrides,
    services: serviceOverrides,
    initialZoom = 100,
    workerSrc,
    initialPage = 1,
  } = opts;

  // -----------------------------------------------------------------------
  // Tokens
  // -----------------------------------------------------------------------
  const tokens: ThemeTokens = useMemo(
    () => ({ ...defaultThemeTokens, ...tokenOverrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(tokenOverrides)],
  );

  // -----------------------------------------------------------------------
  // Fallback adapter (recreated when pdfUrl changes)
  // -----------------------------------------------------------------------
  const fallback = useMemo<PdfFallbackAdapter | undefined>(
    () => (pdfUrl ? createPdfJsFallback({ pdfUrl, workerSrc }) : undefined),
    [pdfUrl, workerSrc],
  );

  // -----------------------------------------------------------------------
  // Services
  // -----------------------------------------------------------------------
  const servicesValue = useMemo<ViewerServices>(() => {
    const base: ViewerServices = {
      pageImages: markUnwired({ getPageImageUrl: () => "" }),
      layers: markUnwired({ getLayerImageUrl: () => "", listLayers: async () => [] }),
      separations: markUnwired({ getChannelImageUrl: () => "" }),
      tacHeatmap: markUnwired({ getHeatmapImageUrl: () => "", listRuns: async () => [] }),
      colorSample: markUnwired({ sampleAt: async () => null }),
      densitometer: markUnwired({
        sampleAt: async () => { throw new Error("No separations available for this page."); },
      }),
      annotations: markUnwired({
        list: async () => [],
        getForPage: async () => null,
        saveForPage: async () => {},
        remove: async () => {},
      }),
      reports: markUnwired({ getHtmlReportUrl: () => "", getPdfDownloadUrl: () => "" }),
      telemetry: noopTelemetry,
      i18n: noopI18n,
      tokens,
    };
    if (!serviceOverrides) return base;
    return { ...base, ...serviceOverrides, tokens };
  }, [tokens, serviceOverrides]);

  // -----------------------------------------------------------------------
  // Host context
  // -----------------------------------------------------------------------
  const hostValue = useMemo<ViewerHostContextValue>(
    () => ({
      apiBase: "",
      jobApiBase: "",
      readOnly: true,
      pdfUrl,
      pdfFallback: fallback,
    }),
    [pdfUrl, fallback],
  );

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageDims, setPageDims] = useState<Map<number, { widthPts: number; heightPts: number }>>(
    new Map(),
  );
  const [zoom, setZoom] = useState(initialZoom);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [enabledLayers, setEnabledLayers] = useState<Set<number>>(new Set());
  const [hasLayers, setHasLayers] = useState(false);
  const [activeTool, setActiveTool] = useState<"none" | "color-picker" | "measure">("none");
  const [error, setError] = useState<string | null>(null);

  // Track fallback identity to reset state on URL change.
  const prevFallbackRef = useRef(fallback);
  useEffect(() => {
    if (prevFallbackRef.current !== fallback) {
      prevFallbackRef.current = fallback;
      setPageCount(null);
      setPageDims(new Map());
      setCurrentPage(initialPage);
      setEnabledLayers(new Set());
      setHasLayers(false);
      setError(null);
    }
  }, [fallback, initialPage]);

  // -----------------------------------------------------------------------
  // Load page count + layers from fallback
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!fallback) return;
    let cancelled = false;
    fallback
      .getPageCount()
      .then((n) => { if (!cancelled) setPageCount(n); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [fallback]);

  useEffect(() => {
    if (!fallback) return;
    let cancelled = false;
    fallback.listLayers().then((layers) => {
      if (cancelled) return;
      setHasLayers(layers.length > 0);
      setEnabledLayers(new Set(layers.filter((l) => l.default_on).map((l) => l.ocg_index)));
    });
    return () => { cancelled = true; };
  }, [fallback]);

  // -----------------------------------------------------------------------
  // Derived page info
  // -----------------------------------------------------------------------
  const currentDims = pageDims.get(currentPage);
  const currentPageInfo: PageInfo = currentDims
    ? pageInfoFromDimensions(currentPage, currentDims.widthPts, currentDims.heightPts)
    : { ...DEFAULT_PAGE, page_num: currentPage };

  const pages: PageInfo[] = useMemo(() => {
    if (pageCount === null) return [];
    return Array.from({ length: pageCount }, (_, i) => {
      const num = i + 1;
      const dims = pageDims.get(num);
      return dims
        ? pageInfoFromDimensions(num, dims.widthPts, dims.heightPts)
        : { ...DEFAULT_PAGE, page_num: num };
    });
  }, [pageCount, pageDims]);

  // -----------------------------------------------------------------------
  // Canvas dimensions
  // -----------------------------------------------------------------------
  const scale = zoom / 100;
  const canvasWidth = Math.round(currentPageInfo.width_pts * PTS_TO_PX * scale);
  const canvasHeight = Math.round(currentPageInfo.height_pts * PTS_TO_PX * scale);

  // -----------------------------------------------------------------------
  // Layer callbacks
  // -----------------------------------------------------------------------
  const toggleLayer = useCallback((ocgIndex: number) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(ocgIndex)) next.delete(ocgIndex);
      else next.add(ocgIndex);
      return next;
    });
  }, []);

  const setAllLayers = useCallback(
    (enabled: boolean) => {
      if (!fallback) return;
      if (enabled) {
        fallback.listLayers().then((layers) => {
          setEnabledLayers(new Set(layers.map((l) => l.ocg_index)));
        });
      } else {
        setEnabledLayers(new Set());
      }
    },
    [fallback],
  );

  return {
    hostValue,
    servicesValue,
    fallback,
    pageCount,
    currentPage,
    setCurrentPage,
    currentPageInfo,
    pages,
    pageDims,
    zoom,
    setZoom,
    canvasWidth,
    canvasHeight,
    enabledLayers,
    toggleLayer,
    setAllLayers,
    hasLayers,
    activeTool,
    setActiveTool,
    error,
    setError,
  };
}
