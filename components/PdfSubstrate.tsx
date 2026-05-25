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

// Required: react-pdf needs the pdf.js worker URL. We use the same
// pdfjs-dist version the host bundles. Worker module path is stable
// across pdf.js 5.x.
if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
}

/**
 * Fixed render scale for react-pdf. Higher = sharper when the user
 * zooms in via the TransformWrapper, at the cost of more memory.
 * 2× covers up to 200% display zoom without visible pixelation;
 * beyond that the user sees gentle blur (acceptable for a viewer).
 */
const RENDER_SCALE = 2;

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

  const documentLoading = (
    <div style={loadingStyle(tokens)}>Loading PDF…</div>
  );
  const documentError = (
    <div style={errorStyle(tokens)}>Failed to load PDF.</div>
  );
  const pageLoading = (
    <div style={loadingStyle(tokens)}>Loading page {pageNumber}…</div>
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
              options={documentOptions}
            >
              <Page
                pageNumber={pageNumber}
                scale={RENDER_SCALE}
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
