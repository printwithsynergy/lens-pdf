"use client";

/**
 * `<LoupePDFDemo>` — drop-in interactive demo component.
 *
 * Embeds a complete PDF viewer with file upload, URL paste,
 * drag-and-drop, client-side validation, sidebar controls, theming,
 * and optional fullscreen mode — all in one component. Consumers
 * provide config + branding and get a working demo:
 *
 * ```tsx
 * <LoupePDFDemo brand="MyApp" brandLogoUrl="/logo.svg" />
 * ```
 *
 * @public
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import { darkThemeTokens } from "../plugin/services";
import type { PdfFallbackAdapter } from "../plugin/services";
import type { PageInfo } from "../types";
import { pageInfoFromDimensions } from "../types";
import { ViewerHostContext, ViewerServicesContext, defaultUnwiredServices } from "../host";
import { createPdfJsFallback } from "../fallback-pdfjs";
import { validatePdfFile, validatePdfUrl } from "../host/pdfValidation";
import { ColorPickerTool } from "./ColorPickerTool";
import { LayerPanel } from "./LayerPanel";
import { MeasureTool } from "./MeasureTool";
import { PageCanvas } from "./PageCanvas";
import type { LoupePDFViewerTool } from "./LoupePDFViewer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Props for the {@link LoupePDFDemo} component.
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
  /** Tools to show. Default: all. */
  tools?: ReadonlyArray<LoupePDFViewerTool>;
  /** Initial zoom percentage. Default: 80. */
  initialZoom?: number;
  /** Viewer mode. Default: "scroll". */
  mode?: "scroll" | "single";
  /** Optional wired services for hosts that have a backend. */
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

function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// ---------------------------------------------------------------------------
// Styles (inlined so the component is zero-config for consumers)
// ---------------------------------------------------------------------------

function shellStyle(tokens: ThemeTokens, fullscreen: boolean): React.CSSProperties {
  const base: React.CSSProperties = {
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
  };
  if (fullscreen) {
    return { ...base, position: "fixed", inset: 0, zIndex: 9999 };
  }
  return base;
}

const topbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "8px 16px",
  borderBottom: "1px solid var(--lpd-border, #2b2138)",
  flexShrink: 0,
};

const brandStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
  fontSize: 15,
  whiteSpace: "nowrap" as const,
};

const urlBarStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minWidth: 0,
  gap: 6,
};

const urlInputStyle = (tokens: ThemeTokens): React.CSSProperties => ({
  flex: 1,
  minWidth: 0,
  padding: "6px 10px",
  borderRadius: 6,
  border: `1px solid ${tokens.border}`,
  background: "transparent",
  color: tokens.fg,
  fontSize: 13,
  outline: "none",
});

const btnStyle = (tokens: ThemeTokens): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 6,
  border: `1px solid ${tokens.border}`,
  background: tokens.accent,
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap" as const,
});

const layoutStyle: React.CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

const sidebarStyle = (tokens: ThemeTokens): React.CSSProperties => ({
  width: 240,
  flexShrink: 0,
  borderRight: `1px solid ${tokens.border}`,
  padding: 16,
  overflowY: "auto" as const,
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
});

const stageStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: 24,
};

const errorStyle = (tokens: ThemeTokens): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  background: "#7f1d1d",
  color: "#fecaca",
  fontSize: 13,
  flexShrink: 0,
});

const footerStyle = (tokens: ThemeTokens): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  borderTop: `1px solid ${tokens.border}`,
  fontSize: 12,
  opacity: 0.7,
  flexShrink: 0,
});

const dropOverlayStyle: React.CSSProperties = {
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

const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 48,
  textAlign: "center",
  opacity: 0.85,
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const headingStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
  opacity: 0.6,
  margin: 0,
};

