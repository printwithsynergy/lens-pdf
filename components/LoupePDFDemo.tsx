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
 *   - Color picker (RGB + CMYK + every detected spot ink + TAC)
 *   - Densitometer (CMYK + every detected spot ink + TAC limit)
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  createBrowserViewerServices,
  useBrowserViewerServicesVersion,
  createCodexOverlayServices,
  extractInksFromColorWorld,
  extractLayersFromOcgs,
  PROCESS_CHANNELS,
  type BrowserViewerServices,
  type DetectedInk,
  type MinimalCodexClient,
  type CodexOverlayServices,
} from "../browser";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import { darkThemeTokens } from "../plugin/services";
import type { OverlayItem } from "../plugin/types";
import type { DielineResult, PageInfo } from "../types";
import { DEFAULT_DPI, pageInfoFromDimensions } from "../types";
import { isUnwired, ViewerHostContext, ViewerServicesContext } from "../host";
import { validatePdfFile, validatePdfUrl } from "../host/pdfValidation";
import {
  brandStyle,
  btnStyle,
  dropOverlayStyle,
  emptyStateStyle,
  errorStyle,
  exitFsStyle,
  footerStyle,
  ghostBtnStyle,
  headingStyle,
  layoutStyle,
  pageNavBtnStyle,
  pageNavStyle,
  preparingOverlayStyle,
  shellStyle,
  sidebarStyle,
  stageInnerStyle,
  stageStyle,
  topbarStyle,
  urlBarStyle,
  urlInputStyle,
} from "./LoupePDFDemo.styles";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { useIsMobile } from "./useIsMobile";
import type { AnnotationTool } from "./AnnotationToolbar";
import { BoxOverlay } from "./BoxOverlay";
import { ColorPickerTool } from "./ColorPickerTool";
import { DensitometerTool } from "./DensitometerTool";
import { DielineOverlay } from "./DielineOverlay";
import { LayerCanvas } from "./LayerCanvas";
import { MeasureTool } from "./MeasureTool";
import { PageCanvas } from "./PageCanvas";
import { SeparationCanvas } from "./SeparationCanvas";
import { TACHeatmapOverlay } from "./TACHeatmapOverlay";
import { pluginsForPreset, type LoupePDFPresetKind } from "./presets";
import {
  computeFeatureAvailability,
  pluginsForSlot,
  resolveShellPlugins,
  type LoupePDFShellPlugin,
  type PointerTool,
  type ViewerMode,
} from "./shellPlugins";

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
   * Pre-built services. When provided, Loupe uses them where wired and
   * automatically falls back to in-browser RGB/pdf.js services for any
   * unwired capability. This keeps LintPDF/backends optional.
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
  /**
   * Force the Inspection / Findings side-panel slot visible even when
   * ``items`` is empty. Renders an empty "no findings yet" state so
   * the slot stays in the layout. Defaults to ``false`` — hosts
   * without preflight data don't see a placeholder panel.
   *
   * Useful for:
   * - Demos that want the panel discoverable from the first frame.
   * - Hosts with an in-flight preflight call (stable layout while it
   *   loads).
   * - Adapters where the user explicitly toggles preflight on/off in
   *   the UI and you want to keep the slot mounted across that toggle.
   */
  forceInspectionPanel?: boolean;
  /**
   * Spot-color palette keyed by spot name (case insensitive). Wins
   * over the Pantone Gold library + the PDF's ``altRgb`` fallback in
   * the separations panel swatch render. Hosts that have richer
   * sources of truth (codex's ``summary.spot_colors.colors[].swatch_hex``,
   * a callas / PitStop / Acrobat preflight report, an internal
   * swatch DB) pass values here.
   *
   * Example: ``{ "PANTONE 225 C": "#c6168d", "PANTONE 236 C": "#da1884" }``.
   */
  spotPalette?: Record<string, string>;
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
  /** First-party plugin preset used as the base composition. */
  preset?: LoupePDFPresetKind;
  /**
   * Additional shell plugins (or replacements) for panels and toolbar
   * slots. Use `replaces` on your plugin to override a built-in one.
   */
  plugins?: ReadonlyArray<LoupePDFShellPlugin>;
  /**
   * Optional codex client. When provided, `<LoupePDFDemo>` fires
   * `extractStream` in the background after each PDF loads. As codex
   * events arrive the viewer silently upgrades:
   *
   * - `colorWorld` → separations panel shows pikepdf-accurate ink list
   *   (including spots inside compressed streams that the browser's
   *   regex parser misses).
   * - `phase2_complete` → separations, TAC heatmap, and layers switch
   *   to Ghostscript-rendered plates (higher fidelity than the
   *   pdfjs RGB-approximated versions).
   *
   * Tools remain fully active on pdfjs throughout — there is no loading
   * state or disabled period. Codex is a silent quality upgrade.
   *
   * Accepts any object satisfying {@link MinimalCodexClient} —
   * including `HttpClient` from `@printwithsynergy/codex-client`.
   */
  codex?: MinimalCodexClient;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const FLATTENED_LAYER_INDEX = -1;
