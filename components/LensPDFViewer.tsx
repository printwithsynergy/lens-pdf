"use client";

import type { ReactNode } from "react";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPdfJsFallback } from "../fallback-pdfjs";
import { ViewerHostContext, ViewerServicesContext } from "../host";
import type { PdfFallbackAdapter, ThemeTokens, ViewerServices } from "../plugin/services";
import { defaultThemeTokens } from "../plugin/services";
import type { PageInfo } from "../types";
import { ColorPickerTool } from "./ColorPickerTool";
import { LayerPanel } from "./LayerPanel";
import { MeasureTool } from "./MeasureTool";
import { PageCanvas } from "./PageCanvas";
import { ZoomControls } from "./ZoomControls";

/**
 * Default tool ids supported by the bundled toolbar. Hosts that want
 * a different set pass `tools={...}`; hosts that want a totally
 * different toolbar shouldn't use `<LensPDFViewer>` and should
 * compose the lower-level components themselves.
 *
 * @public
 */
export type LensPDFViewerTool = "zoom" | "color-picker" | "measure" | "layers";

/**
 * Props for the default {@link LensPDFViewer} composition.
 *
 * @public
 */
/**
 * Viewer state exposed to slot render props.
 *
 * @public
 */
export interface LensPDFViewerState {
  zoom: number;
  setZoom: (z: number) => void;
  currentPage: number;
  setCurrentPage: (n: number) => void;
  pageCount: number | null;
  activeTool: "none" | "color-picker" | "measure";
  setActiveTool: (t: "none" | "color-picker" | "measure") => void;
  enabledLayers: Set<number>;
  toggleLayer: (ocgIndex: number) => void;
  setAllLayers: (enabled: boolean) => void;
  hasLayers: boolean;
  layersOpen: boolean;
  setLayersOpen: (v: boolean) => void;
}

export interface LensPDFViewerProps {
  /** PDF URL the viewer fetches. Sign / scope upstream. */
  pdfUrl: string;
  /** Optional override for the pdf.js worker URL. */
  workerSrc?: string;
  /** Optional services to override the pdf.js fallback path. */
  services?: ViewerServices;
  /** Optional theme tokens. */
  tokens?: ThemeTokens;
  /** Optional className hook for hosts that want to restyle the chrome. */
  className?: string;
  /** Page rendering mode. */
  mode?: "scroll" | "single";
  /** Tools shown in the toolbar / mobile drawer. */
  tools?: ReadonlyArray<LensPDFViewerTool>;
  /** Initial zoom percentage. Default `100`. */
  initialZoom?: number;
  /** Optional brand label rendered in the top-left of the toolbar. */
  brand?: string;
  /**
   * Render prop for a custom header. When provided, replaces the
   * default toolbar. Receives viewer state for building controls.
   */
  header?: (state: LensPDFViewerState) => ReactNode;
  /**
   * Render prop for a custom sidebar. When provided, replaces the
   * default layer panel sidebar.
   */
  sidebar?: (state: LensPDFViewerState) => ReactNode;
  /** Static footer content rendered below the viewer stage. */
  footer?: ReactNode;
}

const DEFAULT_TOOLS: ReadonlyArray<LensPDFViewerTool> = [
  "zoom",
  "layers",
  "color-picker",
  "measure",
];

const MOBILE_BREAKPOINT_PX = 768;

/**
 * One-line responsive PDF viewer.
 *
 * ```tsx
 * <LensPDFViewer pdfUrl="https://example.com/file.pdf" />
 * ```
 *
 * @public
 */