const exitFsStyle: React.CSSProperties = {
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

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

/**
 * Complete interactive LoupePDF demo — upload, URL paste, drag-drop,
 * validation, sidebar controls, theming, and optional fullscreen mode.
 *
 * @public
 */
export function LoupePDFDemo({
  tokens: tokenOverrides,
  maxFileSize = DEFAULT_MAX_BYTES,
  brand = "LoupePDF",
  brandLogoUrl,
  className,
  initialZoom = 80,
  services: serviceOverrides,
  footer,
  fullscreen: initialFullscreen = false,
  initialPdfUrl,
  initialPage = 1,
}: LoupePDFDemoProps) {
  // -----------------------------------------------------------------------
  // Tokens & services
  // -----------------------------------------------------------------------
  const tokens: ThemeTokens = useMemo(
    () => ({ ...darkThemeTokens, ...tokenOverrides }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(tokenOverrides)],
  );

  const servicesValue = useMemo<ViewerServices>(() => {
    const base = { ...defaultUnwiredServices, tokens };
    if (!serviceOverrides) return base;
    return { ...base, ...serviceOverrides, tokens };
  }, [tokens, serviceOverrides]);

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl ?? "");
  const [draftUrl, setDraftUrl] = useState(initialPdfUrl ?? "");
  const [zoom, setZoom] = useState(initialZoom);
  const [pageInfo, setPageInfo] = useState<PageInfo>(
    initialPage !== 1
      ? { ...DEFAULT_PAGE, page_num: initialPage }
      : DEFAULT_PAGE,
  );
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showMeasure, setShowMeasure] = useState(false);
  const [enabledLayers, setEnabledLayers] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(initialFullscreen);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Blob URL lifecycle
  const blobUrlRef = useRef<string | null>(null);
  const revokePreviousBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);
  useEffect(() => revokePreviousBlob, [revokePreviousBlob]);

  // -----------------------------------------------------------------------
  // Fallback adapter
  // -----------------------------------------------------------------------
  const fallback = useMemo<PdfFallbackAdapter | undefined>(() => {
    if (!pdfUrl) return undefined;
    return createPdfJsFallback({ pdfUrl });
  }, [pdfUrl]);

  // Load first-page dimensions
  useEffect(() => {
    let cancelled = false;
    if (!fallback) {
      setPageInfo(DEFAULT_PAGE);
      return;
    }
    (async () => {
      try {
        const dims = await fallback.getPageDimensions(1);
        if (cancelled) return;
        setPageInfo(pageInfoFromDimensions(1, dims.widthPts, dims.heightPts));
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load PDF.");
      }
    })();
    return () => { cancelled = true; };
  }, [fallback]);

  // Default-on layers
  useEffect(() => {
    let cancelled = false;
    if (!fallback) { setEnabledLayers(new Set()); return; }
    fallback.listLayers().then((layers) => {
      if (cancelled) return;
      setEnabledLayers(new Set(layers.filter((l) => l.default_on).map((l) => l.ocg_index)));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [fallback]);

  // -----------------------------------------------------------------------
  // Derived values
  // -----------------------------------------------------------------------
  const scale = zoom / 100;
  const canvasW = Math.round(pageInfo.width_pts * PTS_TO_PX * scale);
  const canvasH = Math.round(pageInfo.height_pts * PTS_TO_PX * scale);

  const hostValue = useMemo(
    () => ({
      apiBase: "",
      jobApiBase: "",
      readOnly: true,
      debug: false,
      pdfUrl: pdfUrl || undefined,
      pdfFallback: fallback,
    }),
    [pdfUrl, fallback],
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

  // -----------------------------------------------------------------------
  // Drag-and-drop
  // -----------------------------------------------------------------------
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
  // Render
  // -----------------------------------------------------------------------
  return (
    <ViewerHostContext.Provider value={hostValue}>
      <ViewerServicesContext.Provider value={servicesValue}>
        <div
          className={className}
          style={shellStyle(tokens, fullscreen)}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Fullscreen exit button */}
          {fullscreen && (
            <button
              type="button"
              style={exitFsStyle}
              onClick={() => setFullscreen(false)}
            >
              Exit fullscreen
            </button>
          )}

          {/* Drag overlay */}
          {dragging && (
            <div style={dropOverlayStyle}>Drop your PDF here</div>
          )}

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
              <span style={{ opacity: 0.6, fontWeight: 400, fontSize: 13 }}>demo</span>
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
              style={btnStyle(tokens)}
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

          {/* Error banner */}
          {error && (
            <div style={errorStyle(tokens)}>
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

          {/* Body */}
          <div style={layoutStyle}>
            {/* Sidebar */}
            <aside style={sidebarStyle(tokens)}>
              <h2 style={headingStyle}>View</h2>
              <label style={rowStyle}>
                <span>Zoom</span>
                <input
                  type="range"
                  min="25"
                  max="400"
                  step="5"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ minWidth: 40, textAlign: "right" }}>{zoom}%</span>
              </label>

              <h2 style={headingStyle}>Tools</h2>
              <label style={rowStyle}>
                <input
                  type="checkbox"
                  checked={showColorPicker}
                  onChange={(e) => setShowColorPicker(e.target.checked)}
                />
                <span>Color picker</span>
              </label>
              <label style={rowStyle}>
                <input
                  type="checkbox"
                  checked={showMeasure}
                  onChange={(e) => setShowMeasure(e.target.checked)}
                />
                <span>Measure</span>
              </label>

              <h2 style={headingStyle}>Layers</h2>
              <LayerPanel
                jobId="demo"
                enabledLayers={enabledLayers}
                onToggleLayer={(ocgIndex: number) => {
                  setEnabledLayers((prev) => {
                    const next = new Set(prev);
                    if (next.has(ocgIndex)) next.delete(ocgIndex);
                    else next.add(ocgIndex);
                    return next;
                  });
                }}
                onSetAllLayers={async (enabled: boolean) => {
                  if (!fallback || !enabled) {
                    setEnabledLayers(new Set());
                    return;
                  }
                  const layers = await fallback.listLayers();
                  setEnabledLayers(new Set(layers.map((l) => l.ocg_index)));
                }}
              />

              <p style={{ fontSize: 11, opacity: 0.5, marginTop: "auto" }}>
                Everything runs in your browser via pdf.js — your file never
                touches a server. Max upload: {formatMaxSize(maxFileSize)}.
              </p>
            </aside>

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
                    Paste a PDF URL above or drag-and-drop a file anywhere on
                    this page to start inspecting.
                  </p>
                  <button
                    type="button"
                    style={{ ...btnStyle(tokens), padding: "10px 24px", fontSize: 15 }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose a file
                  </button>
                  <p style={{ fontSize: 11, opacity: 0.5 }}>
                    Your file stays in your browser. Max {formatMaxSize(maxFileSize)}.
                  </p>
                </div>
              ) : (
                <div style={{ width: canvasW, height: canvasH, position: "relative" }}>
                  <PageCanvas
                    jobId="demo"
                    page={pageInfo}
                    zoom={zoom}
                    items={[]}
                    selectedItem={null}
                    onItemClick={() => {}}
                  />
                  {showColorPicker && (
                    <ColorPickerTool
                      jobId="demo"
                      pageNum={pageInfo.page_num}
                      pageWidthPts={pageInfo.width_pts}
                      pageHeightPts={pageInfo.height_pts}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                    />
                  )}
                  {showMeasure && (
                    <MeasureTool
                      pageWidthPts={pageInfo.width_pts}
                      pageHeightPts={pageInfo.height_pts}
                      canvasWidth={canvasW}
                      canvasHeight={canvasH}
                    />
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Footer */}
          <footer style={footerStyle(tokens)}>
            <span>{brand} &middot; AGPL-3.0</span>
            {footer}
          </footer>
        </div>
      </ViewerServicesContext.Provider>
    </ViewerHostContext.Provider>
  );
}