// PTS_TO_PX must match PageCanvas's internal pts-to-pixel conversion
// (which is `DEFAULT_DPI / 72`). Using a different ratio here makes
// the canvas-area parent div size disagree with PageCanvas's rendered
// page, so absolute-positioned overlays (TAC heatmap, separations,
// layers, annotations, dieline) shift relative to the page content.
const PTS_TO_PX = DEFAULT_DPI / 72;
const DEFAULT_PAGE: PageInfo = pageInfoFromDimensions(1, 612, 792);

function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
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
  brand,
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
  forceInspectionPanel,
  spotPalette,
  selectedItem,
  onItemSelect,
  dieline,
  showBoxOverlays = false,
  cropToTrim = false,
  onPageChange: onPageChangeProp,
  onZoomChange: onZoomChangeProp,
  onError: onErrorProp,
  preset = "demo",
  plugins: customPlugins = [],
  codex,
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
  // Brand resolution: explicit prop > tokens.logo* > built-in default.
  // Lets a host bundle its identity (colors + logo + label) into one
  // tokens object without dropping the existing prop API.
  const effectiveBrand = brand ?? tokens.logoText ?? "LoupePDF";
  const effectiveLogoUrl = brandLogoUrl ?? tokens.logoUrl;
  const effectiveLogoMaxHeight = tokens.logoMaxHeight ?? 24;
  const effectiveLogoAlt = tokens.logoAlt;

  // -----------------------------------------------------------------------
  // Responsive layout
  // -----------------------------------------------------------------------
  // On mobile the tools sidebar collapses into a slide-in drawer
  // anchored to the left edge; the densitometer / color-picker
  // readouts switch to bottom sheets via `useIsMobile()` inside those
  // components. Desktop keeps the persistent sidebar.
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // Open when no PDF pre-loaded so the user sees how to load one; auto-closes
  // after a PDF is loaded so the canvas gets the space back.
  const [mobileUrlBarOpen, setMobileUrlBarOpen] = useState(!initialPdfUrl);
  /** Height of the marketing top bar (URL row). Drawer + dimmer start below it so they never cover the chrome or collide with the tools toggle. */
  const headerBarRef = useRef<HTMLElement | null>(null);
  const [headerChromePx, setHeaderChromePx] = useState(0);

  useLayoutEffect(() => {
    if (embedded) {
      setHeaderChromePx(0);
      return;
    }
    const el = headerBarRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      setHeaderChromePx(el?.offsetHeight ?? 0);
      return;
    }
    const sync = () =>
      setHeaderChromePx(Math.ceil(el.getBoundingClientRect().height));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [embedded, isMobile]);

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
  // Pen first — draws immediately. Select (second in toolbar) only
  // grabs existing annotations; defaulting to pointer felt "broken" on
  // an empty page.
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

  // -----------------------------------------------------------------------
  // Services
  // -----------------------------------------------------------------------
  const [browserServices, setBrowserServices] =
    useState<BrowserViewerServices | null>(null);
  const [codexOverlay, setCodexOverlay] = useState<CodexOverlayServices | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [toolsLoading, setToolsLoading] = useState(false);

  // Reactive: re-render every time the services notify a new tile / channel
  // / heatmap / annotation has landed. PageCanvas / SeparationCanvas /
  // TACHeatmapOverlay re-read the synchronous URL builders and pick up the
  // fresh blob URL. AnnotationThread reads it as `refreshKey` so the
  // sidebar list re-fetches after AnnotationCanvas persists a drawing.
  const servicesVersion = useBrowserViewerServicesVersion(browserServices);

  // Subscribe to codex overlay notifications (blob URLs for Ghostscript renders).
  const [codexVersion, setCodexVersion] = useState(0);
  useEffect(() => {
    if (!codexOverlay) return;
    return codexOverlay.subscribe(() => setCodexVersion((v) => v + 1));
  }, [codexOverlay]);

  // Build / dispose services whenever the PDF URL changes.
  useEffect(() => {
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

  // Codex background extraction — fires extractStream in parallel with pdfjs.
  // As SSE events arrive the viewer silently upgrades ink list + renders.
  useEffect(() => {
    if (!pdfUrl || !codex) {
      setCodexOverlay(null);
      return;
    }
    let cancelled = false;
    let overlay: CodexOverlayServices | null = null;
    let layerData: Array<{ name: string; ocg_index: number; default_on: boolean }> = [];

    (async () => {
      const res = await fetch(pdfUrl);
      if (!res.ok || cancelled) return;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (cancelled) return;

      await codex.extractStream(bytes, {
        granular: true,
        onColorWorld: (data) => {
          if (cancelled) return;
          const inks = extractInksFromColorWorld(data);
          setDetectedInks(inks);
          setEnabledChannels(new Set(inks.map((i) => i.name)));
        },
        onOcgs: (data) => {
          if (cancelled) return;
          layerData = extractLayersFromOcgs(data);
        },
        onPhase2: (doc) => {
          if (cancelled) return;
          overlay = createCodexOverlayServices(codex, doc.pdf_sha256, tacLimit, layerData);
          setCodexOverlay(overlay);
          // Update layer indices from codex's accurate OCG list.
          if (layerData.length > 0) {
            const indices = layerData.map((l) => l.ocg_index);
            setAllLayerIndices(indices);
            setEnabledLayers(new Set(indices));
          }
        },
      });
    })().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[loupe-pdf] codex overlay extraction failed", err);
    });

    return () => {
      cancelled = true;
      if (overlay) {
        overlay.dispose();
        overlay = null;
      }
      setCodexOverlay(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl, codex, tacLimit]);

  // Resolve page count + initial layer list when services come online.
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
      } finally {
        if (!cancelled) setToolsLoading(false);
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

  const services: ViewerServices | null = useMemo(() => {
    if (!browserServices) return serviceOverrides ?? null;
    // Base: pdfjs services with optional host overrides on top.
    const base: ViewerServices = serviceOverrides
      ? {
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
        }
      : browserServices;
    // Codex overlay: swap in Ghostscript-accurate renders once available.
    // pageImages, colorSample, densitometer, annotations stay on pdfjs.
    if (codexOverlay) {
      return {
        ...base,
        separations: codexOverlay.separations,
        tacHeatmap: codexOverlay.tacHeatmap,
        layers: codexOverlay.layers,
      };
    }
    return base;
    // codexVersion + servicesVersion are intentionally in deps to force a
    // re-render when lazy blob URLs land inside the overlay or pdfjs caches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceOverrides, browserServices, codexOverlay, codexVersion, servicesVersion]);

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

  // -----------------------------------------------------------------------
  // Plugin availability + slot resolution
  // -----------------------------------------------------------------------
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
      detectedInks: detectedInks.map((ink) => ({
        name: ink.name,
        type: ink.type,
        altRgb: ink.altRgb,
      })),
      spotPalette,
      items,
      forceInspectionPanel,
      selectedItem,
      onItemSelect,
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

  const showColorPicker = availability.colorPicker;
  const showDensitometer = availability.densitometer;
  const showMeasure = availability.measure;
  const showAnnotate = availability.annotate;
  const showSeparations = availability.separations;
  const showLayersControl = availability.layers;
  const hasAnyTool = leftPanelPlugins.length > 0;

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

  // On mobile, dismiss the tools drawer automatically when the user
  // activates an interactive tool so the canvas is immediately visible.
  useEffect(() => {
    if (isMobile && activeTool !== "none") setMobileSidebarOpen(false);
  }, [activeTool, isMobile]);

  // Collapse the URL bar accordion when a PDF finishes loading on mobile.
  useEffect(() => {
    if (isMobile && pdfUrl) setMobileUrlBarOpen(false);
  }, [pdfUrl, isMobile]);

  // Match the document background to the viewer's dark bg so overscroll
  // bounce (iOS rubber-band, macOS elastic scroll) shows the same colour
  // as the viewer chrome instead of the host page's white body background.
  // Only applies in standalone (non-embedded) mode; embedded consumers own
  // their own page background.
  useEffect(() => {
    if (embedded || typeof document === "undefined") return;
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.backgroundColor;
    const prevBodyBg = body.style.backgroundColor;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    html.style.backgroundColor = tokens.bg;
    body.style.backgroundColor = tokens.bg;
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.backgroundColor = prevHtmlBg;
      body.style.backgroundColor = prevBodyBg;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overscrollBehavior = prevBodyOverscroll;
    };
  }, [embedded, tokens.bg]);

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

        {/* Top bar — hidden in embedded mode. On narrow viewports the URL
            row stacks full-width with 44px touch targets; the tools-drawer
            toggle lives in this bar so it never covers the annotation toolbar. */}
        {!embedded && (
          <header
            ref={headerBarRef}
            style={{
              ...topbarStyle,
              position: "relative",
              zIndex: 100,
              background: tokens.bg,
              borderBottom: `1px solid ${tokens.border}`,
              ...(isMobile
                ? {
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 12,
                    padding: "12px 14px",
                  }
                : {}),
            }}
          >
            {isMobile ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  {hasAnyTool && (
                    <button
                      type="button"
                      aria-label={
                        "Open tools panel"
                      }
                      aria-expanded={mobileSidebarOpen}
                      onClick={() => setMobileSidebarOpen((v) => !v)}
                      style={{
                        flexShrink: 0,
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        border: `1px solid ${tokens.border}`,
                        background: tokens.bg,
                        color: tokens.fg,
                        cursor: "pointer",
                        fontSize: 22,
                        lineHeight: 1,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                      }}
                    >
                      {"\u2630"}
                    </button>
                  )}
                  <div
                    style={{
                      ...brandStyle,
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                    }}
                  >
                    {effectiveLogoUrl && (
                      <img
                        src={effectiveLogoUrl}
                        alt={effectiveLogoAlt ?? ""}
                        aria-hidden={effectiveLogoAlt ? undefined : "true"}
                        style={{
                          height: effectiveLogoMaxHeight,
                          width: "auto",
                          maxHeight: effectiveLogoMaxHeight,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                      {effectiveBrand}
                    </span>
                    <span style={{ opacity: 0.4 }}>&middot;</span>
                    <span
                      style={{
                        opacity: 0.6,
                        fontWeight: 400,
                        fontSize: 13,
                        flexShrink: 0,
                      }}
                    >
                      demo
                    </span>
                  </div>
                  {/* Accordion toggle — icon changes with file state */}
                  <button
                    type="button"
                    aria-label={mobileUrlBarOpen ? "Close file controls" : pdfUrl ? "Change file" : "Open a PDF"}
                    aria-expanded={mobileUrlBarOpen}
                    onClick={() => setMobileUrlBarOpen((v) => !v)}
                    style={{
                      flexShrink: 0,
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: `1px solid ${(pdfUrl || preparing) ? tokens.accent : tokens.border}`,
                      background: (pdfUrl || preparing) ? `${tokens.accent}22` : "transparent",
                      color: (pdfUrl || preparing) ? tokens.accent : tokens.fg,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: mobileUrlBarOpen ? 0.6 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {preparing ? (
                      // Spinner
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden>
                        <circle cx={8} cy={8} r={6} stroke="currentColor" strokeWidth={2} strokeOpacity={0.25} />
                        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                          style={{ transformOrigin: "8px 8px", animation: "loupe-pdf-tools-spin 0.7s linear infinite" }} />
                      </svg>
                    ) : pdfUrl ? (
                      // Filled document — file is loaded
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                        <path d="M4 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.414A1 1 0 0 0 12.707 6L9 2.293A1 1 0 0 0 8.586 2H4zm4 .5V6a1 1 0 0 0 1 1h3.5L8 2.5z" />
                      </svg>
                    ) : (
                      // Outline folder — nothing loaded yet
                      <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
                        <path d="M2 5a1 1 0 0 1 1-1h3.586a1 1 0 0 1 .707.293L8.414 5.4A1 1 0 0 0 9.121 5.7H13a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5z" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>
                {/* Collapsible URL / upload form */}
                <div
                  style={{
                    overflow: "hidden",
                    maxHeight: mobileUrlBarOpen ? 300 : 0,
                    transition: "max-height 0.22s ease",
                  }}
                >
                  <form
                    onSubmit={loadUrl}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      width: "100%",
                      paddingTop: 2,
                      paddingBottom: 2,
                    }}
                  >
                    <input
                      type="text"
                      inputMode="url"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      placeholder="Paste PDF URL (https://…)"
                      value={draftUrl}
                      onChange={(e) => setDraftUrl(e.target.value)}
                      style={{
                        ...urlInputStyle(tokens),
                        width: "100%",
                        boxSizing: "border-box",
                        minHeight: 44,
                        fontSize: 16,
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: 10,
                        width: "100%",
                      }}
                    >
                      <button
                        type="submit"
                        disabled={!/^https?:\/\//i.test(draftUrl.trim())}
                        style={{
                          ...btnStyle(tokens, !/^https?:\/\//i.test(draftUrl.trim())),
                          flex: 1,
                          minHeight: 44,
                          padding: "12px 14px",
                          fontSize: 15,
                        }}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        style={{
                          ...ghostBtnStyle(tokens),
                          flex: 1,
                          minHeight: 44,
                          padding: "12px 14px",
                          fontSize: 15,
                        }}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Upload PDF
                      </button>
                    </div>
                  </form>
                </div>
              </>
            ) : (
              <>
                <div style={brandStyle}>
                  {effectiveLogoUrl && (
                    <img
                      src={effectiveLogoUrl}
                      alt={effectiveLogoAlt ?? ""}
                      aria-hidden={effectiveLogoAlt ? undefined : "true"}
                      style={{
                        height: effectiveLogoMaxHeight,
                        width: "auto",
                        maxHeight: effectiveLogoMaxHeight,
                      }}
                    />
                  )}
                  <span>{effectiveBrand}</span>
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
                  <button
                    type="submit"
                    disabled={!/^https?:\/\//i.test(draftUrl.trim())}
                    style={btnStyle(tokens, !/^https?:\/\//i.test(draftUrl.trim()))}
                  >
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
              </>
            )}
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

        <div style={{ ...layoutStyle, position: "relative" }}>
          {/* Embedded-only: no URL header, so keep a corner FAB for the
              tools drawer. Marketing demo puts ☰ in the top bar instead
              so it never covers the annotation toolbar. */}
          {embedded && hasAnyTool && isMobile && !mobileSidebarOpen && (
            <button
              type="button"
              aria-label={
                "Open tools panel"
              }
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen((v) => !v)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                left: "auto",
                zIndex: 60,
                width: 44,
                height: 44,
                borderRadius: 8,
                border: `1px solid ${tokens.border}`,
                background: tokens.bg,
                color: tokens.fg,
                cursor: "pointer",
                fontSize: 22,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
              }}
            >
              {"\u2630"}
            </button>
          )}

          {/* Mobile drawer dimmer — sits above all chrome so the tools panel
              is never trapped behind the top bar/header layers. */}
          {hasAnyTool && isMobile && mobileSidebarOpen && (
            <div
              onClick={() => setMobileSidebarOpen(false)}
              style={{
                position: "fixed",
                left: 0,
                right: 0,
                bottom: 0,
                top: 0,
                zIndex: 140,
                background: "rgba(0, 0, 0, 0.72)",
              }}
            />
          )}

          {/* Sidebar — persistent on desktop, slide-in drawer on
              mobile. The drawer animates `transform` so it stays
              composited and doesn't re-layout the page on toggle. */}
          {hasAnyTool && (
            <aside
              style={
                isMobile
                  ? {
                      ...sidebarStyle(tokens),
                      position: "fixed",
                      top: 0,
                      left: 0,
                      bottom: 0,
                      width: "min(85vw, 320px)",
                      maxWidth: "100%",
                      zIndex: 141,
                      transform: mobileSidebarOpen
                        ? "translateX(0)"
                        : "translateX(-100%)",
                      transition: "transform 0.22s ease-out",
                      borderRight: `1px solid ${tokens.border}`,
                      boxShadow: mobileSidebarOpen
                        ? "8px 0 24px rgba(0, 0, 0, 0.45)"
                        : "none",
                      WebkitOverflowScrolling: "touch",
                      overscrollBehavior: "contain",
                      paddingTop: "max(12px, env(safe-area-inset-top))",
                      paddingBottom: "max(16px, env(safe-area-inset-bottom))",
                    }
                  : sidebarStyle(tokens)
              }
            >
              {isMobile && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    marginBottom: 8,
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                    paddingTop: 2,
                    paddingBottom: 8,
                    background: tokens.bg,
                    borderBottom: `1px solid ${tokens.border}`,
                  }}
                >
                  <h2 style={{ ...headingStyle, margin: 0 }}>Tools</h2>
                  <button
                    type="button"
                    onClick={() => setMobileSidebarOpen(false)}
                    aria-label="Close tools panel"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      border: `1px solid ${tokens.border}`,
                      background: tokens.bg,
                      color: tokens.fg,
                      cursor: "pointer",
                      fontSize: 20,
                      lineHeight: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {"\u00D7"}
                  </button>
                </div>
              )}
              <div style={pageNavStyle}>
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
              </div>
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
                    onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                    disabled={currentPage >= pageCount}
                    aria-label="Next page"
                  >
                    &rsaquo;
                  </button>
                </div>
              )}
              {toolsLoading ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 0",
                    opacity: 0.8,
                    fontSize: 12,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid rgba(255,255,255,0.2)",
                      borderTopColor: "rgba(255,255,255,0.75)",
                      animation: "loupe-pdf-tools-spin 0.85s linear infinite",
                    }}
                  />
                  <span>Loading tools…</span>
                  <style>{`@keyframes loupe-pdf-tools-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                leftPanelPlugins.map((plugin) => (
                  <div key={plugin.id}>{plugin.render(shellPluginContext)}</div>
                ))
              )}

            </aside>
          )}

          {/* Stage */}
          <section
            style={{
              ...stageStyle,
              ...(isMobile
                ? {
                    padding: "12px 8px",
                    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                    gap: 8,
                  }
                : {}),
            }}
          >
            {!pdfUrl && embedded ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0, opacity: 0.6 }}>Loading…</p>
              </div>
            ) : !pdfUrl ? (
              <div style={emptyStateStyle}>
                {effectiveLogoUrl && (
                  <img
                    src={effectiveLogoUrl}
                    alt={effectiveLogoAlt ?? ""}
                    aria-hidden={effectiveLogoAlt ? undefined : "true"}
                    style={{ height: 64, width: "auto", maxHeight: 64, opacity: 0.85 }}
                  />
                )}
                <h2 style={{ margin: 0 }}>{effectiveBrand} demo viewer</h2>
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
                <p
                  style={{
                    fontSize: 11,
                    opacity: 0.55,
                    maxWidth: 460,
                    lineHeight: 1.55,
                    margin: 0,
                  }}
                >
                  LoupePDF supports <strong>full CMYK + spot inks</strong>
                  {" "}with no approximation when a backend (Ghostscript
                  / MuPDF + ICC profiles) is wired through the
                  {" "}<code>services</code> prop — the densitometer, TAC
                  heatmap, and color picker read true plate values
                  straight from the host. The RGB-derived path is only
                  used as the fallback when no backend data is supplied,
                  which is the mode this demo runs in. Annotations live
                  in this tab only and are discarded on reload. Max
                  upload {formatMaxSize(maxFileSize)}.
                </p>
              </div>
            ) : (
              <div style={stageInnerStyle}>
                {toolbarOverlayPlugins.length > 0 && (
                  // Sticky at the top of the stage scroll container on both
                  // mobile and desktop — the toolbar stays visible while the
                  // canvas scrolls, but never escapes upward into the host
                  // page's chrome (the `fixed` variant covered marketing-site
                  // nav when the viewer was mounted in `embedded` mode).
                  <div
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 30,
                      alignSelf: "center",
                      ...(isMobile
                        ? {
                            paddingTop: 8,
                            maxWidth: "100%",
                          }
                        : {}),
                    }}
                  >
                    {toolbarOverlayPlugins.map((plugin) => (
                      <div key={plugin.id}>{plugin.render(shellPluginContext)}</div>
                    ))}
                  </div>
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
                  ) : viewerMode === "layer" &&
                    services &&
                    allLayerIndices.length > 0 &&
                    allLayerIndices.every(
                      (layerIndex) => layerIndex !== FLATTENED_LAYER_INDEX,
                    ) ? (
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
                        onHistoryChange={handleAnnotationHistoryChange}
                        onIndexedAnnotationsChange={setIndexedAnnotations}
                        selectedAnnotationNumber={
                          selectedAnnotationId?.startsWith("obj-")
                            ? Number(selectedAnnotationId.slice(4))
                            : null
                        }
                        onSelectedAnnotationNumberChange={(annotationNumber) => {
                          setSelectedAnnotationId(
                            annotationNumber != null ? `obj-${annotationNumber}` : null,
                          );
                        }}
                      />
                    </div>
                  )}
                  {showAnnotate &&
                    indexedAnnotations.map((row) => {
                      const id = `obj-${row.number}`;
                      const selected = selectedAnnotationId === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setSelectedAnnotationId(id);
                            setActiveTool("annotate");
                          }}
                          title={`Annotation #${row.number}`}
                          style={{
                            position: "absolute",
                            left: Math.max(10, row.centerX - 12),
                            top: Math.max(10, row.centerY - 12),
                            width: 24,
                            height: 24,
                            borderRadius: "50%",
                            border: selected
                              ? "2px solid rgba(251,191,36,0.98)"
                              : "1px solid rgba(255,255,255,0.82)",
                            background: selected
                              ? "rgba(251,191,36,0.95)"
                              : "rgba(15,23,42,0.9)",
                            color: selected ? "#111827" : "#f8fafc",
                            fontSize: 11,
                            fontWeight: 700,
                            lineHeight: "24px",
                            textAlign: "center",
                            cursor: "pointer",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
                            zIndex: 26,
                            padding: 0,
                          }}
                        >
                          {row.number}
                        </button>
                      );
                    })}
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
          <span>{effectiveBrand} &middot; AGPL-3.0</span>
          {footer}
        </footer>
      </div>
    );
  }
}
