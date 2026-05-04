"use client";

/**
 * `<LoupePDFDemo>` — kitchen-sink interactive demo component.
 *
 * **Most consumers should not import this directly.** Use
 * {@link LoupePDF} instead — it's a one-liner production drop-in:
 *
 * ```tsx
 * <LoupePDF pdfUrl="/proofs/abc.pdf" workerSrc={pdfWorkerSrc} />
 * ```
 *
 * `<LoupePDFDemo>` is the same renderer with the marketing chrome
 * (URL bar, drag-and-drop upload, file picker, empty state) turned
 * on; it powers the public showcase at loupepdf.com so reviewers
 * can drop arbitrary PDFs into the page without a host.
 *
 * One mount, full feature surface. Backed by
 * `createBrowserViewerServices`, every viewer-only feature LoupePDF
 * ships works on any PDF the browser can fetch:
 *
 *   - PageCanvas + multi-page navigation + multi-DPI tile cache
 *   - Color picker (RGB + TAC, CMYK + every detected spot ink)
 *   - Densitometer (CMYK + spots + TAC limit)
 *   - Measure tool (mm / in / pt)
 *   - TAC heatmap overlay (CMYK + spots)
 *   - Per-ink CMYK + spot separations preview (inks default ON,
 *     untick to hide that plate — same UX as Acrobat's Output
 *     Preview)
 *   - PDF layers (per-OCG isolated rendering, default all on)
 *   - Annotation canvas + toolbar + thread (in-memory)
 *
 * Three mutually-exclusive primary canvases — Page (default),
 * Separation preview, Layer preview — match the lint-pdf reference
 * viewer's UX so the same muscle memory carries over.
 *
 * Server-only features (true ICC separations, preflight findings,
 * server-persisted annotations, PDF report exports) self-hide because
 * their dedicated services are intentionally `markUnwired`. Hosts
 * that have a backend pass `services` to override.
 *
 * Internal organisation:
 *
 *   - Inline CSS-in-JS lives in `LoupePDFDemo.styles.ts` (so this
 *     file focuses on the React tree, not 270 lines of styling).
 *   - Smaller building blocks (`PageCanvas`, `SeparationCanvas`,
 *     `LayerCanvas`, `AnnotationCanvas`, `AnnotationToolbar`,
 *     `AnnotationThread`, `LayerPanel`, `BoxOverlay`,
 *     `DielineOverlay`, `TACHeatmapOverlay`, `ColorPickerTool`,
 *     `DensitometerTool`, `MeasureTool`) each ship as their own
 *     component file and are composed here.
 *
 * @public
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  createBrowserViewerServices,
  useBrowserViewerServicesVersion,
  PROCESS_CHANNELS,
  type BrowserViewerServices,
  type DetectedInk,
} from "../browser";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import { darkThemeTokens } from "../plugin/services";
import type { OverlayItem } from "../plugin/types";
import type { DielineResult, PageInfo } from "../types";
import { DEFAULT_DPI, pageInfoFromDimensions } from "../types";
import { ViewerHostContext, ViewerServicesContext } from "../host";
import { validatePdfFile, validatePdfUrl } from "../host/pdfValidation";
import {
  brandStyle,
  btnStyle,
  channelSwatchStyle,
  dropOverlayStyle,
  emptyStateStyle,
  errorStyle,
  exitFsStyle,
  footerStyle,
  ghostBtnStyle,
  headingStyle,
  layoutStyle,
  modeButtonGroupStyle,
  modeButtonStyle,
  pageNavBtnStyle,
  pageNavStyle,
  preparingOverlayStyle,
  rowStyle,
  shellStyle,
  sidebarStyle,
  stageInnerStyle,
  stageStyle,
  topbarStyle,
  urlBarStyle,
  urlInputStyle,
} from "./LoupePDFDemo.styles";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationThread } from "./AnnotationThread";
import { AnnotationToolbar, type AnnotationTool } from "./AnnotationToolbar";
import { BoxOverlay } from "./BoxOverlay";
import { ColorPickerTool } from "./ColorPickerTool";
import { DensitometerTool } from "./DensitometerTool";
import { DielineOverlay } from "./DielineOverlay";
import { LayerCanvas } from "./LayerCanvas";
import { LayerPanel } from "./LayerPanel";
import { MeasureTool } from "./MeasureTool";
import { PageCanvas } from "./PageCanvas";
import { SeparationCanvas } from "./SeparationCanvas";
import { TACHeatmapOverlay } from "./TACHeatmapOverlay";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tool ids the demo's sidebar can show. The `tools` prop accepts any
 * subset; default is every tool. Passing `[]` hides the entire tool
 * column, giving consumers a "viewer only" mount.
 *
 * @public
 */
