"use client";

/**
 * `<LensPDF>` — drop-in production viewer.
 *
 * One mount, every viewer-only feature wired by default:
 *
 * ```tsx
 * import { LensPDF } from "@printwithsynergy/lens-pdf";
 * import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
 *
 * <LensPDF pdfUrl="/proofs/abc.pdf" workerSrc={pdfWorkerSrc} />
 * ```
 *
 * Production hosts can plug in their own preflight engine without
 * forking the viewer:
 *
 * ```tsx
 * <LensPDF
 *   pdfUrl="/proofs/abc.pdf"
 *   workerSrc={pdfWorkerSrc}
 *   items={findings}            // OverlayItem[] from your engine
 *   selectedItem={selected}
 *   onItemSelect={setSelected}
 *   dieline={dielineForCurrentPage}
 *   showBoxOverlays              // trim / bleed / crop popovers
 *   tools={["color-picker", "annotate", "tac-heatmap", "separations"]}
 *   onPageChange={setCurrentPage}
 *   tokens={{ accent: "#e50c6a" }}
 * />
 * ```
 *
 * Identical to {@link LensPDFDemo} except the upload chrome (URL bar,
 * file picker, drag-and-drop, empty state) is hidden — `pdfUrl` is the
 * single required prop, and changing it swaps the loaded document.
 *
 * @public
 */

import { LensPDFDemo, type LensPDFDemoProps } from "./LensPDFDemo";

/**
 * Props for {@link LensPDF}. Identical to {@link LensPDFDemoProps}
 * except `pdfUrl` is required (replaces `initialPdfUrl`) and the
 * upload-chrome props (`maxFileSize`) are hidden.
 *
 * @public
 */
export interface LensPDFProps
  extends Omit<LensPDFDemoProps, "embedded" | "initialPdfUrl" | "maxFileSize"> {
  /**
   * URL of the PDF to load. Any URL the browser can fetch — your
   * own CDN, a signed link, a `blob:` URL from a `File` your app
   * uploaded, etc. Changing this swaps the document and resets to
   * `initialPage`.
   */
  pdfUrl: string;
}

/**
 * Drop-in production viewer. See {@link LensPDFProps} for the full
 * prop surface.
 *
 * @public
 */
export function LensPDF({ pdfUrl, ...rest }: LensPDFProps) {
  return <LensPDFDemo {...rest} embedded preset="minimal" initialPdfUrl={pdfUrl} />;
}
