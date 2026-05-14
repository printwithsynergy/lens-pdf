/**
 * `@printwithsynergy/lens-pdf/fallback-pdfjs`
 *
 * In-browser PDF fallback adapter built on pdf.js. Provides "minimum
 * data" (page count, dimensions, page rasters, OCG layers, RGB color
 * sampling) for the fallback-capable tools when a host hasn't wired
 * richer services.
 *
 * Distinct from the deprecated `createPdfJsFallback` re-export in
 * `/host`: this subpath imports `pdfjs-dist` statically, so bundlers
 * trace it correctly without the host having to side-effect-import
 * the dep themselves. Hosts that never use the fallback never import
 * this subpath and never pay the bundle cost.
 *
 * ```ts
 * import { createPdfJsFallback } from "@printwithsynergy/lens-pdf/fallback-pdfjs";
 * const fallback = createPdfJsFallback({ pdfUrl: "/proofs/abc.pdf" });
 * ```
 *
 * Usually you don't import this directly — `<LensPDFViewer>` uses
 * it internally and is the one-liner most hosts want.
 *
 * **Security**: this adapter fetches whatever URL the host hands it.
 * Sign / scope / expire the URL the same way you would any other PDF
 * download — the viewer is a pure renderer and trusts the host to
 * enforce access control upstream.
 *
 * @public
 */

import * as pdfjs from "pdfjs-dist";
import type { ColorSample } from "../types";
import type { PdfFallbackAdapter } from "../plugin/services";

/**
 * Default URL for the pdf.js worker, served via unpkg pinned to the
 * exact `pdfjs-dist` version this package was built against. Hosts
 * that don't want a runtime CDN dep can override via the
 * `workerSrc` option, set `pdfjs.GlobalWorkerOptions.workerSrc`
 * directly before constructing the adapter, or self-host the file.
 *
 * @public
 */
export const defaultPdfWorkerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfJsFallbackOptions {
  /** Raw PDF URL. Must be reachable from the user's browser. */
  pdfUrl: string;
  /**
   * Optional override for the pdf.js worker URL. Default:
   * {@link defaultPdfWorkerSrc}, an unpkg URL pinned to the bundled
   * pdfjs-dist version.
   */
  workerSrc?: string;
}

const sampleCanvases = new Map<string, HTMLCanvasElement>();

/**
 * Build a {@link PdfFallbackAdapter} backed by pdf.js. The returned
 * adapter caches the parsed document and per-page rasters so
 * repeated calls don't re-parse or re-render.
 *
 * @public
 */
export function createPdfJsFallback(opts: PdfJsFallbackOptions): PdfFallbackAdapter {
  // Configure the worker once. Idempotent — repeated calls with the
  // same value are no-ops.
  const workerSrc = opts.workerSrc ?? defaultPdfWorkerSrc;
  if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docPromise: Promise<any> | null = null;
  const renderCache = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function getDoc(): Promise<any> {
    if (!docPromise) {
      docPromise = pdfjs.getDocument({ url: opts.pdfUrl }).promise;
    }
    return docPromise;
  }

  return {
    async getPageCount() {
      const doc = await getDoc();
      return doc.numPages as number;
    },

    async getPageDimensions(pageNum: number) {
      const doc = await getDoc();
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      return { widthPts: viewport.width, heightPts: viewport.height };
    },

    async renderPageToUrl({ pageNum, dpi }) {
      const cacheKey = `${pageNum}@${dpi}`;
      const cached = renderCache.get(cacheKey);
      if (cached) return cached;

      const doc = await getDoc();
      const page = await doc.getPage(pageNum);
      const scale = dpi / 72;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("[lens-pdf] 2D context unavailable for fallback render.");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const url = canvas.toDataURL("image/png");
      renderCache.set(cacheKey, url);
      return url;
    },

    async listLayers() {
      const doc = await getDoc();
      // pdf.js exposes OCGs through the OptionalContentConfig. Older
      // versions / RGB-only PDFs simply have no groups → empty list.
      let config;
      try {
        config = await doc.getOptionalContentConfig();
      } catch {
        return [];
      }
      const groups = (config?.getGroups?.() ?? {}) as Record<string, { name?: string }>;
      const ids = Object.keys(groups);
      return ids.map((id, index) => ({
        name: groups[id]?.name ?? `Layer ${index + 1}`,
        ocg_index: index,
        default_on: config.isVisible(id) ?? true,
      }));
    },

    async sampleColorAt({ pageNum, pdfX, pdfY, dpi = 150 }) {
      const doc = await getDoc();
      const page = await doc.getPage(pageNum);
      const ptsToPx = dpi / 72;
      const viewport = page.getViewport({ scale: ptsToPx });

      // Render the whole page once per (page, dpi) and cache the
      // canvas — repeated sampling is then a single getImageData call.
      const canvasKey = `${pageNum}@${dpi}`;
      let canvas = sampleCanvases.get(canvasKey);
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const renderCtx = canvas.getContext("2d", { willReadFrequently: true });
        if (!renderCtx) return null;
        await page.render({ canvasContext: renderCtx, viewport }).promise;
        sampleCanvases.set(canvasKey, canvas);
      }

      // pdfX/pdfY use PDF-point coords with origin lower-left; canvas
      // pixels use origin upper-left.
      const pageHeightPts = viewport.height / ptsToPx;
      const pxX = Math.max(0, Math.min(canvas.width - 1, Math.round(pdfX * ptsToPx)));
      const pxY = Math.max(
        0,
        Math.min(canvas.height - 1, Math.round((pageHeightPts - pdfY) * ptsToPx)),
      );

      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      const data = ctx.getImageData(pxX, pxY, 1, 1).data;
      const r = data[0] ?? 0;
      const g = data[1] ?? 0;
      const b = data[2] ?? 0;
      const hex =
        "#" +
        [r, g, b]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("");
      const sample: ColorSample = {
        x: pdfX,
        y: pdfY,
        rgb: [r, g, b],
        hex,
        // pdf.js renders to RGB only — no real ink coverage available.
        tac: null,
      };
      return sample;
    },
  };
}
