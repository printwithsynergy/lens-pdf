"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties, ReactNode } from "react";
import type { PageInfo } from "../types";
import type { PdfFallbackAdapter, ThemeTokens, ViewerServices } from "../plugin/services";
import { defaultThemeTokens } from "../plugin/services";
import { ViewerHostContext, ViewerServicesContext } from "../host";
import { createPdfJsFallback } from "../fallback-pdfjs";
import { ColorPickerTool } from "./ColorPickerTool";
import { LayerPanel } from "./LayerPanel";
import { MeasureTool } from "./MeasureTool";
import { PageCanvas } from "./PageCanvas";
import { ZoomControls } from "./ZoomControls";

/**
 * Default tool ids supported by the bundled toolbar. Hosts that want
 * a different set pass `tools={...}`; hosts that want a totally
 * different toolbar shouldn't use `<LoupePDFViewer>` and should
 * compose the lower-level components themselves.
 *
 * @public
 */
export type LoupePDFViewerTool = "zoom" | "color-picker" | "measure" | "layers";

/**
 * Props for the default {@link LoupePDFViewer} composition.
 *
 * @public
 */
export interface LoupePDFViewerProps {
  /** PDF URL the viewer fetches. Sign / scope upstream. */
  pdfUrl: string;
  /**
   * Optional override for the pdf.js worker URL. Defaults to the
   * unpkg CDN URL pinned to the bundled pdfjs-dist version (see
   * {@link defaultPdfWorkerSrc} from
   * `@printwithsynergy/loupe-pdf/fallback-pdfjs`).
   */
  workerSrc?: string;
  /**
   * Optional services to override the pdf.js fallback path. When
   * omitted, the viewer wires only the pdf.js fallback adapter; the
   * components that need richer services (`SeparationCanvas`,
   * `DensitometerTool`, `TACHeatmapOverlay`, `AnnotationCanvas`,
   * etc.) self-hide.
   */
  services?: ViewerServices;
  /** Optional theme tokens. Defaults to {@link defaultThemeTokens}. */
  tokens?: ThemeTokens;
  /** Optional className hook for hosts that want to restyle the chrome. */
  className?: string;
  /**
   * "scroll" (default) renders every page in a scrollable list;
   * "single" renders one page at a time with prev/next controls.
   */
  mode?: "scroll" | "single";
  /**
   * Tools shown in the top toolbar. Order matters. Defaults to all
   * four. Pass `[]` to render an empty toolbar (zoom is then
   * available only via wheel / pinch).
   */
  tools?: ReadonlyArray<LoupePDFViewerTool>;
  /** Initial zoom percentage. Default `100`. */
  initialZoom?: number;
}

