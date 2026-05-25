"use client";

/**
 * `<LensPDF>` — the complete interactive PDF viewer.
 *
 * The production drop-in. One required prop and you have the full
 * feature surface:
 *
 * ```tsx
 * <LensPDF pdfUrl="/proofs/abc.pdf" workerSrc={pdfWorkerSrc} />
 * ```
 *
 * `<LensPDF>` is the canonical component — all viewer state, services
 * wiring, plugin slots, and rendering live here. {@link LensPDFDemo}
 * is a thin wrapper that adds the marketing chrome (URL bar,
 * drag-and-drop upload, file picker, empty state) on top of this
 * component and feeds it a `pdfUrl`.
 *
 * One mount, full feature surface. Backed by
 * `createBrowserViewerServices`, every viewer-only feature LensPDF
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
 *   - Inline CSS-in-JS lives in `LensPDFDemo.styles.ts` (shared with
 *     {@link LensPDFDemo}; this file focuses on the React tree).
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
import type { ReactNode } from "react";
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
import type { DecisionRecord, DecisionType, OverlayItem } from "../plugin/types";
import { buildFindingNumberMap } from "../plugin/findings-location";
import type { DielineResult, PageInfo } from "../types";
import { DEFAULT_DPI, pageInfoFromDimensions } from "../types";
import { isUnwired, ViewerHostContext, ViewerServicesContext } from "../host";
import {
  emptyStateStyle,
  errorStyle,
  exitFsStyle,
  footerStyle,
  headingStyle,
  layoutStyle,
  pageNavBtnStyle,
  pageNavStyle,
  preparingOverlayStyle,
  shellStyle,
  sidebarStyle,
  stageInnerStyle,
  stageStyle,
} from "./LensPDFDemo.styles";
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
import { PdfSubstrate } from "./PdfSubstrate";
import { FindingsOverlayDOM } from "./FindingsOverlayDOM";
import { SeparationCanvas } from "./SeparationCanvas";
import { TACHeatmapOverlay } from "./TACHeatmapOverlay";
import { pluginsForPreset, type LensPDFPresetKind } from "./presets";
import {
  computeFeatureAvailability,
  pluginsForSlot,
  resolveShellPlugins,
  type LensPDFShellPlugin,
  type LensMenuAction,
  type PointerTool,
  type ViewerMode,
} from "./shellPlugins";
import { LensTopBar } from "./LensTopBar";
import { LensMenuActions } from "./LensMenuActions";
import {
  fromArtworkFindings,
  fromCallasFindings,
  fromCodexFindings,
  fromCodexSummary,
  fromLintFindings,
  fromPitstopFindings,
} from "../adapters";
import type { LensPDFDataConfig } from "../adapters";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tool ids the viewer's sidebar can show. The `tools` prop accepts any
 * subset; default is every tool. Passing `[]` hides the entire tool
 * column, giving consumers a "viewer only" mount.
 *
 * @public
 */
export type LensPDFTool =
  | "color-picker"
  | "densitometer"
  | "measure"
  | "annotate"
  | "tac-heatmap"
  | "separations"
  | "layers";

const DEFAULT_TOOLS: ReadonlyArray<LensPDFTool> = [
  "color-picker",
  "densitometer",
  "measure",
  "annotate",
  "tac-heatmap",
  "separations",
  "layers",
];

/**
 * Props for {@link LensPDF}.
 *
 * @public
 */
