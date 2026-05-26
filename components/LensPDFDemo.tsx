"use client";

/**
 * `<LensPDFDemo>` — the marketing-chrome wrapper around {@link LensPDF}.
 *
 * `<LensPDF>` is the complete viewer. `<LensPDFDemo>` is a thin layer
 * on top of it that adds the upload chrome — URL bar, drag-and-drop,
 * file picker, and empty state — and feeds the resulting PDF URL into
 * `<LensPDF>`. It powers the public showcase at lenspdf.com so
 * reviewers can drop arbitrary PDFs into the page without a host.
 *
 * **Most consumers should use {@link LensPDF} directly** — it's the
 * one-liner production drop-in:
 *
 * ```tsx
 * <LensPDF pdfUrl="/proofs/abc.pdf" workerSrc={pdfWorkerSrc} />
 * ```
 *
 * Reach for `<LensPDFDemo>` only when you want the built-in upload
 * affordances (a standalone demo page, an internal scratch tool).
 *
 * @public
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { darkThemeTokens } from "../plugin/services";
import type { ThemeTokens } from "../plugin/services";
import { validatePdfFile, validatePdfUrl } from "../host/pdfValidation";
import {
  brandStyle,
  btnStyle,
  dropOverlayStyle,
  emptyStateStyle,
  errorStyle,
  footerStyle,
  ghostBtnStyle,
  shellStyle,
  topbarStyle,
  urlBarStyle,
  urlInputStyle,
} from "./LensPDFDemo.styles";
import { useIsMobile } from "./useIsMobile";
import { LensPDF, type LensPDFProps, type LensPDFTool } from "./LensPDF";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Tool ids the viewer's sidebar can show.
 *
 * @public
 * @deprecated Use {@link LensPDFTool} — kept as an alias for back-compat.
 */
export type LensPDFDemoTool = LensPDFTool;

/**
 * Props for {@link LensPDFDemo}. Every {@link LensPDFProps} field is
 * accepted and forwarded to the wrapped `<LensPDF>` except `pdfUrl`,
 * which `<LensPDFDemo>` owns through its upload chrome.
 *
 * @public
 */
