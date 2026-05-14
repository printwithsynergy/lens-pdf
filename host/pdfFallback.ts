/**
 * In-browser PDF fallback adapter built on pdf.js.
 *
 * Provides "minimum data" for the fallback-capable tools (PageCanvas,
 * PageNavigator, MeasureTool, LayerPanel, ColorPickerTool) when a host
 * hasn't wired richer services. Hosts pass the returned adapter as
 * ``pdfFallback`` on the host context.
 *
 * pdf.js is loaded lazily via dynamic ``import("pdfjs-dist")`` so it
 * stays out of the bundle for hosts that don't use this fallback. Add
 * ``pdfjs-dist`` to your app's dependencies (it's an optional peer dep
 * of ``@printwithsynergy/lens-pdf``).
 *
 * **Security**: this adapter fetches whatever URL the host hands it.
 * Sign / scope / expire the URL the same way you would any other PDF
 * download — the viewer is a pure renderer and trusts the host to
 * enforce access control upstream.
 *
 * @public
 */

import type { ColorSample } from "../types";
import type { PdfFallbackAdapter } from "../plugin/services";

interface PdfJsLoader {
  // Minimal subset of the pdf.js v4 API we touch. Typed as `any` to
  // avoid pulling pdfjs-dist's types into core's dep tree.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDocument(args: { url: string }): { promise: Promise<any> };
  GlobalWorkerOptions: { workerSrc: string };
}

interface PdfJsModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default?: PdfJsLoader & Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

async function loadPdfJs(): Promise<PdfJsLoader> {
  // Dynamic import keeps pdfjs-dist out of the bundle for hosts that
  // don't use the fallback. The string literal is split so bundlers
  // that try to statically resolve the spec don't fail loudly when
  // pdfjs-dist isn't installed.
  const spec = "pdfjs" + "-dist";
  let mod: PdfJsModule;
  try {
    mod = (await import(/* @vite-ignore */ spec)) as PdfJsModule;
  } catch (err) {
    throw new Error(
      "[lens-pdf] createPdfJsFallback requires `pdfjs-dist` to be installed. " +
        "Add it to your app's dependencies, or omit `pdfFallback` from the host context.",
      { cause: err },
    );
  }
  const api = (mod.default ?? mod) as PdfJsLoader;
  if (!api.getDocument) {
    throw new Error("[lens-pdf] Loaded `pdfjs-dist` does not expose getDocument.");
  }
  return api;
}

interface PdfJsFallbackOptions {
  /** Raw PDF URL. Must be reachable from the user's browser. */
  pdfUrl: string;
  /**
   * Optional override for the pdf.js worker URL. When omitted, the
   * adapter assumes the bundler / host has already configured
   * ``GlobalWorkerOptions.workerSrc``.
   */
  workerSrc?: string;
}

/**
 * Build a {@link PdfFallbackAdapter} backed by pdf.js. The returned
 * adapter caches the parsed document and per-page rasters so repeated
 * calls don't re-parse or re-render.
 *
 * @deprecated Use ``createPdfJsFallback`` from
 *   ``@printwithsynergy/lens-pdf/fallback-pdfjs`` instead. The
 *   subpath imports pdfjs-dist statically so bundlers trace it
 *   correctly without consumers having to side-effect-import the
 *   dep. This `/host` export uses a dynamic ``await import("...")``
 *   that bundlers don't trace; works at runtime only when
 *   pdfjs-dist is also installed and resolvable from the consuming
 *   app's module graph. New code should not use this entry point.
 *
 * @public
 */
export function createPdfJsFallback(opts: PdfJsFallbackOptions): PdfFallbackAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let docPromise: Promise<any> | null = null;
  const renderCache = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function getDoc(): Promise<any> {
    if (!docPromise) {
      docPromise = (async () => {
        const api = await loadPdfJs();
        if (opts.workerSrc) api.GlobalWorkerOptions.workerSrc = opts.workerSrc;
        return api.getDocument({ url: opts.pdfUrl }).promise;
      })();
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

const sampleCanvases = new Map<string, HTMLCanvasElement>();