export function LensPDFViewer(props: LensPDFViewerProps) {
  const {
    pdfUrl,
    workerSrc,
    services,
    tokens = defaultThemeTokens,
    className,
    mode = "scroll",
    tools = DEFAULT_TOOLS,
    initialZoom = 100,
    brand,
  } = props;

  const fallback = useMemo<PdfFallbackAdapter>(
    () => createPdfJsFallback({ pdfUrl, workerSrc }),
    [pdfUrl, workerSrc],
  );

  const [pageCount, setPageCount] = useState<number | null>(null);
  const [pageDimsByNum, setPageDimsByNum] = useState<
    Map<number, { widthPts: number; heightPts: number }>
  >(new Map());
  const [zoom, setZoom] = useState(initialZoom);
  const [enabledLayers, setEnabledLayers] = useState<Set<number>>(new Set());
  const [layersDiscovered, setLayersDiscovered] = useState(false);
  const [hasLayers, setHasLayers] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTool, setActiveTool] = useState<"none" | "color-picker" | "measure">("none");
  const [layersOpen, setLayersOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMobile = useMediaQueryMaxWidth(MOBILE_BREAKPOINT_PX - 1);

  useEffect(() => {
    let cancelled = false;
    fallback
      .getPageCount()
      .then((n) => {
        if (!cancelled) setPageCount(n);
      })
      .catch((err: Error) => {
        if (!cancelled) setErrorMessage(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  useEffect(() => {
    let cancelled = false;
    fallback.listLayers().then((layers) => {
      if (cancelled) return;
      setHasLayers(layers.length > 0);
      setEnabledLayers(new Set(layers.filter((l) => l.default_on).map((l) => l.ocg_index)));
      setLayersDiscovered(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  const showLayersControl = layersDiscovered && hasLayers && tools.includes("layers");
  const showColorPicker = tools.includes("color-picker");
  const showMeasure = tools.includes("measure");
  const showZoom = tools.includes("zoom");

  const onToggleLayer = useCallback((ocgIndex: number) => {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (next.has(ocgIndex)) next.delete(ocgIndex);
      else next.add(ocgIndex);
      return next;
    });
  }, []);

  const onSetAllLayers = useCallback(
    (enabled: boolean) => {
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

  const hostValue = useMemo(
    () => ({
      apiBase: "",
      jobApiBase: "",
      readOnly: true,
      pdfUrl,
      pdfFallback: fallback,
    }),
    [pdfUrl, fallback],
  );

  const accent = tokens.accent;

  const stage = (
    <Stage
      mode={mode}
      pageCount={pageCount}
      pageDimsByNum={pageDimsByNum}
      setPageDimsByNum={setPageDimsByNum}
      fallback={fallback}
      zoom={zoom}
      currentPage={currentPage}
      onCurrentPageChange={setCurrentPage}
      activeTool={activeTool}
      errorMessage={errorMessage}
    />
  );

  const layersBody = showLayersControl ? (
    <LayerPanel
      jobId="lens-pdf-viewer"
      enabledLayers={enabledLayers}
      onToggleLayer={onToggleLayer}
      onSetAllLayers={onSetAllLayers}
    />
  ) : null;

  // Selecting a tool from the mobile drawer should close the drawer
  // so the page is visible to actually use the tool.
  const handleToolPick = useCallback((next: "color-picker" | "measure") => {
    setActiveTool((t) => (t === next ? "none" : next));
    setMenuOpen(false);
  }, []);

  const handleLayersPick = useCallback(() => {
    setLayersOpen((v) => !v);
    setMenuOpen(false);
  }, []);

  // Desktop toolbar — show all tools inline.
  const desktopToolbarRight = (
    <div className="flex items-center gap-1.5">
      {showZoom && <ZoomControls zoom={zoom} onZoomChange={setZoom} compact dark />}
      {showColorPicker && (
        <ToolButton
          label="Color"
          active={activeTool === "color-picker"}
          accent={accent}
          onClick={() => setActiveTool((t) => (t === "color-picker" ? "none" : "color-picker"))}
        />
      )}
      {showMeasure && (
        <ToolButton
          label="Measure"
          active={activeTool === "measure"}
          accent={accent}
          onClick={() => setActiveTool((t) => (t === "measure" ? "none" : "measure"))}
        />
      )}
      {showLayersControl && (
        <ToolButton
          label="Layers"
          active={layersOpen}
          accent={accent}
          onClick={() => setLayersOpen((v) => !v)}
        />
      )}
    </div>
  );

  // Mobile toolbar — ZoomControls live on the right; the hamburger
  // moved to the header's left cluster (beside the brand) so it sits
  // next to the host logo where users expect a primary menu trigger.
  const mobileToolbarRight = (
    <div className="flex items-center gap-1.5">
      {showZoom && <ZoomControls zoom={zoom} onZoomChange={setZoom} compact dark />}
    </div>
  );

  // Reusable hamburger trigger. Rendered in the header's left cluster
  // on mobile so the menu lives at top-left, beside the brand/logo —
  // mirrors the iOS / Material pattern of "primary action top-left".
  const mobileMenuTrigger = isMobile ? (
    <button
      type="button"
      onClick={() => setMenuOpen(true)}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-slate-300 hover:bg-slate-800 hover:text-white"
      aria-label="Open tools menu"
    >
      <svg
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  ) : null;

  const headerLeft = (
    <div className="flex min-w-0 items-center gap-3">
      {mobileMenuTrigger}
      {brand !== undefined && (
        <span className="truncate text-sm font-bold text-white">{brand}</span>
      )}
      {mode === "single" && pageCount !== null && (
        <PageNav page={currentPage} total={pageCount} onChange={setCurrentPage} />
      )}
    </div>
  );

  const content = (
    <div
      className={`flex h-full min-h-[480px] flex-col bg-slate-900 text-slate-100 ${className ?? ""}`}
    >
      {/* Toolbar */}
      <header className="flex h-12 flex-shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] bg-slate-900 px-3">
        {headerLeft}
        {isMobile ? mobileToolbarRight : desktopToolbarRight}
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Desktop layers panel */}
        {!isMobile && layersOpen && layersBody && (
          <aside className="w-[260px] flex-shrink-0 overflow-y-auto border-r border-white/[0.06] bg-slate-900">
            {layersBody}
          </aside>
        )}
        <main className="min-h-0 flex-1 bg-slate-800">{stage}</main>
      </div>

      {/* Mobile tools drawer (hamburger) */}
      {isMobile && menuOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-300"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[60] flex w-[280px] flex-col bg-slate-900 shadow-xl">
            <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
              <span className="text-sm font-bold text-white">{brand ?? "Tools"}</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close menu"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-1 flex-col overflow-y-auto py-2">
              {(showColorPicker || showMeasure) && (
                <DrawerSection title="Tools">
                  {showColorPicker && (
                    <DrawerItem
                      label="Color picker"
                      icon={<ColorPickerIcon />}
                      active={activeTool === "color-picker"}
                      onClick={() => handleToolPick("color-picker")}
                    />
                  )}
                  {showMeasure && (
                    <DrawerItem
                      label="Measure"
                      icon={<RulerIcon />}
                      active={activeTool === "measure"}
                      onClick={() => handleToolPick("measure")}
                    />
                  )}
                </DrawerSection>
              )}
              {showLayersControl && (
                <DrawerSection title="View">
                  <DrawerItem
                    label="Layers"
                    icon={<LayersIcon />}
                    active={layersOpen}
                    onClick={handleLayersPick}
                  />
                </DrawerSection>
              )}
            </div>
          </div>
        </>
      )}

      {/* Mobile layers drawer (separate from the tools drawer so layers
          can stay open while the user interacts with the page) */}
      {isMobile && layersOpen && layersBody && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-300"
            onClick={() => setLayersOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-[60] flex w-[280px] flex-col bg-slate-900 shadow-xl">
            <div className="flex h-12 flex-shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
              <span className="text-sm font-bold text-white">Layers</span>
              <button
                type="button"
                onClick={() => setLayersOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Close layers"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{layersBody}</div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <ViewerHostContext.Provider value={hostValue}>
      {services ? (
        <ViewerServicesContext.Provider value={services}>{content}</ViewerServicesContext.Provider>
      ) : (
        content
      )}
    </ViewerHostContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Stage
// ---------------------------------------------------------------------------

interface StageProps {
  mode: "scroll" | "single";
  pageCount: number | null;
  pageDimsByNum: Map<number, { widthPts: number; heightPts: number }>;
  setPageDimsByNum: React.Dispatch<
    React.SetStateAction<Map<number, { widthPts: number; heightPts: number }>>
  >;
  fallback: PdfFallbackAdapter;
  zoom: number;
  currentPage: number;
  onCurrentPageChange: (n: number) => void;
  activeTool: "none" | "color-picker" | "measure";
  errorMessage: string | null;
}

function Stage({
  mode,
  pageCount,
  pageDimsByNum,
  setPageDimsByNum,
  fallback,
  zoom,
  currentPage,
  onCurrentPageChange,
  activeTool,
  errorMessage,
}: StageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (errorMessage) {
    return <div className="p-6 text-sm text-red-400">Failed to load PDF: {errorMessage}</div>;
  }

  if (pageCount === null) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        <svg className="mr-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        Loading PDF…
      </div>
    );
  }

  const pages =
    mode === "single" ? [currentPage] : Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div ref={containerRef} className="h-full overflow-auto p-4">
      <div className="flex flex-col items-center gap-4">
        {pages.map((pageNum) => (
          <PageSlot
            key={pageNum}
            pageNum={pageNum}
            dims={pageDimsByNum.get(pageNum) ?? null}
            onDimsResolved={(dims) =>
              setPageDimsByNum((prev) => {
                if (prev.get(pageNum)) return prev;
                const next = new Map(prev);
                next.set(pageNum, dims);
                return next;
              })
            }
            fallback={fallback}
            zoom={zoom}
            activeTool={activeTool}
            onVisible={() => {
              if (mode === "scroll") onCurrentPageChange(pageNum);
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PageSlot
// ---------------------------------------------------------------------------

interface PageSlotProps {
  pageNum: number;
  dims: { widthPts: number; heightPts: number } | null;
  onDimsResolved: (dims: { widthPts: number; heightPts: number }) => void;
  fallback: PdfFallbackAdapter;
  zoom: number;
  activeTool: "none" | "color-picker" | "measure";
  onVisible?: () => void;
}

function PageSlot({
  pageNum,
  dims,
  onDimsResolved,
  fallback,
  zoom,
  activeTool,
  onVisible,
}: PageSlotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [resolvedDims, setResolvedDims] = useState(dims);

  useEffect(() => {
    if (resolvedDims) return;
    let cancelled = false;
    fallback.getPageDimensions(pageNum).then((d) => {
      if (cancelled) return;
      setResolvedDims(d);
      onDimsResolved(d);
    });
    return () => {
      cancelled = true;
    };
  }, [pageNum, fallback, resolvedDims, onDimsResolved]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            onVisible?.();
          }
        }
      },
      { rootMargin: "400px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onVisible]);

  const ptsToPx = 96 / 72;
  const scale = zoom / 100;
  const widthPts = resolvedDims?.widthPts ?? 612;
  const heightPts = resolvedDims?.heightPts ?? 792;
  const canvasWidth = Math.round(widthPts * ptsToPx * scale);
  const canvasHeight = Math.round(heightPts * ptsToPx * scale);

  const page: PageInfo = {
    page_num: pageNum,
    width_pts: widthPts,
    height_pts: heightPts,
    media_box: { x0: 0, y0: 0, x1: widthPts, y1: heightPts },
    crop_box: null,
    trim_box: null,
    bleed_box: null,
    rotation: 0,
  };

  return (
    <div
      ref={ref}
      className="relative bg-white shadow-lg"
      style={{ width: canvasWidth, height: canvasHeight }}
    >
      {visible && resolvedDims ? (
        <Fragment>
          <PageCanvas
            jobId="lens-pdf-viewer"
            page={page}
            zoom={scale}
            items={[]}
            selectedItem={null}
            onItemClick={() => {}}
            onZoomChange={undefined}
          />
          {activeTool === "color-picker" && (
            <ColorPickerTool
              jobId="lens-pdf-viewer"
              pageNum={pageNum}
              pageWidthPts={widthPts}
              pageHeightPts={heightPts}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
            />
          )}
          {activeTool === "measure" && (
            <MeasureTool
              pageWidthPts={widthPts}
              pageHeightPts={heightPts}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
            />
          )}
        </Fragment>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
          Page {pageNum}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toolbar bits
// ---------------------------------------------------------------------------

function ToolButton({
  label,
  active,
  accent,
  onClick,
}: {
  label: string;
  active: boolean;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "text-white"
          : "border-white/10 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
      }`}
      style={active ? { backgroundColor: accent, borderColor: accent } : undefined}
    >
      {label}
    </button>
  );
}

function PageNav({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-base text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Previous page"
      >
        ‹
      </button>
      <span className="text-xs tabular-nums text-slate-300">
        {page} / {total}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(total, page + 1))}
        disabled={page >= total}
        className="flex h-7 w-7 items-center justify-center rounded border border-white/10 text-base text-slate-300 hover:bg-slate-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent"
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile drawer pieces — match MobileDrawer's design language so the
// hamburger menu feels consistent with the rest of the package.
// ---------------------------------------------------------------------------

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {title}
      </div>
      <div className="px-1">{children}</div>
    </div>
  );
}

function DrawerItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
        {icon}
      </span>
      <span className={active ? "font-medium text-white" : ""}>{label}</span>
      {active && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-400" />}
    </button>
  );
}

function ColorPickerIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16.5 3.5l4 4-10 10-4 1 1-4 10-10z" />
      <path d="M12.5 7.5l4 4" />
    </svg>
  );
}

function RulerIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M2 12h20M6 8v8M10 9v6M14 8v8M18 9v6" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// useMediaQuery
// ---------------------------------------------------------------------------

function useMediaQueryMaxWidth(maxPx: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia === "undefined") {
      return;
    }
    const mq = window.matchMedia(`(max-width: ${maxPx}px)`);
    setMatches(mq.matches);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [maxPx]);
  return matches;
}
