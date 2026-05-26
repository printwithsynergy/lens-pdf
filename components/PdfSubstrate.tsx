"use client";

/**
 * PDF rendering substrate — react-pdf + react-zoom-pan-pinch.
 *
 * Replaces the previous tile-fetch + canvas approach with Mozilla's
 * pdf.js renderer (via wojtekmaj/react-pdf) wrapped in a battle-
 * tested pan/zoom controller. This gives Acrobat-grade interactions:
 * one-finger pan, pinch-zoom, double-tap zoom, momentum scroll on
 * iOS Safari — all without the custom touch routing the old
 * implementation kept losing to mobile browser quirks.
 *
 * The substrate is geometry-pure: it renders a single PDF page at
 * a fixed internal resolution and lets the host position any number
 * of overlay children on top via the `overlay` slot. Overlays render
 * INSIDE the TransformComponent so they scale/pan with the page —
 * no per-overlay zoom math needed.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";
// CSS imports are side-effect-only — TS can't resolve type
// declarations for them, so use @ts-expect-error to silence.
// @ts-expect-error -- react-pdf ships CSS without .d.ts
import "react-pdf/dist/Page/AnnotationLayer.css";
// @ts-expect-error -- react-pdf ships CSS without .d.ts
import "react-pdf/dist/Page/TextLayer.css";
import type { ThemeTokens } from "../plugin/services";

// Required: react-pdf needs the pdf.js worker URL. react-pdf 10.x
// ships with a SENTINEL default of `"pdf.worker.mjs"` (a bare module
// name with no valid URL base), which is intentionally broken so
// consumers can't accidentally rely on it. A previous version of
// this file guarded with `!pdfjs.GlobalWorkerOptions.workerSrc`,
// which is false against the truthy sentinel — leaving the bogus
// value in place and producing the famous
// "Setting up fake worker failed: Module name, 'pdf.worker.mjs'
// does not resolve to a valid URL." error in every consumer build.
//
// Fix: replace the sentinel unconditionally. We only skip if the
// current value looks like a real URL (http://, https://, blob:,
// /), so hosts that want to ship a self-hosted worker can set
// `pdfjs.GlobalWorkerOptions.workerSrc` themselves before
// importing lens-pdf and their value wins.

/**
 * Default pdf.js worker URL — unpkg CDN pinned to the exact
 * `pdfjs-dist` version that `react-pdf` ships. Exported so hosts
 * can `<link rel="preload" as="script" href={defaultPdfjsWorkerSrc}>`
 * the worker alongside their HTML, removing the cold-start delay
 * before the first page paint.
 */
export const defaultPdfjsWorkerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

if (typeof window !== "undefined") {
  const current = pdfjs.GlobalWorkerOptions.workerSrc;
  const isRealUrl =
    typeof current === "string" &&
    /^(https?:|blob:|\/)/.test(current);
  if (!isRealUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = defaultPdfjsWorkerSrc;
  }
}

/**
 * Render scale for react-pdf — the multiplier from PDF points to
 * CSS pixels on the underlying canvas. Combined with the explicit
 * `devicePixelRatio = 1` below, a US Letter page renders to ~1.4
 * megapixels (~5.5 MB RGBA), well under iOS Safari's canvas
 * memory cap. Visual zoom beyond this is handled by the
 * TransformWrapper's CSS transform — pixellated past ~150% but
 * never crashes the tab, which is the right tradeoff for mobile.
 *
 * Hosts on desktop can raise this if they want crisper zoom; it's
 * a single edit when we wire it to a prop.
 */
const RENDER_SCALE = 1.5;

/**
 * Force `devicePixelRatio = 1` on react-pdf's canvas. Retina
 * devices default to DPR 2-3, which multiplies the raster size by
 * 4-9× and trips iOS Safari's per-canvas memory cap (~16 MP) on
 * even modest PDFs. We accept the slight blur in exchange for not
 * crashing the tab; visual sharpness during pinch-zoom is the
 * TransformWrapper's job.
 */
const DEVICE_PIXEL_RATIO = 1;

