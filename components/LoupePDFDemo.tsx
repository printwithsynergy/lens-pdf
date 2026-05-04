"use client";

/**
 * `<LoupePDFDemo>` — drop-in interactive demo component.
 *
 * One mount, full feature surface. Backed by
 * `createBrowserViewerServices`, every viewer-only feature LoupePDF
 * ships works on any PDF the browser can fetch:
 *
 *   - PageCanvas + multi-page navigation + multi-DPI tile cache
 *   - Color picker (RGB + TAC)
 *   - Densitometer (CMYK + TAC limit)
 *   - Measure tool (mm / in / pt)
 *   - TAC heatmap overlay
 *   - Per-ink CMYK separations preview (inks default ON, untick to
 *     hide that plate — same UX as Acrobat's Output Preview)
 *   - PDF layers (per-OCG isolated rendering, default all on)
 *   - Annotation canvas + toolbar + thread (in-memory)
 *
 * Three mutually-exclusive primary canvases — Page (default),
 * Separation preview, Layer preview — match the lint-pdf reference
 * viewer's UX so the same muscle memory carries over.
 *
 * Consumers provide configuration / branding and get a working demo:
 *
 * ```tsx
 * <LoupePDFDemo brand="MyApp" brandLogoUrl="/logo.svg" />
 * ```
 *
 * Server-only features (true ICC separations, preflight findings,
 * server-persisted annotations, PDF report exports) self-hide because
 * their dedicated services are intentionally `markUnwired`. Hosts
 * that have a backend pass `services` to override.
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
} from "../browser";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import { darkThemeTokens } from "../plugin/services";
import type { PageInfo } from "../types";
import { pageInfoFromDimensions } from "../types";
import { ViewerHostContext, ViewerServicesContext } from "../host";
import { validatePdfFile, validatePdfUrl } from "../host/pdfValidation";
import { AnnotationCanvas } from "./AnnotationCanvas";
import { AnnotationThread } from "./AnnotationThread";
import { AnnotationToolbar, type AnnotationTool } from "./AnnotationToolbar";
import { ColorPickerTool } from "./ColorPickerTool";
import { DensitometerTool } from "./DensitometerTool";
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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const PTS_TO_PX = 96 / 72;
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
// Style helpers (inlined so the demo is zero-config for consumers — no
// Tailwind / CSS framework needed in the host app)
// ---------------------------------------------------------------------------

function shellStyle(tokens: ThemeTokens, fullscreen: boolean): CSSProperties {
  const base: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: 0,
    background: tokens.bg,
    color: tokens.fg,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
    position: "relative",
    overflow: "hidden",
    colorScheme: "dark",
  };
  if (fullscreen) {
    return { ...base, position: "fixed", inset: 0, zIndex: 9999 };
  }
  return base;
}

const topbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  borderBottom: "1px solid var(--lpd-border, #2b2138)",
  flexShrink: 0,
};

const brandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
  fontSize: 15,
  whiteSpace: "nowrap" as const,
};

const urlBarStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  minWidth: 0,
  gap: 6,
};

function urlInputStyle(tokens: ThemeTokens): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    padding: "7px 10px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    color: tokens.fg,
    fontSize: 13,
    outline: "none",
  };
}

function btnStyle(tokens: ThemeTokens): CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 6,
    border: `1px solid ${tokens.accent}`,
    background: tokens.accent,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
  };
}

function ghostBtnStyle(tokens: ThemeTokens): CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    color: tokens.fg,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap" as const,
  };
}

const layoutStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

function sidebarStyle(tokens: ThemeTokens): CSSProperties {
  return {
    width: 280,
    flexShrink: 0,
    borderRight: `1px solid ${tokens.border}`,
    padding: 16,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 10,
  };
}

const stageStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: 24,
  gap: 12,
};

function errorStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: "#7f1d1d",
    color: "#fecaca",
    fontSize: 13,
    flexShrink: 0,
  };
}

function footerStyle(tokens: ThemeTokens): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderTop: `1px solid ${tokens.border}`,
    fontSize: 12,
    opacity: 0.7,
    flexShrink: 0,
  };
}

const dropOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  fontSize: 24,
  fontWeight: 700,
  color: "#fff",
  pointerEvents: "none",
};

const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 48,
  textAlign: "center",
  opacity: 0.85,
  margin: "auto",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  cursor: "pointer",
  padding: "3px 0",
};

const headingStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  opacity: 0.6,
  margin: "8px 0 4px",
};

const exitFsStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 10001,
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.3)",
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

const channelSwatchStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 3,
  border: "1px solid rgba(255, 255, 255, 0.18)",
  flexShrink: 0,
};

const pageNavStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  padding: "6px 0",
};

function pageNavBtnStyle(tokens: ThemeTokens, disabled: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "transparent",
    color: tokens.fg,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    fontSize: 16,
    lineHeight: 1,
  };
}

const stageInnerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
};

function modeButtonGroupStyle(): CSSProperties {
  return {
    display: "flex",
    width: "100%",
    gap: 0,
  };
}

function modeButtonStyle(
  tokens: ThemeTokens,
  active: boolean,
  position: "left" | "middle" | "right",
): CSSProperties {
  return {
    flex: 1,
    padding: "6px 8px",
    border: `1px solid ${active ? tokens.accent : tokens.border}`,
    background: active ? tokens.accent : "transparent",
    color: active ? "#fff" : tokens.fg,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius:
      position === "left"
        ? "6px 0 0 6px"
        : position === "right"
          ? "0 6px 6px 0"
          : "0",
    marginLeft: position === "left" ? 0 : -1,
  };
}

const preparingOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(14, 10, 20, 0.7)",
  fontSize: 13,
  zIndex: 50,
  color: "#cbd5e1",
};

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
}: LoupePDFDemoProps) {
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
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
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

        {dragging && <div style={dropOverlayStyle}>Drop your PDF here</div>}

        {/* Top bar */}
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
                    {PROCESS_CHANNELS.map((name) => (
                      <label key={name} style={rowStyle}>
                        <input
                          type="checkbox"
                          checked={enabledChannels.has(name)}
                          onChange={(e) =>
                            setEnabledChannels((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(name);
                              else next.delete(name);
                              return next;
                            })
                          }
                        />
                        <span
                          style={{
                            ...channelSwatchStyle,
                            backgroundColor: PROCESS_SWATCH[name],
                          }}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                    <button
                      type="button"
                      style={{
                        ...ghostBtnStyle(tokens),
                        marginTop: 4,
                        fontSize: 11,
                        padding: "5px 10px",
                      }}
                      onClick={() =>
                        setEnabledChannels(new Set(PROCESS_CHANNELS))
                      }
                      disabled={
                        enabledChannels.size === PROCESS_CHANNELS.length
                      }
                    >
                      Show all inks
                    </button>
                  </div>
                  <p style={{ fontSize: 11, opacity: 0.5, lineHeight: 1.5 }}>
                    Untick an ink to preview the page without that plate
                    — same UX as Acrobat&rsquo;s Output Preview.
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
                Everything runs in your browser via pdf.js — your file
                never leaves the page. CMYK / TAC are RGB-derived
                approximations for showcase purposes; production hosts
                wire a backend for ICC-correct readings. Annotations
                live in this tab only and are discarded on reload. Max
                upload {formatMaxSize(maxFileSize)}.
              </p>
            </aside>
          )}

          {/* Stage */}
          <section style={stageStyle}>
            {!pdfUrl ? (
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
                  Your file stays in your browser. Max {formatMaxSize(maxFileSize)}.
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
                      allChannels={[...PROCESS_CHANNELS]}
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
                      items={[]}
                      selectedItem={null}
                      onItemClick={() => {}}
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