const DEFAULT_TOOLS: ReadonlyArray<LoupePDFViewerTool> = [
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
 * <LoupePDFViewer pdfUrl="https://example.com/file.pdf" />
 * ```
 *
 * Auto-discovers page count, dimensions, and OCG layers from the
 * PDF. Renders every page in a virtualized scrollable list (or one
 * at a time with `mode="single"`). Default toolbar surfaces zoom,
 * layers, color picker, and measure tool — drop tools by passing a
 * shorter `tools` array.
 *
 * Hosts that need separations, densitometer, TAC heatmap, or
 * annotations pass a `services` prop wired to their backend (see
 * `docs/services.md`). The corresponding components auto-mount when
 * their service is wired and self-hide otherwise.
 *
 * For bespoke layouts use the lower-level surface (`PageCanvas`,
 * `LayerPanel`, `MeasureTool`, etc.) directly with your own
 * `ViewerHostContext` + `ViewerServicesContext` providers — this
 * composition is purely additive.
 *
 * @public
 */
export function LoupePDFViewer(props: LoupePDFViewerProps) {
  const {
    pdfUrl,
    workerSrc,
    services,
    tokens = defaultThemeTokens,
    className,
    mode = "scroll",
    tools = DEFAULT_TOOLS,
    initialZoom = 100,
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
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTool, setActiveTool] = useState<"none" | "color-picker" | "measure">("none");
  const [layersOpen, setLayersOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isMobile = useMediaQueryMaxWidth(MOBILE_BREAKPOINT_PX - 1);

  // Page-count discovery.
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

  // Layer discovery + default-on seeding.
  useEffect(() => {
    let cancelled = false;
    fallback.listLayers().then((layers) => {
      if (cancelled) return;
      setEnabledLayers(
        new Set(layers.filter((l) => l.default_on).map((l) => l.ocg_index)),
      );
      setLayersDiscovered(true);
    });
    return () => {
      cancelled = true;
    };
  }, [fallback]);

  const showLayersControl = layersDiscovered && tools.includes("layers");

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
        // Re-discover and enable everything; needs the layers list,
        // which is on the fallback adapter.
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

  const styles = useMemo(() => themedStyles(tokens), [tokens]);

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
      tokens={tokens}
    />
  );

  const layersBody = showLayersControl ? (
    <LayerPanel
      jobId="loupe-pdf-viewer"
      enabledLayers={enabledLayers}
      onToggleLayer={onToggleLayer}
      onSetAllLayers={onSetAllLayers}
    />
  ) : null;

  const content = (
    <div className={`loupe-pdf-viewer ${className ?? ""}`} style={styles.shell}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <strong style={styles.title}>PDF</strong>
          {mode === "single" && pageCount !== null && (
            <PageNav
              page={currentPage}
              total={pageCount}
              onChange={setCurrentPage}
              tokens={tokens}
            />
          )}
        </div>
        <div style={styles.headerRight}>
          {tools.includes("zoom") && (
            <ZoomControls zoom={zoom} onZoomChange={setZoom} compact dark />
          )}
          {tools.includes("color-picker") && (
            <ToolButton
              label="Color"
              active={activeTool === "color-picker"}
              onClick={() =>
                setActiveTool((t) => (t === "color-picker" ? "none" : "color-picker"))
              }
              tokens={tokens}
            />
          )}
          {tools.includes("measure") && (
            <ToolButton
              label="Measure"
              active={activeTool === "measure"}
              onClick={() =>
                setActiveTool((t) => (t === "measure" ? "none" : "measure"))
              }
              tokens={tokens}
            />
          )}
          {showLayersControl && (
            <ToolButton
              label="Layers"
              active={layersOpen}
              onClick={() => setLayersOpen((v) => !v)}
              tokens={tokens}
            />
          )}
        </div>
      </header>
      <div style={isMobile ? styles.bodyMobile : styles.body}>
        {!isMobile && layersOpen && layersBody && (
          <aside style={styles.panel}>{layersBody}</aside>
        )}
        <main style={styles.stage}>{stage}</main>
      </div>
      {isMobile && layersOpen && layersBody && (
        <div style={styles.drawerOverlay} onClick={() => setLayersOpen(false)}>
          <div style={styles.drawer} onClick={(e) => e.stopPropagation()}>
            <div style={styles.drawerHeader}>
              <span>Layers</span>
              <button
                type="button"
                onClick={() => setLayersOpen(false)}
                style={styles.drawerClose}
                aria-label="Close layers"
              >
                ×
              </button>
            </div>
            <div style={styles.drawerBody}>{layersBody}</div>
          </div>
        </div>
      )}
    </div>
  );

  // Wrap with both contexts. Services context is only mounted when
  // the host supplied one — otherwise components use the no-op
  // defaults and self-hide as needed.
  return (
    <ViewerHostContext.Provider value={hostValue}>
      {services ? (
        <ViewerServicesContext.Provider value={services}>
          {content}
        </ViewerServicesContext.Provider>
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
  tokens: ThemeTokens;
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
  tokens,
}: StageProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  if (errorMessage) {
    return (
      <div
        style={{
          padding: 24,
          color: "#dc2626",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        Failed to load PDF: {errorMessage}
      </div>
    );
  }

  if (pageCount === null) {
    return (
      <div
        style={{
          padding: 24,
          color: tokens.fg,
          opacity: 0.6,
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
        }}
      >
        Loading…
      </div>
    );
  }

  const pages =
    mode === "single"
      ? [currentPage]
      : Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div
      ref={containerRef}
      style={{
        height: "100%",
        overflow: "auto",
        padding: 16,
        boxSizing: "border-box",
        backgroundColor: tokens.bg,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
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
// PageSlot — lazy-mounts PageCanvas via IntersectionObserver
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

  // Resolve dimensions if not provided.
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

  // Lazy-mount via IntersectionObserver.
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
      style={{
        position: "relative",
        width: canvasWidth,
        height: canvasHeight,
        backgroundColor: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
      }}
    >
      {visible && resolvedDims ? (
        <Fragment>
          <PageCanvas
            jobId="loupe-pdf-viewer"
            page={page}
            zoom={scale}
            items={[]}
            selectedItem={null}
            onItemClick={() => {}}
            onZoomChange={undefined}
          />
          {activeTool === "color-picker" && (
            <ColorPickerTool
              jobId="loupe-pdf-viewer"
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
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#94a3b8",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
          }}
        >
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
  onClick,
  tokens,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tokens: ThemeTokens;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "6px 10px",
        border: `1px solid ${tokens.border}`,
        borderRadius: 6,
        background: active ? tokens.accent : "transparent",
        color: active ? "#fff" : tokens.fg,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function PageNav({
  page,
  total,
  onChange,
  tokens,
}: {
  page: number;
  total: number;
  onChange: (n: number) => void;
  tokens: ThemeTokens;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        style={navButtonStyle(tokens, page <= 1)}
        aria-label="Previous page"
      >
        ‹
      </button>
      <span style={{ fontSize: 12, color: tokens.fg, fontFamily: "system-ui, sans-serif" }}>
        {page} / {total}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(total, page + 1))}
        disabled={page >= total}
        style={navButtonStyle(tokens, page >= total)}
        aria-label="Next page"
      >
        ›
      </button>
    </div>
  );
}

function navButtonStyle(tokens: ThemeTokens, disabled: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    border: `1px solid ${tokens.border}`,
    borderRadius: 6,
    background: "transparent",
    color: tokens.fg,
    fontSize: 16,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.3 : 1,
  };
}

// ---------------------------------------------------------------------------
// Themed inline styles
// ---------------------------------------------------------------------------

function themedStyles(tokens: ThemeTokens) {
  const shell: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 480,
    backgroundColor: tokens.bg,
    color: tokens.fg,
    fontFamily: "system-ui, sans-serif",
  };
  const header: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 12px",
    borderBottom: `1px solid ${tokens.border}`,
    gap: 8,
    flexShrink: 0,
  };
  const headerLeft: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
  const headerRight: CSSProperties = { display: "flex", alignItems: "center", gap: 6 };
  const title: CSSProperties = { color: tokens.primary, fontSize: 14 };
  const body: CSSProperties = {
    display: "flex",
    flex: 1,
    minHeight: 0,
  };
  const bodyMobile: CSSProperties = {
    display: "flex",
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  };
  const panel: CSSProperties = {
    width: 260,
    flexShrink: 0,
    borderRight: `1px solid ${tokens.border}`,
    overflowY: "auto",
    backgroundColor: tokens.bg,
  };
  const stage: CSSProperties = {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#1e293b",
  };
  const drawerOverlay: CSSProperties = {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 1000,
    display: "flex",
    alignItems: "flex-end",
  };
  const drawer: CSSProperties = {
    width: "100%",
    maxHeight: "70vh",
    backgroundColor: tokens.bg,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
  const drawerHeader: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: `1px solid ${tokens.border}`,
    fontWeight: 600,
  };
  const drawerClose: CSSProperties = {
    border: "none",
    background: "transparent",
    fontSize: 22,
    color: tokens.fg,
    cursor: "pointer",
  };
  const drawerBody: CSSProperties = { flex: 1, overflowY: "auto" };
  return {
    shell,
    header,
    headerLeft,
    headerRight,
    title,
    body,
    bodyMobile,
    panel,
    stage,
    drawerOverlay,
    drawer,
    drawerHeader,
    drawerClose,
    drawerBody,
  };
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

// Silence unused-import warning when ReactNode is only used in JSX.
type _Force = ReactNode;