export interface PdfSubstrateProps {
  /** Source PDF — URL string, File, or { url, ... } object. Mirrors
   *  react-pdf's `Document.file` prop type. */
  file: string | File | { url: string };
  /** 1-indexed page number to display. */
  pageNumber: number;
  /** Current zoom percentage (e.g., 80 = 80%). Drives the
   *  TransformWrapper's CSS transform; the underlying canvas is
   *  rendered at RENDER_SCALE regardless. */
  zoom: number;
  /** Fires when the user pinches / double-taps / wheels — reports
   *  the new percentage so the host's zoom slider stays in sync. */
  onZoomChange?: (zoomPercent: number) => void;
  /** Fires once react-pdf has parsed the document. */
  onDocumentLoad?: (info: { numPages: number }) => void;
  /** Fires when a page has fully rendered (canvas drawn + text
   *  layer placed) — host uses this to mount overlays at the
   *  right time. */
  onPageRender?: (info: {
    pageNumber: number;
    /** Rendered page width in CSS px (canvas + text layer width). */
    width: number;
    /** Rendered page height in CSS px. */
    height: number;
    /** PDF page dimensions in points. */
    widthPts: number;
    heightPts: number;
  }) => void;
  /** Children rendered inside the TransformComponent on top of the
   *  PDF page. Use absolute positioning relative to the page (the
   *  parent has `position: relative` with `width=renderedWidth`,
   *  `height=renderedHeight`). All overlays scale + pan with the
   *  page automatically. */
  overlay?: ReactNode;
  /** Theme tokens for the loading / error states. */
  tokens: ThemeTokens;
  /** When true, suppress the TransformWrapper's pan + pinch — useful
   *  while an annotation / measurement tool needs exclusive touch
   *  input. */
  panEnabled?: boolean;
  pinchEnabled?: boolean;
  /** Optional className on the wrapper div. */
  className?: string;
}

interface RenderedPage {
  width: number;
  height: number;
  widthPts: number;
  heightPts: number;
}

function loadingStyle(tokens: ThemeTokens): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "100%",
    color: tokens.fg,
    opacity: 0.7,
    fontSize: 13,
  };
}

function errorStyle(tokens: ThemeTokens): CSSProperties {
  return {
    ...loadingStyle(tokens),
    color: "#fca5a5",
    opacity: 1,
  };
}

interface LoadingSkeletonProps {
  tokens: ThemeTokens;
  label: string;
}

/**
 * Branded loading state — a page-shaped skeleton with a shimmer
 * sweep + brand label. Much friendlier than the plain "Loading PDF…"
 * text the bare react-pdf prop slot used to render. Uses a US Letter
 * aspect ratio (8.5:11) since most demo PDFs are letter or close.
 */
