"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBrowserViewerServices,
  useBrowserViewerServicesVersion,
  PROCESS_CHANNELS,
  type BrowserViewerServices,
  type DetectedInk,
} from "../browser";
import { isUnwired } from "../host";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import type { OverlayItem } from "../plugin/types";
import { DEFAULT_DPI, pageInfoFromDimensions, type DielineResult, type PageInfo } from "../types";
import type { AnnotationTool } from "./AnnotationToolbar";
import { pluginsForPreset, type LoupePDFPresetKind } from "./presets";
import {
  computeFeatureAvailability,
  pluginsForSlot,
  resolveShellPlugins,
  type LoupePDFShellPlugin,
  type LoupePDFShellPluginContext,
  type PointerTool,
  type ViewerMode,
} from "./shellPlugins";
import { useStagePan } from "./useStagePan";
import type { LoupePDFTool } from "./viewerTools";
import { HttpClient } from "@printwithsynergy/codex-client";

const FLATTENED_LAYER_INDEX = -1;
const PTS_TO_PX = DEFAULT_DPI / 72;
const DEFAULT_PAGE: PageInfo = pageInfoFromDimensions(1, 612, 792);

/**
 * Pick the codex base URL from the most likely host environments.
 *
 * - `import.meta.env.PUBLIC_CODEX_API_BASE_URL` (Astro / Vite)
 * - `process.env.NEXT_PUBLIC_CODEX_API_BASE_URL` (Next.js)
 * - Same-origin `/api/codex-proxy` so deploys can keep server-side
 *   tokens out of the browser.
 */
function resolveCodexBaseUrl(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any;
  const env: unknown =
    (typeof g !== "undefined" && g.__LOUPE_CODEX_API_BASE_URL) ||
    (typeof g !== "undefined" &&
      g.process?.env &&
      (g.process.env.NEXT_PUBLIC_CODEX_API_BASE_URL ||
        g.process.env.PUBLIC_CODEX_API_BASE_URL ||
        g.process.env.CODEX_API_BASE_URL));
  if (typeof env === "string" && env.trim()) {
    return env.trim().replace(/\/+$/, "");
  }
  return "/api/codex-proxy";
}

export interface LoupeViewerControllerOptions {
  pdfUrl: string;
  codexDocument?: unknown;
  workerSrc?: string;
  services?: ViewerServices;
  tools: ReadonlyArray<LoupePDFTool>;
  initialPage: number;
  initialZoom: number;
  tacLimit: number;
  tokens: ThemeTokens;
  isMobile: boolean;
  preset: LoupePDFPresetKind;
  plugins?: ReadonlyArray<LoupePDFShellPlugin>;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  onError?: (message: string) => void;
}

export interface LoupeViewerControllerResult {
  hostValue: {
    apiBase: string;
    jobApiBase: string;
    readOnly: boolean;
    debug: boolean;
    pdfUrl: string | undefined;
  };
  services: ViewerServices | null;
  error: string | null;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  page: PageInfo;
  pageCount: number;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  canvasW: number;
  canvasH: number;
  viewerMode: ViewerMode;
  activeTool: PointerTool;
  setActiveTool: React.Dispatch<React.SetStateAction<PointerTool>>;
  showHeatmap: boolean;
  enabledChannels: Set<string>;
  enabledLayers: Set<number>;
  allLayerIndices: number[];
  detectedInks: DetectedInk[];
  annotationTool: AnnotationTool;
  strokeColor: string;
  setSavingAnnotation: React.Dispatch<React.SetStateAction<boolean>>;
  indexedAnnotations: Array<{
    number: number;
    pageNum: number;
    objectType: string;
    centerX: number;
    centerY: number;
  }>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: React.Dispatch<React.SetStateAction<string | null>>;
  handleAnnotationHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  setIndexedAnnotations: React.Dispatch<
    React.SetStateAction<
      Array<{
        number: number;
        pageNum: number;
        objectType: string;
        centerX: number;
        centerY: number;
      }>
    >
  >;
  preparing: boolean;
  toolsLoading: boolean;
  leftPanelPlugins: LoupePDFShellPlugin[];
  toolbarOverlayPlugins: LoupePDFShellPlugin[];
  shellPluginContext: LoupePDFShellPluginContext;
  showAnnotate: boolean;
  stagePan: ReturnType<typeof useStagePan<HTMLElement>>;
  annotationWrapRef: React.MutableRefObject<HTMLDivElement | null>;
}

