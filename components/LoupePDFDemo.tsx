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
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import { darkThemeTokens } from "../plugin/services";
import type { OverlayItem } from "../plugin/types";
import type { DielineResult } from "../types";
import { ViewerHostContext, ViewerServicesContext } from "../host";
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
  shellStyle,
  topbarStyle,
  urlBarStyle,
  urlInputStyle,
} from "./LoupePDFDemo.styles";
import { LoupePDFViewerShell } from "./LoupePDFViewerShell";
import { useIsMobile } from "./useIsMobile";
import { useLoupeViewerController } from "./useLoupeViewerController";
import { DEFAULT_LOUPE_PDF_TOOLS, type LoupePDFTool } from "./viewerTools";
import type { LoupePDFPresetKind } from "./presets";
import type { LoupePDFShellPlugin } from "./shellPlugins";

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
export type LoupePDFDemoTool = LoupePDFTool;
const DEFAULT_TOOLS = DEFAULT_LOUPE_PDF_TOOLS;

/**
 * Props for {@link LoupePDFDemo}.
 *
 * @public
 */
export interface LoupePDFDemoProps {
  /** Canonical codex document payload for page/layer metadata. */
  codexDocument?: unknown;
  /**
   * Pre-loaded PDF bytes. When provided, the controller uses these directly
   * instead of fetching from `initialPdfUrl`. Useful when the caller already
   * has the bytes in memory (e.g. from a file upload or SSE extract response).
   */
  pdfBytes?: ArrayBuffer | null;
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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

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
  codexDocument,
  pdfBytes: pdfBytesProp,
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
  preset = "demo",
  plugins: customPlugins = [],
}: LoupePDFDemoProps) {
  const overlayItems = useMemo<readonly OverlayItem[]>(() => items ?? [], [items]);
  const [internalSelected, setInternalSelected] = useState<OverlayItem | null>(null);
  const effectiveSelected =
    onItemSelect !== undefined ? (selectedItem ?? null) : internalSelected;
  const handleItemClick = useCallback(
    (item: OverlayItem) => {
      if (onItemSelect) onItemSelect(item);
      else setInternalSelected(item);
    },
    [onItemSelect],
  );
  const tokens: ThemeTokens = useMemo(
    () => ({ ...darkThemeTokens, ...tokenOverrides }),
    [tokenOverrides],
  );
  const isMobile = useIsMobile();
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl ?? "");
  const [draftUrl, setDraftUrl] = useState(initialPdfUrl ?? "");
  const [dragging, setDragging] = useState(false);
  const [fullscreen, setFullscreen] = useState(initialFullscreen);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  const revokePreviousBlob = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);
  useEffect(() => revokePreviousBlob, [revokePreviousBlob]);

  useEffect(() => {
    if (!embedded) return;
    const next = initialPdfUrl ?? "";
    setPdfUrl((prev) => (prev === next ? prev : next));
    setDraftUrl(next);
  }, [embedded, initialPdfUrl]);

  const controller = useLoupeViewerController({
    pdfUrl,
    pdfBytes: pdfBytesProp,
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
    plugins: customPlugins,
    onPageChange: onPageChangeProp,
    onZoomChange: onZoomChangeProp,
    onError: onErrorProp,
  });

  // In embedded mode the host owns the chrome — don't render an error
  // banner inside the viewer. Errors still fire via onError so the host
  // can surface them in its own UI.
  const displayedError = embedded ? null : (localError ?? controller.error);

  const loadUrl = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const result = validatePdfUrl(draftUrl);
      if (!result.valid) {
        setLocalError(result.error ?? "Invalid URL.");
        return;
      }
      setLocalError(null);
      controller.setError(null);
      revokePreviousBlob();
      setPdfUrl(draftUrl.trim());
    },
    [draftUrl, revokePreviousBlob, controller],
  );

  const loadFile = useCallback(
    async (file: File) => {
      const result = await validatePdfFile(file, maxFileSize);
      if (!result.valid) {
        setLocalError(result.error ?? "Invalid file.");
        return;
      }
      setLocalError(null);
      controller.setError(null);
      revokePreviousBlob();
      const blobUrl = URL.createObjectURL(file);
      blobUrlRef.current = blobUrl;
      setDraftUrl(file.name);
      setPdfUrl(blobUrl);
    },
    [revokePreviousBlob, maxFileSize, controller],
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

  const viewerShell = (
    <LoupePDFViewerShell
      controller={controller}
      tokens={tokens}
      isMobile={isMobile}
      pdfUrl={pdfUrl}
      cropToTrim={cropToTrim}
      showBoxOverlays={showBoxOverlays}
      tacLimit={tacLimit}
      dieline={dieline ?? null}
      overlayItems={overlayItems}
      effectiveSelected={effectiveSelected}
      onOverlayItemClick={handleItemClick}
      emptyState={
        embedded ? (
          <div style={emptyStateStyle}>
            <p style={{ margin: 0, opacity: 0.6 }}>Loading…</p>
          </div>
        ) : (
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
        )
      }
    />
  );

  const shell = (
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

      {!embedded && (
        <header
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
                <div
                  style={{
                    ...brandStyle,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  {brandLogoUrl && (
                    <img
                      src={brandLogoUrl}
                      alt=""
                      aria-hidden="true"
                      style={{ width: 24, height: 24, flexShrink: 0 }}
                    />
                  )}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {brand}
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
              </div>
              <form
                onSubmit={loadUrl}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  width: "100%",
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
                    style={{
                      ...btnStyle(tokens),
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
            </>
          ) : (
            <>
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

      {displayedError && (
        <div style={errorStyle()}>
          <span>{displayedError}</span>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              controller.setError(null);
            }}
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

      {viewerShell}

      <footer style={footerStyle(tokens)}>
        <span>{brand} &middot; AGPL-3.0</span>
        {footer}
      </footer>
    </div>
  );

  return (
    <ViewerHostContext.Provider value={controller.hostValue}>
      {controller.services ? (
        <ViewerServicesContext.Provider value={controller.services}>
          {shell}
        </ViewerServicesContext.Provider>
      ) : (
        shell
      )}
    </ViewerHostContext.Provider>
  );
}