function LoadingSkeleton({ tokens, label }: LoadingSkeletonProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        padding: 24,
        width: "100%",
        height: "100%",
        color: tokens.fg,
      }}
    >
      <div
        aria-hidden
        style={{
          position: "relative",
          width: "min(70vw, 280px)",
          aspectRatio: "8.5 / 11",
          maxHeight: "60%",
          borderRadius: 6,
          background: "rgba(255,255,255,0.04)",
          border: `1px solid ${tokens.border}`,
          overflow: "hidden",
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.35), 0 2px 6px rgba(0,0,0,0.25)",
        }}
      >
        {/* Skeleton text-line decoration so the placeholder reads
            as "a page" rather than a flat rectangle. */}
        <div
          style={{
            position: "absolute",
            inset: "12% 10% 12% 10%",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {[88, 64, 92, 50, 78, 70].map((w, i) => (
            <div
              key={i}
              style={{
                height: 8,
                width: `${w}%`,
                borderRadius: 3,
                background: "rgba(255,255,255,0.06)",
              }}
            />
          ))}
        </div>
        {/* Shimmer sweep — a translucent gradient slides across the
            placeholder to signal active work. Inline-keyframed via
            a <style> tag so we don't need a host CSS file. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
            animation: "lens-pdf-skel-sweep 1.6s ease-in-out infinite",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          opacity: 0.75,
          fontSize: 12,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            border: `2px solid ${tokens.border}`,
            borderTopColor: tokens.fg,
            animation: "lens-pdf-skel-spin 0.8s linear infinite",
          }}
        />
        <span>{label}</span>
      </div>
      <style>{`
        @keyframes lens-pdf-skel-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes lens-pdf-skel-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export function PdfSubstrate({
  file,
  pageNumber,
  zoom,
  onZoomChange,
  onDocumentLoad,
  onPageRender,
  overlay,
  tokens,
  panEnabled = true,
  pinchEnabled = true,
  className,
}: PdfSubstrateProps) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null);
  const [rendered, setRendered] = useState<RenderedPage | null>(null);

  // Sync external zoom prop → TransformWrapper. Only fires when the
  // host (zoom slider, keyboard shortcut) changes the value; native
  // gestures emit via onZoom which the host should mirror back.
  useEffect(() => {
    const ref = transformRef.current;
    if (!ref) return;
    const currentScale = ref.state.scale;
    const targetScale = zoom / 100;
    if (Math.abs(currentScale - targetScale) < 0.005) return;
    ref.setTransform(ref.state.positionX, ref.state.positionY, targetScale, 0);
  }, [zoom]);

  const handleDocumentLoad = useCallback(
    (pdf: { numPages: number }) => {
      onDocumentLoad?.({ numPages: pdf.numPages });
    },
    [onDocumentLoad],
  );

  const handlePageLoadSuccess = useCallback(
    (page: {
      width: number;
      height: number;
      originalWidth: number;
      originalHeight: number;
    }) => {
      const info: RenderedPage = {
        width: page.width,
        height: page.height,
        widthPts: page.originalWidth,
        heightPts: page.originalHeight,
      };
      setRendered(info);
      onPageRender?.({ pageNumber, ...info });
    },
    [onPageRender, pageNumber],
  );

  const handleZoomChange = useCallback(
    (ref: ReactZoomPanPinchRef) => {
      const next = Math.round(ref.state.scale * 100);
      // Throttle: only emit when changed by ≥1% to avoid render
      // storms during continuous gestures.
      if (Math.abs(next - zoom) >= 1) {
        onZoomChange?.(next);
      }
    },
    [onZoomChange, zoom],
  );

  // Memoize Document options so react-pdf doesn't tear down and
  // reload the PDF on every render.
  const documentOptions = useMemo(
    () => ({
      // Empty object — kept stable to satisfy react-pdf's strict
      // change detection (it warns if the options ref changes).
    }),
    [],
  );

  const [loadError, setLoadError] = useState<string | null>(null);

  const handleLoadError = useCallback((error: Error) => {
    // Surface the underlying reason so we can debug worker /
    // network / parse failures from a screenshot instead of having
    // to attach a remote debugger.
    setLoadError(error.message || String(error));
  }, []);

  const documentLoading = (
    <LoadingSkeleton tokens={tokens} label="Loading PDF…" />
  );
  const documentError = (
    <div style={{ ...errorStyle(tokens), padding: 16, textAlign: "center" }}>
      <div>Failed to load PDF.</div>
      {loadError && (
        <div
          style={{
            fontSize: 11,
            opacity: 0.75,
            marginTop: 8,
            maxWidth: 360,
            wordBreak: "break-word",
          }}
        >
          {loadError}
        </div>
      )}
    </div>
  );
  const pageLoading = (
    <LoadingSkeleton tokens={tokens} label={`Rendering page ${pageNumber}…`} />
  );

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: tokens.bg,
        position: "relative",
      }}
    >
      <TransformWrapper
        ref={transformRef}
        initialScale={zoom / 100}
        minScale={0.25}
        maxScale={4}
        centerOnInit
        wheel={{ step: 0.15 }}
        pinch={{ disabled: !pinchEnabled, step: 5 }}
        panning={{
          disabled: !panEnabled,
          velocityDisabled: false,
          // Without this, single-finger drags on text layer get
          // intercepted as selection instead of pan on mobile.
          allowLeftClickPan: true,
          allowMiddleClickPan: false,
          allowRightClickPan: false,
        }}
        doubleClick={{ step: 0.7, mode: "toggle" }}
        onZoom={handleZoomChange}
        onPanningStop={handleZoomChange}
        limitToBounds={false}
      >
        <TransformComponent
          wrapperStyle={{ width: "100%", height: "100%" }}
          contentStyle={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "relative",
              background: "#fff",
              boxShadow:
                "0 24px 60px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.3)",
              borderRadius: 4,
            }}
          >
            <Document
              file={file}
              loading={documentLoading}
              error={documentError}
              onLoadSuccess={handleDocumentLoad}
              onLoadError={handleLoadError}
              onSourceError={handleLoadError}
              options={documentOptions}
            >
              <Page
                pageNumber={pageNumber}
                scale={RENDER_SCALE}
                devicePixelRatio={DEVICE_PIXEL_RATIO}
                onLoadSuccess={handlePageLoadSuccess}
                loading={pageLoading}
                renderTextLayer
                renderAnnotationLayer
              />
            </Document>
            {rendered && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                }}
              >
                {/* Overlays render inside the TransformComponent so
                    they pan/zoom with the page. pointer-events:none
                    on the wrapper lets the page's text layer keep
                    receiving selection gestures; individual overlays
                    re-enable pointer-events on their own elements
                    when interactive. */}
                <div style={{ pointerEvents: "auto" }}>{overlay}</div>
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