export function useLoupeViewerController({
  pdfUrl,
  codexDocument,
  workerSrc,
  services: serviceOverrides,
  tools,
  initialPage,
  initialZoom,
  tacLimit,
  tokens,
  isMobile,
  preset,
  plugins: customPlugins = [],
  onPageChange: onPageChangeProp,
  onZoomChange: onZoomChangeProp,
  onError: onErrorProp,
}: LoupeViewerControllerOptions): LoupeViewerControllerResult {
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(initialZoom);
  const [page, setPage] = useState<PageInfo>(
    initialPage !== 1 ? { ...DEFAULT_PAGE, page_num: initialPage } : DEFAULT_PAGE,
  );
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [viewerMode, setViewerMode] = useState<ViewerMode>("page");
  const [activeTool, setActiveTool] = useState<PointerTool>("none");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [allLayerIndices, setAllLayerIndices] = useState<number[]>([]);
  const [enabledLayers, setEnabledLayers] = useState<Set<number>>(new Set());
  const [enabledChannels, setEnabledChannels] = useState<Set<string>>(
    new Set(PROCESS_CHANNELS),
  );
  const [detectedInks, setDetectedInks] = useState<DetectedInk[]>([]);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pen");
  const [strokeColor, setStrokeColor] = useState(tokens.accent);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [indexedAnnotations, setIndexedAnnotations] = useState<
    Array<{
      number: number;
      pageNum: number;
      objectType: string;
      centerX: number;
      centerY: number;
    }>
  >([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);

  const [browserServices, setBrowserServices] = useState<BrowserViewerServices | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);

  const servicesVersion = useBrowserViewerServicesVersion(browserServices);

  useEffect(() => {
    onPageChangeProp?.(currentPage);
  }, [currentPage, onPageChangeProp]);
  useEffect(() => {
    onZoomChangeProp?.(zoom);
  }, [zoom, onZoomChangeProp]);
  useEffect(() => {
    if (error) onErrorProp?.(error);
  }, [error, onErrorProp]);

  useEffect(() => {
    if (!pdfUrl) {
      setBrowserServices(null);
      return;
    }
    if (!codexDocument) {
      setBrowserServices(null);
      setError(null);
      return;
    }
    let cancelled = false;
    let services: BrowserViewerServices | null = null;
    (async () => {
      try {
        const codex = new HttpClient({ baseUrl: resolveCodexBaseUrl() });
        // Fetch the PDF once so codex calls don't redo it per request.
        const resp = await fetch(pdfUrl);
        if (!resp.ok) {
          throw new Error(
            `[loupe-pdf] PDF fetch failed: ${resp.status} ${resp.statusText}`,
          );
        }
        const pdfBytes = await resp.arrayBuffer();
        if (cancelled) return;
        // codex /v1/extract returns pdf_sha256 in the document so we
        // can use hash-only render calls (no re-upload per page).
        const pdfSha256 =
          (codexDocument as { pdf_sha256?: unknown } | null)?.pdf_sha256;
        services = createBrowserViewerServices({
          codex,
          pdfBytes,
          codexDocument,
          tokens,
          tacLimit,
          pdfSha256: typeof pdfSha256 === "string" ? pdfSha256 : undefined,
        });
        setBrowserServices(services);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "[loupe-pdf] init failed");
        }
      }
    })();
    void workerSrc; // legacy prop accepted for compat — pdfjs is gone
    return () => {
      cancelled = true;
      services?.dispose();
    };
  }, [pdfUrl, codexDocument, workerSrc, tacLimit, tokens]);

  useEffect(() => {
    const svc = browserServices;
    if (!svc) {
      setPageCount(1);
      setToolsLoading(false);
      return;
    }
    let cancelled = false;
    setToolsLoading(true);
    (async () => {
      try {
        const total = await svc.getPageCount();
        if (cancelled) return;
        setPageCount(total);
        const next = Math.min(total, Math.max(1, currentPage));
        if (next !== currentPage) setCurrentPage(next);
        const dims = await svc.getPageDimensions(next);
        if (cancelled) return;
        setPage(pageInfoFromDimensions(next, dims.widthPts, dims.heightPts));
        const layers = await svc.layers.listLayers();
        if (cancelled) return;
        const indices =
          layers.length > 0
            ? layers.map((l) => l.ocg_index)
            : [FLATTENED_LAYER_INDEX];
        setAllLayerIndices(indices);
        setEnabledLayers(new Set(indices));
        const inks = await svc.getInks();
        if (cancelled) return;
        setDetectedInks(inks);
        setEnabledChannels(new Set(inks.map((i) => i.name)));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF.");
        }
      } finally {
        if (!cancelled) setToolsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserServices]);

  useEffect(() => {
    const svc = browserServices;
    if (!svc) return;
    let cancelled = false;
    (async () => {
      try {
        const dims = await svc.getPageDimensions(currentPage);
        if (cancelled) return;
        setPage(pageInfoFromDimensions(currentPage, dims.widthPts, dims.heightPts));
      } catch {
        // no-op
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [browserServices, currentPage]);

  useEffect(() => {
    const svc = browserServices;
    if (!svc) return;
    if (viewerMode === "page" && !showHeatmap) return;
    let cancelled = false;
    setPreparing(true);
    (async () => {
      try {
        await svc.prepare(currentPage, { tacLimit });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to prepare page.",
          );
        }
      } finally {
        if (!cancelled) setPreparing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [browserServices, currentPage, viewerMode, showHeatmap, tacLimit]);

  const services: ViewerServices | null = useMemo(() => {
    if (serviceOverrides && browserServices) {
      return {
        pageImages: isUnwired(serviceOverrides.pageImages)
          ? browserServices.pageImages
          : serviceOverrides.pageImages,
        layers: isUnwired(serviceOverrides.layers)
          ? browserServices.layers
          : serviceOverrides.layers,
        separations: isUnwired(serviceOverrides.separations)
          ? browserServices.separations
          : serviceOverrides.separations,
        tacHeatmap: isUnwired(serviceOverrides.tacHeatmap)
          ? browserServices.tacHeatmap
          : serviceOverrides.tacHeatmap,
        colorSample: isUnwired(serviceOverrides.colorSample)
          ? browserServices.colorSample
          : serviceOverrides.colorSample,
        densitometer: isUnwired(serviceOverrides.densitometer)
          ? browserServices.densitometer
          : serviceOverrides.densitometer,
        annotations: isUnwired(serviceOverrides.annotations)
          ? browserServices.annotations
          : serviceOverrides.annotations,
        reports: isUnwired(serviceOverrides.reports)
          ? browserServices.reports
          : serviceOverrides.reports,
        telemetry: isUnwired(serviceOverrides.telemetry)
          ? browserServices.telemetry
          : serviceOverrides.telemetry,
        i18n: isUnwired(serviceOverrides.i18n)
          ? browserServices.i18n
          : serviceOverrides.i18n,
        tokens: serviceOverrides.tokens ?? browserServices.tokens,
      };
    }
    return serviceOverrides ?? browserServices ?? null;
  }, [serviceOverrides, browserServices]);

  const scale = zoom / 100;
  const canvasW = Math.round(page.width_pts * PTS_TO_PX * scale);
  const canvasH = Math.round(page.height_pts * PTS_TO_PX * scale);

  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTool !== "annotate") return;
    const wrap = annotationWrapRef.current;
    if (!wrap) return;
    annotationCanvasRef.current =
      (wrap.querySelector("canvas") as HTMLCanvasElement) ?? null;
  }, [activeTool, currentPage, canvasW, canvasH]);

  useEffect(() => {
    setIndexedAnnotations([]);
    setSelectedAnnotationId(null);
  }, [currentPage]);

  const triggerUndo = useCallback(() => {
    const fn = (annotationCanvasRef.current as unknown as {
      __annotationUndo?: () => void;
    } | null)?.__annotationUndo;
    fn?.();
  }, []);
  const triggerRedo = useCallback(() => {
    const fn = (annotationCanvasRef.current as unknown as {
      __annotationRedo?: () => void;
    } | null)?.__annotationRedo;
    fn?.();
  }, []);
  const handleAnnotationHistoryChange = useCallback((canU: boolean, canR: boolean) => {
    setCanUndo(canU);
    setCanRedo(canR);
  }, []);

  const availability = useMemo(
    () =>
      computeFeatureAvailability({
        tools,
        services,
        detectedInkCount: detectedInks.length,
        layerCount: allLayerIndices.length,
        isUnwired,
      }),
    [tools, services, detectedInks.length, allLayerIndices.length],
  );

  const shellPluginContext = useMemo(
    () => ({
      tokens,
      isMobile,
      pdfUrl,
      servicesVersion,
      currentPage,
      setCurrentPage,
      viewerMode,
      setViewerMode,
      activeTool,
      setActiveTool,
      showHeatmap,
      setShowHeatmap,
      enabledChannels,
      setEnabledChannels,
      detectedInks: detectedInks.map((ink) => ({ name: ink.name, type: ink.type })),
      enabledLayers,
      setEnabledLayers,
      allLayerIndices,
      annotationTool,
      setAnnotationTool,
      strokeColor,
      setStrokeColor,
      savingAnnotation,
      canUndo,
      canRedo,
      triggerUndo,
      triggerRedo,
      indexedAnnotations,
      selectedAnnotationId,
      setSelectedAnnotationId,
      availability,
    }),
    [
      tokens,
      isMobile,
      pdfUrl,
      servicesVersion,
      currentPage,
      viewerMode,
      activeTool,
      showHeatmap,
      enabledChannels,
      detectedInks,
      enabledLayers,
      allLayerIndices,
      annotationTool,
      strokeColor,
      savingAnnotation,
      canUndo,
      canRedo,
      triggerUndo,
      triggerRedo,
      indexedAnnotations,
      selectedAnnotationId,
      availability,
    ],
  );

  const resolvedPlugins = useMemo(
    () => resolveShellPlugins([...pluginsForPreset(preset), ...customPlugins]),
    [preset, customPlugins],
  );

  const leftPanelPlugins = useMemo(
    () => pluginsForSlot(resolvedPlugins, "panel.left", shellPluginContext),
    [resolvedPlugins, shellPluginContext],
  );
  const toolbarOverlayPlugins = useMemo(
    () => pluginsForSlot(resolvedPlugins, "overlay.toolbar", shellPluginContext),
    [resolvedPlugins, shellPluginContext],
  );

  useEffect(() => {
    if (viewerMode === "separation" && !availability.separations) setViewerMode("page");
    if (viewerMode === "layer" && !availability.layers) setViewerMode("page");
  }, [viewerMode, availability.separations, availability.layers]);

  useEffect(() => {
    if (activeTool === "color-picker" && !availability.colorPicker) setActiveTool("none");
    if (activeTool === "densitometer" && !availability.densitometer) setActiveTool("none");
    if (activeTool === "measure" && !availability.measure) setActiveTool("none");
    if (activeTool === "annotate" && !availability.annotate) setActiveTool("none");
  }, [
    activeTool,
    availability.colorPicker,
    availability.densitometer,
    availability.measure,
    availability.annotate,
  ]);

  useEffect(() => {
    if (!availability.tacHeatmap && showHeatmap) setShowHeatmap(false);
  }, [availability.tacHeatmap, showHeatmap]);

  const hostValue = useMemo(
    () => ({
      apiBase: "",
      jobApiBase: "",
      readOnly: false,
      debug: false,
      pdfUrl: pdfUrl || undefined,
    }),
    [pdfUrl],
  );

  const showAnnotate = availability.annotate;
  const stagePan = useStagePan<HTMLElement>({ enabled: activeTool === "none" });

  return {
    hostValue,
    services,
    error,
    setError,
    page,
    pageCount,
    currentPage,
    setCurrentPage,
    zoom,
    setZoom,
    canvasW,
    canvasH,
    viewerMode,
    activeTool,
    setActiveTool,
    showHeatmap,
    enabledChannels,
    enabledLayers,
    allLayerIndices,
    detectedInks,
    annotationTool,
    strokeColor,
    setSavingAnnotation,
    indexedAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    handleAnnotationHistoryChange,
    setIndexedAnnotations,
    preparing,
    toolsLoading,
    leftPanelPlugins,
    toolbarOverlayPlugins,
    shellPluginContext,
    showAnnotate,
    stagePan,
    annotationWrapRef,
  };
}