export type LoupePDFDemoTool =
  | "color-picker"
  | "densitometer"
  | "measure"
  | "annotate"
  | "tac-heatmap"
  | "separations"
  | "layers";

const DEFAULT_TOOLS: ReadonlyArray<LoupePDFDemoTool> = [
  "color-picker",
  "densitometer",
  "measure",
  "annotate",
  "tac-heatmap",
  "separations",
  "layers",
];

/**
 * Props for {@link LoupePDFDemo}.
 *
 * @public
 */
export interface LoupePDFDemoProps {
  /** Theme tokens. Defaults to {@link darkThemeTokens}. */
  tokens?: Partial<ThemeTokens>;
  /** Maximum upload size in bytes. Default: 50 MB. */
  maxFileSize?: number;
  /** Brand label in the top bar. Default: "LoupePDF". */
  brand?: string;
  /** Brand logo URL for the top bar. */
  brandLogoUrl?: string;
  /** Optional className on the outermost div. */
  className?: string;
  /** Tools to show in the sidebar. Default: every tool. */
  tools?: ReadonlyArray<LoupePDFDemoTool>;
  /** Initial zoom percentage. Default: 80. */
  initialZoom?: number;
  /** TAC limit for the heatmap + densitometer. Default: 300. */
  tacLimit?: number;
  /** Override pdf.js worker URL (unpkg by default). */
  workerSrc?: string;
  /**
   * Pre-built services. When provided, replaces the in-browser
   * factory entirely — typically only used by hosts that ship a
   * full backend and just want the demo's chrome / layout.
   */
  services?: ViewerServices;
  /** Optional footer content below the viewer. */
  footer?: ReactNode;
  /** When true, renders full-viewport with fixed positioning. */
  fullscreen?: boolean;
  /** Pre-loaded PDF URL (e.g. from query params). Skips empty state. */
  initialPdfUrl?: string;
  /** Initial page number (1-indexed). Default: 1. */
  initialPage?: number;
  /**
   * When true, hides the upload chrome (URL bar, file picker, drag &
   * drop, empty state) and renders as an embedded production viewer.
   * `initialPdfUrl` becomes effectively required. Used internally by
   * `<LoupePDF>` to expose a clean drop-in surface.
   */
  embedded?: boolean;
  // ── Optional preflight integration ─────────────────────────────────────
  /**
   * Findings to flag on the page raster. Hosts convert their domain
   * records (engine findings, brand-spec violations, etc.) into
   * `OverlayItem`s. PageCanvas draws the bbox tinted by `tier`,
   * PageNavigator badges errors / warnings per page.
   */
  items?: readonly OverlayItem[];
  /** Currently-selected finding (controlled). Drives the canvas
   *  highlight + tooltip. */
  selectedItem?: OverlayItem | null;
  /** Fires when the user clicks a finding's bbox or the page background
   *  (in which case the argument is `null`). */
  onItemSelect?: (item: OverlayItem | null) => void;
  /**
   * Dieline payload for the current page. When non-null, mounts
   * `<DielineOverlay>` so each detected artwork region gets a
   * size-popover info chip at its centroid (mm + inches).
   */
  dieline?: DielineResult | null;
  /**
   * When true, mounts `<BoxOverlay>` so trim / bleed / crop boxes
   * defined in the PDF render with size popovers. Hosts that don't
   * carry box geometry can leave this off (default).
   */
  showBoxOverlays?: boolean;
  /**
   * When true, the canvas is clipped to the page's TrimBox (falls
   * back to BleedBox, then CropBox). Hides the white bleed strip
   * outside the trim line. Default false.
   */
  cropToTrim?: boolean;
  // ── Lifecycle callbacks ────────────────────────────────────────────────
  /** Fires after the active page changes (1-indexed). */
  onPageChange?: (page: number) => void;
  /** Fires after the zoom level changes (percentage). */
  onZoomChange?: (zoom: number) => void;
  /** Fires when the viewer raises a recoverable error. */
  onError?: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
// PTS_TO_PX must match PageCanvas's internal pts-to-pixel conversion
// (which is `DEFAULT_DPI / 72`). Using a different ratio here makes
// the canvas-area parent div size disagree with PageCanvas's rendered
// page, so absolute-positioned overlays (TAC heatmap, separations,
// layers, annotations, dieline) shift relative to the page content.
const PTS_TO_PX = DEFAULT_DPI / 72;
const DEFAULT_PAGE: PageInfo = pageInfoFromDimensions(1, 612, 792);

const PROCESS_SWATCH: Record<string, string> = {
  Cyan: "#00b7eb",
  Magenta: "#ec008c",
  Yellow: "#fdd835",
  Black: "#111827",
};

type ViewerMode = "page" | "separation" | "layer";

function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// ---------------------------------------------------------------------------
// Tool radio
// ---------------------------------------------------------------------------

type PointerTool =
  | "none"
  | "color-picker"
  | "densitometer"
  | "measure"
  | "annotate";

function ToolRadio({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <label style={rowStyle}>
      <input type="radio" checked={active} onChange={onToggle} />
      <span>{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * Complete interactive LoupePDF demo — upload, URL paste, drag-drop,
 * validation, sidebar controls, theming, and optional fullscreen mode.
 * All viewer-only features (color picker, densitometer, measure,
 * separations, TAC heatmap, layers, annotations) are wired out of the
 * box.
 *
 * @public
 */
export function LoupePDFDemo({
  tokens: tokenOverrides,
  maxFileSize = DEFAULT_MAX_BYTES,
  brand = "LoupePDF",
  brandLogoUrl,
  className,
  tools = DEFAULT_TOOLS,
  initialZoom = 80,
  tacLimit = 300,
  workerSrc,
  services: serviceOverrides,
  footer,
  fullscreen: initialFullscreen = false,
  initialPdfUrl,
  initialPage = 1,
  embedded = false,
  items,
  selectedItem,
  onItemSelect,
  dieline,
  showBoxOverlays = false,
  cropToTrim = false,
  onPageChange: onPageChangeProp,
  onZoomChange: onZoomChangeProp,
  onError: onErrorProp,
}: LoupePDFDemoProps) {
  const overlayItems = useMemo<readonly OverlayItem[]>(
    () => items ?? [],
    [items],
  );
  // Selection: controlled when onItemSelect is supplied, uncontrolled otherwise.
  const [internalSelected, setInternalSelected] =
    useState<OverlayItem | null>(null);
  const effectiveSelected =
    onItemSelect !== undefined ? (selectedItem ?? null) : internalSelected;
  const handleItemClick = useCallback(
    (item: OverlayItem) => {
      if (onItemSelect) onItemSelect(item);
      else setInternalSelected(item);
    },
    [onItemSelect],
  );
  // -----------------------------------------------------------------------
  // Tokens
  // -----------------------------------------------------------------------
  const tokens: ThemeTokens = useMemo(
    () => ({ ...darkThemeTokens, ...tokenOverrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(tokenOverrides)],
  );

  // -----------------------------------------------------------------------
  // PDF state
  // -----------------------------------------------------------------------
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl ?? "");
  const [draftUrl, setDraftUrl] = useState(initialPdfUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(initialFullscreen);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Embedded mode treats `initialPdfUrl` as a controlled prop — when
  // it changes, swap the loaded PDF and reset to page 1. Demo mode
  // ignores subsequent changes (the user drives the URL via the
  // upload bar) so behaviour stays unsurprising.
  useEffect(() => {
    if (!embedded) return;
    const next = initialPdfUrl ?? "";
    setPdfUrl((prev) => (prev === next ? prev : next));
    setDraftUrl(next);
    if (next) setCurrentPage(initialPage);
    // initialPage intentionally read once via closure; the page-reset
    // belongs to URL change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [embedded, initialPdfUrl]);

  // -----------------------------------------------------------------------
  // Page / zoom state
  // -----------------------------------------------------------------------
  const [zoom, setZoom] = useState(initialZoom);
  const [page, setPage] = useState<PageInfo>(
    initialPage !== 1
      ? { ...DEFAULT_PAGE, page_num: initialPage }
      : DEFAULT_PAGE,
  );
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Lifecycle callbacks: fire host listeners whenever core state moves.
  // Wrapped in effects rather than threading through every setter
  // callsite (zoom slider / arrow keys / wheel pinch / page nav buttons /
  // "jump to page" from annotation thread, etc.) so behaviour stays in
  // one place.
  useEffect(() => {
    onPageChangeProp?.(currentPage);
  }, [currentPage, onPageChangeProp]);
  useEffect(() => {
    onZoomChangeProp?.(zoom);
  }, [zoom, onZoomChangeProp]);
  useEffect(() => {
    if (error) onErrorProp?.(error);
  }, [error, onErrorProp]);

  // -----------------------------------------------------------------------
  // Viewer mode (mutually exclusive primary canvas) + tool overlay state
  // -----------------------------------------------------------------------
  const [viewerMode, setViewerMode] = useState<ViewerMode>("page");
  const [activeTool, setActiveTool] = useState<PointerTool>("none");
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [allLayerIndices, setAllLayerIndices] = useState<number[]>([]);
  const [enabledLayers, setEnabledLayers] = useState<Set<number>>(new Set());
  const [enabledChannels, setEnabledChannels] = useState<Set<string>>(
    new Set(PROCESS_CHANNELS),
  );
  const [detectedInks, setDetectedInks] = useState<DetectedInk[]>([]);

  // -----------------------------------------------------------------------
  // Annotation state
  // -----------------------------------------------------------------------
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("pointer");
  const [strokeColor, setStrokeColor] = useState(tokens.accent);
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // -----------------------------------------------------------------------
  // Services
  // -----------------------------------------------------------------------
  const [browserServices, setBrowserServices] =
    useState<BrowserViewerServices | null>(null);
  const [preparing, setPreparing] = useState(false);

  // Reactive: re-render every time the services notify a new tile / channel
  // / heatmap is ready. PageCanvas / SeparationCanvas / TACHeatmapOverlay
  // re-read the synchronous URL builders and pick up the fresh blob URL.
  useBrowserViewerServicesVersion(browserServices);

  // Build / dispose services whenever the PDF URL changes.
  useEffect(() => {
    if (serviceOverrides) {
      setBrowserServices(null);
      return;
    }
    if (!pdfUrl) {
      setBrowserServices(null);
      return;
    }
    const next = createBrowserViewerServices({
      pdfUrl,
      workerSrc,
      tokens,
      tacLimit,
    });
    setBrowserServices(next);
    return () => next.dispose();
  }, [pdfUrl, workerSrc, tacLimit, tokens, serviceOverrides]);

  // Resolve page count + initial layer list when services come online.
  useEffect(() => {
    const svc = browserServices;
    if (!svc) {
      setPageCount(1);
      return;
    }
    let cancelled = false;
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
        const indices = layers.map((l) => l.ocg_index);
        setAllLayerIndices(indices);
        // Default all detected layers ON, matching the lint-pdf
        // viewer's "Layers mode" default.
        setEnabledLayers(new Set(indices));
        // Surface every ink the PDF declares so the Inks panel can
        // toggle CMYK + spots, and the densitometer / color picker
        // report on every plate the document carries.
        const inks = await svc.getInks();
        if (cancelled) return;
        setDetectedInks(inks);
        setEnabledChannels(new Set(inks.map((i) => i.name)));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load PDF.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // currentPage intentionally omitted — handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browserServices]);

  // Re-read page dimensions on page navigation.
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
        // Ignore — error already surfaced by the initial load effect.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [browserServices, currentPage]);

  // Pre-warm separations / heatmap / layer rasters whenever we enter a
  // mode that needs them. Without this, <SeparationCanvas> /
  // <LayerCanvas> latch onto the empty URL the lazy builder returns
  // before the analysis raster lands and never retry.
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

  const services: ViewerServices | null =
    serviceOverrides ?? browserServices ?? null;

  // -----------------------------------------------------------------------
  // Blob URL lifecycle (uploads only)
  // -----------------------------------------------------------------------
  const blobUrlRef = useRef<string | null>(null);
  const revokePreviousBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);
  useEffect(() => revokePreviousBlob, [revokePreviousBlob]);

  // -----------------------------------------------------------------------
  // Derived
  // -----------------------------------------------------------------------
  const scale = zoom / 100;
  const canvasW = Math.round(page.width_pts * PTS_TO_PX * scale);
  const canvasH = Math.round(page.height_pts * PTS_TO_PX * scale);

  const hostValue = useMemo(
    () => ({
      apiBase: "",
      jobApiBase: "",
      // readOnly = false so AnnotationCanvas persists drawings to the
      // in-memory annotation service.
      readOnly: false,
      debug: false,
      pdfUrl: pdfUrl || undefined,
    }),
    [pdfUrl],
  );

  // -----------------------------------------------------------------------
  // Input handlers
  // -----------------------------------------------------------------------
  const loadUrl = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const result = validatePdfUrl(draftUrl);
      if (!result.valid) {
        setError(result.error ?? "Invalid URL.");
        return;
      }
      setError(null);
      revokePreviousBlob();
      setCurrentPage(1);
      setViewerMode("page");
      setPdfUrl(draftUrl.trim());
    },
    [draftUrl, revokePreviousBlob],
  );

  const loadFile = useCallback(
    async (file: File) => {
      const result = await validatePdfFile(file, maxFileSize);
      if (!result.valid) {
        setError(result.error ?? "Invalid file.");
        return;
      }
      setError(null);
      revokePreviousBlob();
      const blobUrl = URL.createObjectURL(file);
      blobUrlRef.current = blobUrl;
      setDraftUrl(file.name);
      setCurrentPage(1);
      setViewerMode("page");
      setPdfUrl(blobUrl);
    },
    [revokePreviousBlob, maxFileSize],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) loadFile(file);
      e.target.value = "";
    },
    [loadFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) loadFile(file);
    },
    [loadFile],
  );

  // -----------------------------------------------------------------------
  // Annotation undo/redo plumbing
  // -----------------------------------------------------------------------
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTool !== "annotate") return;
    const wrap = annotationWrapRef.current;
    if (!wrap) return;
    annotationCanvasRef.current =
      (wrap.querySelector("canvas") as HTMLCanvasElement) ?? null;
  }, [activeTool, currentPage, canvasW, canvasH]);

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

