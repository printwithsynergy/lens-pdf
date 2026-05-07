/**
 * `useLoupePDF` — React hook that manages basic viewer state.
 *
 * **0.3.0-beta.36 simplification.** The pdfjs-backed
 * ``createPdfJsFallback`` adapter was removed when codex became the
 * authoritative engine. This hook is now a slim state-only helper:
 * page count / page dimensions / zoom / layer toggles. Hosts pass
 * those facts in via options (typically derived from a CodexDocument)
 * instead of asking pdf.js.
 *
 * Most consumers should use `useLoupeViewerController` (which wires
 * a codex-backed `BrowserViewerServices` for them) — this hook is
 * kept for hosts that want fine-grained control over the
 * `<LoupePDFProvider>` context they build.
 *
 * @public
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import {
  defaultThemeTokens,
  markUnwired,
  noopI18n,
  noopTelemetry,
} from "../plugin/services";
import type { PageInfo } from "../types";
import { pageInfoFromDimensions } from "../types";
import type { ViewerHostContextValue } from "./index";

const DEFAULT_DPI = 144;
const PTS_TO_PX = DEFAULT_DPI / 72;
const DEFAULT_PAGE: PageInfo = pageInfoFromDimensions(1, 612, 792);


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
  /** Initial page number (1-indexed). Default 1. */
  initialPage?: number;
  /** Page count (codex-derived). Required for multi-page navigation. */
  pageCount?: number;
  /** Page dimensions in PDF points (codex-derived). */
  pageDims?: ReadonlyMap<number, { widthPts: number; heightPts: number }>;
  /** Layer info (codex-derived). Empty array → no layers UI. */
  layers?: ReadonlyArray<{ name: string; ocg_index: number; default_on: boolean }>;
  /** PDF URL for hosts that still drive a download link / share UI. */
  pdfUrl?: string;
  /** API base if you proxy server-side. */
  apiBase?: string;
  /** Job-scoped API base. */
  jobApiBase?: string;
  /** Read-only flag. */
  readOnly?: boolean;
  /** One-shot debug logging when services self-hide. */
  debug?: boolean;
}

/** Full viewer state returned by {@link useLoupePDF}. */
export interface UseLoupePDFReturn {
  hostValue: ViewerHostContextValue;
  servicesValue: ViewerServices;
  pageCount: number | null;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  currentPageInfo: PageInfo;
  pages: PageInfo[];
  pageDims: ReadonlyMap<number, { widthPts: number; heightPts: number }>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  canvasWidth: number;
  canvasHeight: number;
  enabledLayers: Set<number>;
  toggleLayer: (ocgIndex: number) => void;
  setAllLayers: (enabled: boolean) => void;
  hasLayers: boolean;
  activeTool: "none" | "color-picker" | "measure";
  setActiveTool: React.Dispatch<React.SetStateAction<"none" | "color-picker" | "measure">>;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
}

/** @public */
export function useLoupePDF(opts: UseLoupePDFOptions = {}): UseLoupePDFReturn {
  const initialPage = opts.initialPage ?? 1;
  const initialZoom = opts.initialZoom ?? 100;
  const tokens: ThemeTokens = useMemo(
    () => ({ ...defaultThemeTokens, ...(opts.tokens ?? {}) }),
    [opts.tokens],
  );
  const serviceOverrides = opts.services;

  const servicesValue = useMemo<ViewerServices>(() => {
    const base: ViewerServices = {
      pageImages: markUnwired({ getPageImageUrl: () => "" }),
      layers: markUnwired({ getLayerImageUrl: () => "", listLayers: async () => [] }),
      separations: markUnwired({ getChannelImageUrl: () => "" }),
      tacHeatmap: markUnwired({ getHeatmapImageUrl: () => "", listRuns: async () => [] }),
      colorSample: markUnwired({ sampleAt: async () => null }),
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
      reports: markUnwired({ getHtmlReportUrl: () => "", getPdfDownloadUrl: () => "" }),
      telemetry: noopTelemetry,
      i18n: noopI18n,
      tokens,
    };
    if (!serviceOverrides) return base;
    return { ...base, ...serviceOverrides, tokens };
  }, [tokens, serviceOverrides]);

  const hostValue = useMemo<ViewerHostContextValue>(
    () => ({
      apiBase: opts.apiBase ?? "",
      jobApiBase: opts.jobApiBase ?? "",
      readOnly: opts.readOnly ?? true,
      debug: opts.debug,
      pdfUrl: opts.pdfUrl,
    }),
    [opts.apiBase, opts.jobApiBase, opts.readOnly, opts.debug, opts.pdfUrl],
  );

  const [pageCount, setPageCount] = useState<number | null>(opts.pageCount ?? null);
  useEffect(() => {
    setPageCount(opts.pageCount ?? null);
  }, [opts.pageCount]);

  const [zoom, setZoom] = useState(initialZoom);
  const [currentPage, setCurrentPage] = useState(initialPage);

  const pageDims: ReadonlyMap<number, { widthPts: number; heightPts: number }> = useMemo(
    () => opts.pageDims ?? new Map(),
    [opts.pageDims],
  );

  const layersInput = opts.layers ?? [];
  const [enabledLayers, setEnabledLayers] = useState<Set<number>>(
    () => new Set(layersInput.filter((l) => l.default_on).map((l) => l.ocg_index)),
  );
  useEffect(() => {
    setEnabledLayers(
      new Set(layersInput.filter((l) => l.default_on).map((l) => l.ocg_index)),
    );
  }, [layersInput]);
  const hasLayers = layersInput.length > 0;

  const [activeTool, setActiveTool] = useState<"none" | "color-picker" | "measure">("none");
  const [error, setError] = useState<string | null>(null);

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

  const scale = zoom / 100;
  const canvasWidth = Math.round(currentPageInfo.width_pts * PTS_TO_PX * scale);
  const canvasHeight = Math.round(currentPageInfo.height_pts * PTS_TO_PX * scale);

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
      if (enabled) setEnabledLayers(new Set(layersInput.map((l) => l.ocg_index)));
      else setEnabledLayers(new Set());
    },
    [layersInput],
  );

  return {
    hostValue,
    servicesValue,
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