export interface LensPDFDemoProps extends Omit<LensPDFProps, "pdfUrl"> {
  /** Maximum upload size in bytes. Default: 50 MB. */
  maxFileSize?: number;
  /** Pre-loaded PDF URL (e.g. from query params). Skips the empty state. */
  initialPdfUrl?: string;
  /**
   * When `false`, suppresses the upload chrome header (URL bar +
   * file picker + brand) so the inner `<LensPDF>` top bar is the
   * only visible chrome — no stacked "iframe"-style double chrome.
   *
   * Drag-and-drop on the wrapper still works as a swap path, so
   * users can replace the loaded PDF without the header UI. The
   * empty-state file picker still renders (only the upload header
   * is hidden, not the empty state).
   *
   * Default: `true`.
   */
  showUploadHeader?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

function formatMaxSize(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Marketing-chrome wrapper: upload, URL paste, drag-drop, validation,
 * then mounts {@link LensPDF} with the resolved PDF URL.
 *
 * @public
 */
export function LensPDFDemo({
  maxFileSize = DEFAULT_MAX_BYTES,
  initialPdfUrl,
  showUploadHeader = true,
  className,
  ...lensProps
}: LensPDFDemoProps) {
  const tokens: ThemeTokens = useMemo(
    () => ({ ...darkThemeTokens, ...lensProps.tokens }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lensProps.tokens)],
  );
  const effectiveBrand = lensProps.brand ?? tokens.logoText ?? "LensPDF";
  const effectiveLogoUrl = lensProps.brandLogoUrl ?? tokens.logoUrl;
  const effectiveLogoMaxHeight = tokens.logoMaxHeight ?? 24;
  const effectiveLogoAlt = tokens.logoAlt;

  const isMobile = useIsMobile();
  // Open when no PDF pre-loaded so the user sees how to load one;
  // auto-closes after a PDF is loaded so the canvas gets the space back.
  const [mobileUrlBarOpen, setMobileUrlBarOpen] = useState(!initialPdfUrl);

  // -----------------------------------------------------------------------
  // Upload state
  // -----------------------------------------------------------------------
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl ?? "");
  const [draftUrl, setDraftUrl] = useState(initialPdfUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track `initialPdfUrl` as a controlled prop so query-param driven hosts
  // can swap the document without remounting.
  useEffect(() => {
    if (initialPdfUrl == null) return;
    setPdfUrl((prev) => (prev === initialPdfUrl ? prev : initialPdfUrl));
    setDraftUrl(initialPdfUrl);
  }, [initialPdfUrl]);

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

  // Collapse the URL bar accordion once a PDF finishes loading on mobile.
  useEffect(() => {
    if (isMobile && pdfUrl) setMobileUrlBarOpen(false);
  }, [pdfUrl, isMobile]);

  // Match the document background to the viewer's dark bg so overscroll
  // bounce (iOS rubber-band, macOS elastic scroll) shows the same colour
  // as the viewer chrome instead of the host page's white body background.
  useEffect(() => {
    if (typeof document === "undefined") return;
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
  }, [tokens.bg]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  const urlValid = /^https?:\/\//i.test(draftUrl.trim());

  return (
    <div
      className={className}
      style={shellStyle(tokens, false)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && <div style={dropOverlayStyle}>Drop your PDF here</div>}

      {/* Upload chrome. On narrow viewports the URL row stacks
          full-width with 44px touch targets. Hosts can suppress via
          `showUploadHeader={false}` to let the inner LensPDF top bar
          own the chrome — drag-drop continues to work as a swap path. */}
      {showUploadHeader && (
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
              {/* File-controls accordion toggle — icon reflects file state */}
              <button
                type="button"
                aria-label={
                  mobileUrlBarOpen
                    ? "Close file controls"
                    : pdfUrl
                      ? "Change file"
                      : "Open a PDF"
                }
                aria-expanded={mobileUrlBarOpen}
                onClick={() => setMobileUrlBarOpen((v) => !v)}
                style={{
                  flexShrink: 0,
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: `1px solid ${pdfUrl ? tokens.accent : tokens.border}`,
                  background: pdfUrl ? `${tokens.accent}22` : "transparent",
                  color: pdfUrl ? tokens.accent : tokens.fg,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: mobileUrlBarOpen ? 0.6 : 1,
                  transition: "opacity 0.15s",
                }}
              >
                {pdfUrl ? (
                  <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                    <path d="M4 2a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.414A1 1 0 0 0 12.707 6L9 2.293A1 1 0 0 0 8.586 2H4zm4 .5V6a1 1 0 0 0 1 1h3.5L8 2.5z" />
                  </svg>
                ) : (
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
                <div style={{ display: "flex", gap: 10, width: "100%" }}>
                  <button
                    type="submit"
                    disabled={!urlValid}
                    style={{
                      ...btnStyle(tokens, !urlValid),
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
                disabled={!urlValid}
                style={btnStyle(tokens, !urlValid)}
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

      {pdfUrl ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
          <LensPDF {...lensProps} pdfUrl={pdfUrl} />
        </div>
      ) : (
        <>
          <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
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
              <p
                style={{
                  fontSize: 11,
                  opacity: 0.55,
                  maxWidth: 460,
                  lineHeight: 1.55,
                  margin: 0,
                }}
              >
                LensPDF supports <strong>full CMYK + spot inks</strong>
                {" "}with no approximation when a backend (Ghostscript /
                MuPDF + ICC profiles) is wired through the{" "}
                <code>services</code> prop — the densitometer, TAC heatmap,
                and color picker read true plate values straight from the
                host. The RGB-derived path is only used as the fallback
                when no backend data is supplied, which is the mode this
                demo runs in. Annotations live in this tab only and are
                discarded on reload. Max upload {formatMaxSize(maxFileSize)}.
              </p>
            </div>
          </div>
          <footer style={footerStyle(tokens)}>
            <span>{effectiveBrand} &middot; AGPL-3.0</span>
            {lensProps.footer}
          </footer>
        </>
      )}
    </div>
  );
}