  // -----------------------------------------------------------------------
  // Sidebar visibility helpers
  // -----------------------------------------------------------------------
  const toolSet = useMemo(() => new Set<LoupePDFDemoTool>(tools), [tools]);
  const showColorPicker = toolSet.has("color-picker");
  const showDensitometer = toolSet.has("densitometer");
  const showMeasure = toolSet.has("measure");
  const showAnnotate = toolSet.has("annotate");
  const showHeatmapToggle = toolSet.has("tac-heatmap");
  const showSeparations = toolSet.has("separations");
  const showLayersControl = toolSet.has("layers");
  const hasAnyTool =
    showColorPicker ||
    showDensitometer ||
    showMeasure ||
    showAnnotate ||
    showHeatmapToggle ||
    showSeparations ||
    showLayersControl;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const placeholderServices: ViewerServices | null = services;

  return (
    <ViewerHostContext.Provider value={hostValue}>
      {placeholderServices ? (
        <ViewerServicesContext.Provider value={placeholderServices}>
          {renderShell()}
        </ViewerServicesContext.Provider>
      ) : (
        renderShell()
      )}
    </ViewerHostContext.Provider>
  );

  function renderShell() {
    return (
      <div
        className={className}
        style={shellStyle(tokens, fullscreen)}
        onDragOver={embedded ? undefined : onDragOver}
        onDragLeave={embedded ? undefined : onDragLeave}
        onDrop={embedded ? undefined : onDrop}
      >
        {fullscreen && (
          <button
            type="button"
            style={exitFsStyle}
            onClick={() => setFullscreen(false)}
          >
            Exit fullscreen
          </button>
        )}

        {!embedded && dragging && (
          <div style={dropOverlayStyle}>Drop your PDF here</div>
        )}

        {/* Top bar — hidden in embedded mode so hosts can supply their
            own chrome around `<LoupePDF>`. */}
        {!embedded && (
        <header style={topbarStyle}>
          <div style={brandStyle}>
            {brandLogoUrl && (
              <img
                src={brandLogoUrl}
                alt=""
                aria-hidden="true"
                style={{ width: 24, height: 24 }}
              />
            )}
            <span>{brand}</span>
            <span style={{ opacity: 0.4 }}>&middot;</span>
            <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 13 }}>
              demo
            </span>
          </div>
          <form style={urlBarStyle} onSubmit={loadUrl}>
            <input
              type="text"
              placeholder="Paste any PDF URL the browser can fetch…"
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              style={urlInputStyle(tokens)}
            />
            <button type="submit" style={btnStyle(tokens)}>
              Load
            </button>
          </form>
          <button
            type="button"
            style={ghostBtnStyle(tokens)}
            onClick={() => fileInputRef.current?.click()}
          >
            Upload PDF
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            style={{ display: "none" }}
            onChange={onFileChange}
          />
        </header>
        )}