export interface LensPDFProps {
  /**
   * URL of the PDF to load. Any URL the browser can fetch — your own
   * CDN, a signed link, a `blob:` URL from a `File` your app uploaded.
   * Changing this swaps the document and resets to `initialPage`.
   */
  pdfUrl: string;
  /** Theme tokens. Defaults to {@link darkThemeTokens}. */
  tokens?: Partial<ThemeTokens>;
  /** Brand label shown in the viewer top bar + footer. Default: "LensPDF". */
  brand?: string;
  /**
   * Brand logo URL. Rendered to the left of the brand label in the
   * built-in top bar (see `showTopBar`).
   */
  brandLogoUrl?: string;
  /**
   * Host-injected action buttons shown inside the tools menu
   * (hamburger drawer on mobile, persistent sidebar on desktop),
   * pinned above the plugin panels. Use this for "Download",
   * "Back to demo", deep-links etc. without authoring a shell
   * plugin. Each action renders as a token-styled anchor or
   * button. See {@link LensMenuAction}.
   */
  menuActions?: ReadonlyArray<LensMenuAction>;
  /**
   * When `false`, suppresses the built-in top bar. Hosts that already
   * render their own chrome around `<LensPDF>` should pass `false`.
   * Default: `true`.
   */
  showTopBar?: boolean;
  /** Optional className on the outermost div. */
  className?: string;
  /** Tools to show in the sidebar. Default: every tool. */
  tools?: ReadonlyArray<LensPDFTool>;
  /** Initial zoom percentage. Default: 80. */
  initialZoom?: number;
  /** TAC limit for the heatmap + densitometer. Default: 300. */
  tacLimit?: number;
  /** Override pdf.js worker URL (unpkg by default). */
  workerSrc?: string;
  /**
   * Pre-built services. When provided, Lens uses them where wired and
   * automatically falls back to in-browser RGB/pdf.js services for any
   * unwired capability. This keeps LintPDF/backends optional.
   */
  services?: ViewerServices;
  /** Optional footer content below the viewer. */
  footer?: ReactNode;
  /** When true, renders full-viewport with fixed positioning. */
  fullscreen?: boolean;
  /** Initial page number (1-indexed). Default: 1. */
  initialPage?: number;
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
  preset?: LensPDFPresetKind;
  /**
   * Additional shell plugins (or replacements) for panels and toolbar
   * slots. Use `replaces` on your plugin to override a built-in one.
   */
  plugins?: ReadonlyArray<LensPDFShellPlugin>;
  /**
   * Zero-glue data config. Pass raw engine outputs here — lens maps
   * them internally. Findings from all sources are shown together in
   * the Inspection panel; dieline and spot palette from codex fill in
   * as defaults when the explicit `dieline` / `spotPalette` props are
   * absent.
   *
   * Supported engines: codex (`codexSummary` + `codexFindings`),
   * lint-pdf (`lintFindings`), callas (`callasFindings`), PitStop
   * (`pitstopFindings`).
   */
  dataConfig?: LensPDFDataConfig;
  /**
   * Active decisions keyed by finding id. Populate from
   * ``GET /api/v1/jobs/{id}/decisions`` and re-pass after each
   * record / revoke. The sidebar shows approval badges and the
   * canvas dims approved / waived findings to 25% opacity.
   *
   * @public
   */
  decisions?: Record<string, DecisionRecord>;
  /**
   * Fires when the user clicks Approve / Waive / Reject / Suppress on a
   * finding in the sidebar. The host should call the lint-pdf decisions
   * API and refresh the ``decisions`` prop.
   *
   * @public
   */
  onDecide?: (item: OverlayItem, type: DecisionType, notes?: string) => void;
  /**
   * Optional codex client. When provided, `<LensPDFDemo>` fires
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

const FLATTENED_LAYER_INDEX = -1;
// PTS_TO_PX must match PageCanvas's internal pts-to-pixel conversion
// (which is `DEFAULT_DPI / 72`). Using a different ratio here makes
// the canvas-area parent div size disagree with PageCanvas's rendered
// page, so absolute-positioned overlays (TAC heatmap, separations,
// layers, annotations, dieline) shift relative to the page content.
const PTS_TO_PX = DEFAULT_DPI / 72;
const DEFAULT_PAGE: PageInfo = pageInfoFromDimensions(1, 612, 792);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

/**
 * The complete interactive LensPDF viewer — sidebar controls, theming,
 * optional fullscreen mode. All viewer-only features (color picker,
 * densitometer, measure, separations, TAC heatmap, layers, annotations)
 * are wired out of the box. Pass a `pdfUrl` and you have a viewer.
 *
 * @public
 */
export function LensPDF({
  pdfUrl,
  tokens: tokenOverrides,
  brand,
  brandLogoUrl,
  menuActions,
  showTopBar = true,
  className,
  tools = DEFAULT_TOOLS,
  initialZoom = 80,
  tacLimit = 300,
  workerSrc,
  services: serviceOverrides,
  footer,
  fullscreen: initialFullscreen = false,
  initialPage = 1,
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
  dataConfig,
  decisions,
  onDecide,
}: LensPDFProps) {
  // Spelling toggle state — lives here so both canvas and sidebar stay in sync
  const [spellingHidden, setSpellingHidden] = useState(false);
  // Resolve dataConfig into derived items, dieline, and spot palette.
  // Explicit props win over dataConfig-derived values.
  const dataConfigResolved = useMemo(() => {
    if (!dataConfig) {
      return {
        items: [] as OverlayItem[],
        dieline: null as DielineResult | null,
        spotPalette: undefined as Record<string, string> | undefined,
      };
    }
    const derived: OverlayItem[] = [];
    if (dataConfig.codexFindings?.length)
      derived.push(...fromCodexFindings(dataConfig.codexFindings));
    if (dataConfig.lintFindings?.length)
      derived.push(...fromLintFindings(dataConfig.lintFindings));
    if (dataConfig.callasFindings?.length)
      derived.push(...fromCallasFindings(dataConfig.callasFindings));
    if (dataConfig.pitstopFindings?.length)
      derived.push(...fromPitstopFindings(dataConfig.pitstopFindings));
    if (dataConfig.artworkFindings?.length)
      derived.push(...fromArtworkFindings(dataConfig.artworkFindings));
    const { dieline: derivedDieline, spotPalette: derivedSpot } =
      dataConfig.codexSummary
        ? fromCodexSummary(dataConfig.codexSummary)
        : { dieline: null, spotPalette: undefined };
    return {
      items: derived,
      dieline: derivedDieline,
      spotPalette: derivedSpot,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataConfig]);

  // Merge dataConfig-derived items with explicit items prop (both shown).
  // Explicit dieline / spotPalette props win over dataConfig-derived values.
  const overlayItems = useMemo<readonly OverlayItem[]>(
    () => [...dataConfigResolved.items, ...(items ?? [])],
    [items, dataConfigResolved],
  );
  const effectiveDieline =
    dieline !== undefined ? dieline : dataConfigResolved.dieline;
  const effectiveSpotPalette = spotPalette ?? dataConfigResolved.spotPalette;
  const findingNumbers = useMemo(
    () => buildFindingNumberMap(overlayItems),
    [overlayItems],
  );

  // When spelling is toggled off, filter squiggles from the canvas too.
  const canvasItems = useMemo(
    () =>
      spellingHidden
        ? overlayItems.filter((it) => it.type !== "spell_check")
        : overlayItems,
    [overlayItems, spellingHidden],
  );
  // Selection: controlled when onItemSelect is supplied, uncontrolled otherwise.
  const [internalSelected, setInternalSelected] =
    useState<OverlayItem | null>(null);
  const effectiveSelected =
    onItemSelect !== undefined ? (selectedItem ?? null) : internalSelected;
  const handleItemClick = useCallback(
    (item: OverlayItem | null) => {
      if (onItemSelect) onItemSelect(item);
      else setInternalSelected(item);
    },
    [onItemSelect],
  );
  // The selection→currentPage jump effect lives further down, right
  // after `pageCount` / `currentPage` state is declared, so the
  // clamp against pageCount stays in scope. See `selectionPageJump`.
  // Pending note target: set by handleFindingNoteRequest, cleared by the Notes panel.
  // The setter callbacks are defined after selectedAnnotationId state (see below).
  const [pendingNoteTarget, setPendingNoteTarget] = useState<string | null>(null);
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
  const effectiveBrand = brand ?? tokens.logoText ?? "LensPDF";

  // -----------------------------------------------------------------------
  // Responsive layout
  // -----------------------------------------------------------------------
  // On mobile the tools sidebar collapses into a slide-in drawer
  // anchored to the left edge; the densitometer / color-picker
  // readouts switch to bottom sheets via `useIsMobile()` inside those
  // components. Desktop keeps the persistent sidebar.
  const isMobile = useIsMobile();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // -----------------------------------------------------------------------
  // PDF state
  // -----------------------------------------------------------------------
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(initialFullscreen);

  // `pdfUrl` is a controlled prop — when it changes, swap the loaded PDF,
  // reset to page 1, and return to the Page canvas. The services effect
  // (keyed on `pdfUrl`) rebuilds the viewer pipeline; this effect owns the
  // page + viewer-mode reset.
  useEffect(() => {
    if (pdfUrl) {
      setCurrentPage(initialPage);
      setViewerMode("page");
    }
    // initialPage intentionally read once via closure; the reset
    // belongs to URL change only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfUrl]);

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

  // Jump to the finding's page when selection changes (sidebar click
  // or controlled prop update). Clamps against pageCount so an
  // out-of-range `item.page` — e.g. a lint adapter whose page
  // indexing drifted past the document end — cannot push currentPage
  // past the document. pdfjs rejects `doc.getPage(n > total)` with
  // `Error: Invalid page request.`, which surfaces as the LensPDF
  // error banner; this clamp is the viewer's guarantee that no
  // adapter output can drive that path.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (effectiveSelected?.page == null) return;
    const target = Math.min(
      Math.max(1, pageCount),
      Math.max(1, effectiveSelected.page),
    );
    if (target !== currentPage) setCurrentPage(target);
  }, [effectiveSelected, pageCount]);

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
  const [showDieline, setShowDieline] = useState(false);
  const [showFindings, setShowFindings] = useState(false);
  // Per-finding visibility toggle state. The Inspection panel writes
  // here; canvasItems are filtered against this set before they reach
  // PageCanvas, so unchecked findings disappear from the canvas while
  // staying in the panel list (greyed) for re-enable.
  const [hiddenFindings, setHiddenFindings] = useState<Set<string>>(new Set());

  // Rendered page dimensions reported back by the react-pdf substrate
  // after the page has actually painted. Drives overlay positioning
  // (BoxOverlay, DielineOverlay, FindingsOverlayDOM) so they sit
  // exactly on top of the rasterized page regardless of how react-pdf
  // chose to size the canvas.
  const [substratePage, setSubstratePage] = useState<{
    width: number;
    height: number;
    widthPts: number;
    heightPts: number;
  } | null>(null);
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

  // Selects a finding, opens the Notes panel at it, and queues a blank
  // note. On mobile we also open the Tools drawer so the auto-focused
  // textarea isn't offscreen — without this, the focus event happens
  // behind the closed drawer and the user sees nothing.
  const handleFindingNoteRequest = useCallback(
    (id: string) => {
      const found = overlayItems.find((it) => it.id === id);
      if (found) handleItemClick(found);
      const noteId = `finding-${id}`;
      setSelectedAnnotationId(noteId);
      setPendingNoteTarget(noteId);
      if (isMobile) setMobileSidebarOpen(true);
    },
    [overlayItems, handleItemClick, isMobile],
  );
  const handlePendingNoteConsumed = useCallback(() => setPendingNoteTarget(null), []);

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
      console.warn("[lens-pdf] codex overlay extraction failed", err);
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
      } catch {
        // The currentPage useEffect above clamps to pageCount, so a
        // raw pdfjs `Invalid page request.` from prepare() here means
        // the document changed under us (e.g. switched mid-prepare) or
        // analysis raster generation hit a transient pdfjs error.
        // Either way, surfacing the raw pdfjs string in a red banner
        // is worse UX than silently skipping the prep — the canvas
        // useEffect below will retry on the next currentPage change.
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
      showDieline,
      setShowDieline,
      showFindings,
      setShowFindings,
      hiddenFindings,
      setHiddenFindings,
      enabledChannels,
      setEnabledChannels,
      detectedInks: detectedInks.map((ink) => ({
        name: ink.name,
        type: ink.type,
        altRgb: ink.altRgb,
      })),
      spotPalette: effectiveSpotPalette,
      items: overlayItems,
      forceInspectionPanel,
      selectedItem: effectiveSelected,
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
      findingNumbers,
      onFindingNoteRequest: handleFindingNoteRequest,
      pendingNoteTarget,
      onPendingNoteConsumed: handlePendingNoteConsumed,
      onSelectItem: handleItemClick,
      decisions,
      onDecide,
      hideSpelling: spellingHidden,
      onToggleSpelling: () => setSpellingHidden((v) => !v),
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
      showDieline,
      showFindings,
      hiddenFindings,
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
      findingNumbers,
      pendingNoteTarget,
      handleFindingNoteRequest,
      handlePendingNoteConsumed,
      handleItemClick,
      effectiveSelected,
      decisions,
      onDecide,
      spellingHidden,
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
  const topBarPlugins = useMemo(
    () => pluginsForSlot(resolvedPlugins, "topbar", shellPluginContext),
    [resolvedPlugins, shellPluginContext],
  );

  const showColorPicker = availability.colorPicker;
  const showDensitometer = availability.densitometer;
  const showMeasure = availability.measure;
  const showAnnotate = availability.annotate;
  const showSeparations = availability.separations;
  const showLayersControl = availability.layers;
  const hasAnyTool =
    leftPanelPlugins.length > 0 || (menuActions?.length ?? 0) > 0;

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
      <div className={className} style={shellStyle(tokens, fullscreen)}>
        {fullscreen && (
          <button
            type="button"
            style={exitFsStyle}
            onClick={() => setFullscreen(false)}
          >
            Exit fullscreen
          </button>
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

        {showTopBar && (
          <LensTopBar
            tokens={tokens}
            isMobile={isMobile}
            brand={brand}
            brandLogoUrl={brandLogoUrl}
            pluginNodes={topBarPlugins.map((plugin) =>
              plugin.render(shellPluginContext),
            )}
            mobileSidebarOpen={mobileSidebarOpen}
            onToggleMobileSidebar={() => setMobileSidebarOpen((v) => !v)}
          />
        )}

        <div style={{ ...layoutStyle, position: "relative" }}>
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
              {menuActions && menuActions.length > 0 && (
                <LensMenuActions tokens={tokens} actions={menuActions} />
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
                      animation: "lens-pdf-tools-spin 0.85s linear infinite",
                    }}
                  />
                  <span>Loading tools…</span>
                  <style>{`@keyframes lens-pdf-tools-spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : (
                leftPanelPlugins.map((plugin) => (
                  <div key={plugin.id}>{plugin.render(shellPluginContext)}</div>
                ))
              )}

            </aside>
          )}

          {/* Stage column — wraps the annotation toolbar + the
              scrolling canvas section. The toolbar lives OUTSIDE the
              scroll container so it stays anchored to the viewport
              (independent of canvas pan) on mobile. */}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {toolbarOverlayPlugins.length > 0 && (
              <div
                style={{
                  flexShrink: 0,
                  display: "flex",
                  justifyContent: "center",
                  zIndex: 30,
                  background: tokens.bg,
                  ...(isMobile ? { padding: "8px 8px 0" } : { padding: "8px 0 0" }),
                }}
              >
                {toolbarOverlayPlugins.map((plugin) => (
                  <div key={plugin.id}>{plugin.render(shellPluginContext)}</div>
                ))}
              </div>
            )}

          {/* Stage */}
          <section
            style={{
              ...stageStyle,
              ...(isMobile
                ? {
                    padding: "12px 8px",
                    paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                  }
                : {}),
            }}
          >
            {!pdfUrl ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0, opacity: 0.6 }}>Loading…</p>
              </div>
            ) : viewerMode === "page" || viewerMode === "findings" ? (
              // New react-pdf substrate handles primary page rendering
              // + Acrobat-grade pan / pinch / double-tap zoom natively.
              // SeparationCanvas + LayerCanvas modes still use the
              // legacy tile-fetch path below.
              <PdfSubstrate
                file={pdfUrl}
                pageNumber={currentPage}
                zoom={zoom}
                onZoomChange={setZoom}
                onPageRender={(info) =>
                  setSubstratePage({
                    width: info.width,
                    height: info.height,
                    widthPts: info.widthPts,
                    heightPts: info.heightPts,
                  })
                }
                tokens={tokens}
                panEnabled={activeTool === "none"}
                pinchEnabled={activeTool === "none"}
                overlay={
                  substratePage ? (
                    <>
                      {(viewerMode === "findings" || showBoxOverlays) && (
                        <BoxOverlay
                          page={page}
                          canvasWidth={substratePage.width}
                          canvasHeight={substratePage.height}
                          dieline={effectiveDieline ?? null}
                        />
                      )}
                      {((viewerMode === "findings" && !showBoxOverlays) ||
                        showDieline) &&
                        effectiveDieline && (
                          <DielineOverlay
                            page={page}
                            canvasWidth={substratePage.width}
                            canvasHeight={substratePage.height}
                            dieline={effectiveDieline}
                          />
                        )}
                      {services && showHeatmap && (
                        <TACHeatmapOverlay
                          jobId="lens-pdf-demo"
                          pageNum={page.page_num}
                          width={substratePage.width}
                          height={substratePage.height}
                          pageWidthPts={substratePage.widthPts}
                          pageHeightPts={substratePage.heightPts}
                          tacLimit={tacLimit}
                        />
                      )}
                      {(viewerMode === "findings" || showFindings) && (
                        <FindingsOverlayDOM
                          pageWidthPx={substratePage.width}
                          pageHeightPx={substratePage.height}
                          pageWidthPts={substratePage.widthPts}
                          pageHeightPts={substratePage.heightPts}
                          items={canvasItems.filter(
                            (it) =>
                              !hiddenFindings.has(it.id) &&
                              it.page === page.page_num,
                          )}
                          selectedItem={effectiveSelected}
                          onItemClick={handleItemClick}
                          findingNumbers={findingNumbers}
                          decisions={decisions}
                          tokens={tokens}
                        />
                      )}
                    </>
                  ) : undefined
                }
              />
            ) : (
              <div style={stageInnerStyle}>
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
                      jobId="lens-pdf-demo"
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
                      jobId="lens-pdf-demo"
                      pageNum={page.page_num}
                      enabledLayers={enabledLayers}
                      allLayers={allLayerIndices}
                      width={canvasW}
                      height={canvasH}
                    />
                  ) : (
                    <PageCanvas
                      jobId="lens-pdf-demo"
                      page={page}
                      zoom={zoom}
                      // Only feed PageCanvas the finding overlays when
                      // the user is on the Inspection tab or has
                      // explicitly flipped the Findings toggle. Page
                      // view defaults to a clean read. `hiddenFindings`
                      // further filters out items the user has toggled
                      // off via the per-row eye button in the panel.
                      items={
                        showFindings
                          ? canvasItems.filter(
                              (it) => !hiddenFindings.has(it.id),
                            )
                          : []
                      }
                      selectedItem={effectiveSelected}
                      onItemClick={handleItemClick}
                      onFindingNoteRequest={handleFindingNoteRequest}
                      cropToTrim={cropToTrim}
                      findingNumbers={findingNumbers}
                      decisions={decisions}
                    />
                  )}

                  {/* Trim / Bleed / Crop boxes — require explicit
                      showBoxOverlays toggle in legacy sep/layer
                      modes. The new react-pdf substrate handles its
                      own gating in the page/findings branch above. */}
                  {showBoxOverlays && (
                    <BoxOverlay
                      page={page}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                      dieline={effectiveDieline ?? null}
                    />
                  )}
                  {/* Dieline region size chips — explicit showDieline
                      toggle in legacy sep/layer modes. */}
                  {showDieline && effectiveDieline && (
                      <DielineOverlay
                        page={page}
                        canvasWidth={canvasW}
                        canvasHeight={canvasH}
                        dieline={effectiveDieline}
                      />
                    )}

                  {services && showHeatmap && (
                    <TACHeatmapOverlay
                      jobId="lens-pdf-demo"
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
                        jobId="lens-pdf-demo"
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
                      jobId="lens-pdf-demo"
                      pageNum={page.page_num}
                      pageWidthPts={page.width_pts}
                      pageHeightPts={page.height_pts}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                    />
                  )}
                  {activeTool === "densitometer" && (
                    <DensitometerTool
                      jobId="lens-pdf-demo"
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

                  {preparing && (
                      <div style={preparingOverlayStyle}>
                        Rasterising page &amp; computing CMYK…
                      </div>
                    )}
                </div>
              </div>
            )}
          </section>
          </div>
        </div>

        <footer style={footerStyle(tokens)}>
          <span>{effectiveBrand} &middot; AGPL-3.0</span>
          {footer}
        </footer>
      </div>
    );
  }
}