        {error && (
          <div style={errorStyle()}>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss"
              style={{
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: 18,
              }}
            >
              &times;
            </button>
          </div>
        )}

        <div style={layoutStyle}>
          {/* Sidebar */}
          {hasAnyTool && (
            <aside style={sidebarStyle(tokens)}>
              <h2 style={headingStyle}>View</h2>
              <label style={rowStyle}>
                <span style={{ width: 44 }}>Zoom</span>
                <input
                  type="range"
                  min="25"
                  max="400"
                  step="5"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span
                  style={{
                    minWidth: 44,
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {zoom}%
                </span>
              </label>

              {pageCount > 1 && (
                <div style={pageNavStyle}>
                  <button
                    type="button"
                    style={pageNavBtnStyle(tokens, currentPage <= 1)}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    aria-label="Previous page"
                  >
                    &lsaquo;
                  </button>
                  <span
                    style={{
                      flex: 1,
                      textAlign: "center",
                      fontSize: 12,
                      fontVariantNumeric: "tabular-nums",
                      opacity: 0.8,
                    }}
                  >
                    Page {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    style={pageNavBtnStyle(tokens, currentPage >= pageCount)}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(pageCount, p + 1))
                    }
                    disabled={currentPage >= pageCount}
                    aria-label="Next page"
                  >
                    &rsaquo;
                  </button>
                </div>
              )}

              {(showSeparations || showLayersControl) && (
                <>
                  <h2 style={headingStyle}>Mode</h2>
                  <div style={modeButtonGroupStyle()}>
                    <button
                      type="button"
                      style={modeButtonStyle(tokens, viewerMode === "page", "left")}
                      onClick={() => setViewerMode("page")}
                    >
                      Page
                    </button>
                    {showSeparations && (
                      <button
                        type="button"
                        style={modeButtonStyle(
                          tokens,
                          viewerMode === "separation",
                          showLayersControl ? "middle" : "right",
                        )}
                        onClick={() => setViewerMode("separation")}
                      >
                        Separations
                      </button>
                    )}
                    {showLayersControl && (
                      <button
                        type="button"
                        style={modeButtonStyle(
                          tokens,
                          viewerMode === "layer",
                          "right",
                        )}
                        onClick={() => setViewerMode("layer")}
                      >
                        Layers
                      </button>
                    )}
                  </div>
                </>
              )}

              {(showColorPicker ||
                showDensitometer ||
                showMeasure ||
                showAnnotate ||
                showHeatmapToggle) && <h2 style={headingStyle}>Tools</h2>}
              {showColorPicker && (
                <ToolRadio
                  label="Color picker (RGB + TAC)"
                  active={activeTool === "color-picker"}
                  onToggle={() =>
                    setActiveTool((t) =>
                      t === "color-picker" ? "none" : "color-picker",
                    )
                  }
                />
              )}
              {showDensitometer && (
                <ToolRadio
                  label="Densitometer (CMYK)"
                  active={activeTool === "densitometer"}
                  onToggle={() =>
                    setActiveTool((t) =>
                      t === "densitometer" ? "none" : "densitometer",
                    )
                  }
                />
              )}
              {showMeasure && (
                <ToolRadio
                  label="Measure"
                  active={activeTool === "measure"}
                  onToggle={() =>
                    setActiveTool((t) =>
                      t === "measure" ? "none" : "measure",
                    )
                  }
                />
              )}
              {showAnnotate && (
                <ToolRadio
                  label="Annotate"
                  active={activeTool === "annotate"}
                  onToggle={() =>
                    setActiveTool((t) =>
                      t === "annotate" ? "none" : "annotate",
                    )
                  }
                />
              )}
              {showHeatmapToggle && (
                <label style={rowStyle}>
                  <input
                    type="checkbox"
                    checked={showHeatmap}
                    onChange={(e) => setShowHeatmap(e.target.checked)}
                  />
                  <span>TAC heatmap (limit {tacLimit}%)</span>
                </label>
              )}

              {showSeparations && viewerMode === "separation" && (
                <>
                  <h2 style={headingStyle}>Inks</h2>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    {(detectedInks.length > 0
                      ? detectedInks
                      : PROCESS_CHANNELS.map((n) => ({
                          name: n,
                          type: "process" as const,
                          altRgb: [0, 0, 0] as [number, number, number],
                        }))
                    ).map((ink) => {
                      const isProcess = ink.type === "process";
                      const swatch = isProcess
                        ? PROCESS_SWATCH[ink.name as keyof typeof PROCESS_SWATCH]
                        : `rgb(${ink.altRgb[0]}, ${ink.altRgb[1]}, ${ink.altRgb[2]})`;
                      return (
                        <label key={ink.name} style={rowStyle}>
                          <input
                            type="checkbox"
                            checked={enabledChannels.has(ink.name)}
                            onChange={(e) =>
                              setEnabledChannels((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(ink.name);
                                else next.delete(ink.name);
                                return next;
                              })
                            }
                          />
                          <span
                            style={{
                              ...channelSwatchStyle,
                              backgroundColor: swatch,
                            }}
                          />
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span
                              style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={ink.name}
                            >
                              {ink.name}
                            </span>
                          </span>
                          {!isProcess && (
                            <span
                              style={{
                                fontSize: 9,
                                opacity: 0.55,
                                textTransform: "uppercase",
                                letterSpacing: 0.5,
                              }}
                            >
                              spot
                            </span>
                          )}
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      style={{
                        ...ghostBtnStyle(tokens),
                        marginTop: 4,
                        fontSize: 11,
                        padding: "5px 10px",
                      }}
                      onClick={() =>
                        setEnabledChannels(
                          new Set(
                            (detectedInks.length > 0
                              ? detectedInks.map((i) => i.name)
                              : [...PROCESS_CHANNELS]),
                          ),
                        )
                      }
                      disabled={
                        enabledChannels.size ===
                        (detectedInks.length > 0
                          ? detectedInks.length
                          : PROCESS_CHANNELS.length)
                      }
                    >
                      Show all inks
                    </button>
                  </div>
                  <p style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.5 }}>
                    Untick an ink to preview the page without that plate
                    — same UX as Acrobat&rsquo;s Output Preview.
                    {detectedInks.some((i) => i.type === "spot") && (
                      <>
                        {" "}Spot plates are RGB-derived approximations;
                        wire a backend for ICC-correct readings.
                      </>
                    )}
                  </p>
                </>
              )}

              {showLayersControl && viewerMode === "layer" && (
                <>
                  <h2 style={headingStyle}>Layers</h2>
                  <div
                    style={{
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 8,
                      padding: 6,
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    {allLayerIndices.length === 0 ? (
                      <p
                        style={{
                          fontSize: 12,
                          opacity: 0.55,
                          padding: "8px 4px",
                          margin: 0,
                          lineHeight: 1.5,
                        }}
                      >
                        This PDF has no optional content groups (layers).
                      </p>
                    ) : (
                      <LayerPanel
                        jobId="loupe-pdf-demo"
                        enabledLayers={enabledLayers}
                        onToggleLayer={(ocgIndex) => {
                          setEnabledLayers((prev) => {
                            const next = new Set(prev);
                            if (next.has(ocgIndex)) next.delete(ocgIndex);
                            else next.add(ocgIndex);
                            return next;
                          });
                        }}
                        onSetAllLayers={(enabled) => {
                          setEnabledLayers(
                            enabled ? new Set(allLayerIndices) : new Set(),
                          );
                        }}
                      />
                    )}
                  </div>
                </>
              )}

              {showAnnotate && (
                <>
                  <h2 style={headingStyle}>Annotations</h2>
                  <div
                    style={{
                      border: `1px solid ${tokens.border}`,
                      borderRadius: 8,
                      padding: 6,
                      maxHeight: 200,
                      overflowY: "auto",
                    }}
                  >
                    <AnnotationThread
                      jobId="loupe-pdf-demo"
                      currentUserEmail="you@browser.local"
                      onJumpToPage={(p) => setCurrentPage(p)}
                    />
                  </div>
                </>
              )}

              <p
                style={{
                  fontSize: 11,
                  opacity: 0.5,
                  marginTop: "auto",
                  lineHeight: 1.5,
                }}
              >
                CMYK / TAC are RGB-derived approximations for showcase
                purposes; production hosts wire a backend for
                ICC-correct readings. Annotations live in this tab only
                and are discarded on reload. Max upload{" "}
                {formatMaxSize(maxFileSize)}.
              </p>
            </aside>
          )}

          {/* Stage */}
          <section style={stageStyle}>
            {!pdfUrl && embedded ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0, opacity: 0.6 }}>Loading…</p>
              </div>
            ) : !pdfUrl ? (
              <div style={emptyStateStyle}>
                {brandLogoUrl && (
                  <img
                    src={brandLogoUrl}
                    alt=""
                    aria-hidden="true"
                    style={{ width: 64, height: 64, opacity: 0.85 }}
                  />
                )}
                <h2 style={{ margin: 0 }}>{brand} demo viewer</h2>
                <p style={{ margin: 0, maxWidth: 380 }}>
                  Paste a PDF URL above or drag-and-drop a file anywhere
                  on this page to start inspecting.
                </p>
                <button
                  type="button"
                  style={{
                    ...btnStyle(tokens),
                    padding: "10px 24px",
                    fontSize: 15,
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose a file
                </button>
                <p style={{ fontSize: 11, opacity: 0.5 }}>
                  Max upload {formatMaxSize(maxFileSize)}.
                </p>
              </div>
            ) : (
              <div style={stageInnerStyle}>
                {showAnnotate && activeTool === "annotate" && (
                  <AnnotationToolbar
                    activeTool={annotationTool}
                    onToolChange={setAnnotationTool}
                    strokeColor={strokeColor}
                    onStrokeColorChange={setStrokeColor}
                    onUndo={triggerUndo}
                    onRedo={triggerRedo}
                    canUndo={canUndo}
                    canRedo={canRedo}
                    saving={savingAnnotation}
                  />
                )}
                <div
                  style={{
                    width: canvasW,
                    height: canvasH,
                    position: "relative",
                    background: "#fff",
                    boxShadow:
                      "0 24px 60px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.3)",
                    borderRadius: 4,
                  }}
                >
                  {/* Primary canvas — exactly one of Page / Separation /
                      Layer is mounted at a time. */}
                  {viewerMode === "separation" && services ? (
                    <SeparationCanvas
                      jobId="loupe-pdf-demo"
                      pageNum={page.page_num}
                      enabledChannels={enabledChannels}
                      allChannels={
                        detectedInks.length > 0
                          ? detectedInks.map((i) => i.name)
                          : [...PROCESS_CHANNELS]
                      }
                      width={canvasW}
                      height={canvasH}
                    />
                  ) : viewerMode === "layer" && services ? (
                    <LayerCanvas
                      jobId="loupe-pdf-demo"
                      pageNum={page.page_num}
                      enabledLayers={enabledLayers}
                      allLayers={allLayerIndices}
                      width={canvasW}
                      height={canvasH}
                    />
                  ) : (
                    <PageCanvas
                      jobId="loupe-pdf-demo"
                      page={page}
                      zoom={zoom}
                      items={overlayItems}
                      selectedItem={effectiveSelected}
                      onItemClick={handleItemClick}
                      cropToTrim={cropToTrim}
                    />
                  )}

                  {/* Trim / Bleed / Crop boxes — only for the Page mode
                      so they don't fight the separation / layer canvases. */}
                  {viewerMode === "page" && showBoxOverlays && (
                    <BoxOverlay
                      page={page}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                      dieline={dieline ?? null}
                    />
                  )}
                  {/* Dieline region size chips — independent of BoxOverlay
                      so hosts can flip on dieline-only without trim/bleed
                      clutter. */}
                  {viewerMode === "page" && dieline && !showBoxOverlays && (
                    <DielineOverlay
                      page={page}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                      dieline={dieline}
                    />
                  )}

                  {services && showHeatmap && (
                    <TACHeatmapOverlay
                      jobId="loupe-pdf-demo"
                      pageNum={page.page_num}
                      width={canvasW}
                      height={canvasH}
                      pageWidthPts={page.width_pts}
                      pageHeightPts={page.height_pts}
                      tacLimit={tacLimit}
                    />
                  )}
                  {services && showAnnotate && (
                    <div
                      ref={annotationWrapRef}
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents:
                          activeTool === "annotate" ? "auto" : "none",
                      }}
                    >
                      <AnnotationCanvas
                        jobId="loupe-pdf-demo"
                        pageNum={page.page_num}
                        width={canvasW}
                        height={canvasH}
                        activeTool={annotationTool}
                        strokeColor={strokeColor}
                        onSavingChange={setSavingAnnotation}
                        onHistoryChange={(canU, canR) => {
                          setCanUndo(canU);
                          setCanRedo(canR);
                        }}
                      />
                    </div>
                  )}
                  {activeTool === "color-picker" && (
                    <ColorPickerTool
                      jobId="loupe-pdf-demo"
                      pageNum={page.page_num}
                      pageWidthPts={page.width_pts}
                      pageHeightPts={page.height_pts}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                    />
                  )}
                  {activeTool === "densitometer" && (
                    <DensitometerTool
                      jobId="loupe-pdf-demo"
                      pageNum={page.page_num}
                      pageWidthPts={page.width_pts}
                      pageHeightPts={page.height_pts}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                      tacLimit={tacLimit}
                    />
                  )}
                  {activeTool === "measure" && (
                    <MeasureTool
                      pageWidthPts={page.width_pts}
                      pageHeightPts={page.height_pts}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                    />
                  )}

                  {preparing &&
                    (viewerMode !== "page" || showHeatmap) && (
                      <div style={preparingOverlayStyle}>
                        Rasterising page &amp; computing CMYK…
                      </div>
                    )}
                </div>
              </div>
            )}
          </section>
        </div>

        <footer style={footerStyle(tokens)}>
          <span>{brand} &middot; AGPL-3.0</span>
          {footer}
        </footer>
      </div>
    );
  }
}
