/**
 * `@printwithsynergy/loupe-pdf/browser`
 *
 * Browser-only ViewerServices factory. One call gives you a fully
 * wired {@link ViewerServices} instance backed by pdf.js — every
 * tool the package ships (page raster, layers, separations, TAC
 * heatmap, color picker, densitometer, in-browser annotations)
 * works against any PDF the browser can fetch, without a server
 * backend.
 *
 * ```ts
 * import { createBrowserViewerServices } from "@printwithsynergy/loupe-pdf/browser";
 * const services = createBrowserViewerServices({ pdfUrl: "/proofs/abc.pdf" });
 * await services.prepare(1); // pre-warm separations + heatmap + layers for page 1
 * // <ViewerServicesContext.Provider value={services}> ... </Provider>
 * services.dispose(); // free blob URLs / pdf.js doc on unmount
 * ```
 *
 * Server-only features (true ICC separations, preflight findings,
 * server-persisted annotations, PDF report exports) are explicitly
 * left as `markUnwired` no-ops; their components self-hide.
 *
 * The CMYK numbers here are **rich-black approximations**, not ICC.
 * Solid black RGB(0,0,0) reads as C=100, M=100, Y=100, K=80, TAC≈380%
 * — close enough to a press CMYK rich-black to make the TAC heatmap
 * and densitometer behave like their real backends. Production
 * hosts wire a Ghostscript / MuPDF backend for ICC-correct readings.
 *
 * **Security**: this factory fetches whatever URL the host hands it.
 * Sign / scope / expire the URL the same way you would any other PDF
 * download — the viewer is a pure renderer and trusts the host to
 * enforce access control upstream.
 *
 * @public
 */

import { useEffect, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { ColorSample, DensitometerSample } from "../types";
import {
  markUnwired,
  noopI18n,
  noopTelemetry,
  type AnnotationEntry,
  type ThemeTokens,
  type ViewerServices,
} from "../plugin/services";
import { defaultThemeTokens } from "../plugin/services";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** DPI used for color sampling, separations, TAC heatmap. Higher → more
 *  fidelity, more memory; 200 is a good balance for screen review. */
const ANALYSIS_DPI = 200;

/**
 * "Rich black" K factor. Press rich blacks land somewhere between
 * 60 % and 100 % K with the rest filled in by C/M/Y; 0.8 gives
 * realistic densitometer readings and a TAC heatmap that actually
 * trips on solid-black artwork (TAC ≈ 380 % on RGB(0,0,0)).
 */
const K_FACTOR = 0.8;

/** Process inks the demo synthesises from RGB. Spot inks aren't
 *  recoverable from a rasterised RGB image so they're not advertised. */
export const PROCESS_CHANNELS = ["Cyan", "Magenta", "Yellow", "Black"] as const;

/**
 * Default URL for the pdf.js worker, served via unpkg pinned to the
 * exact `pdfjs-dist` version this package was built against. Hosts
 * that don't want a runtime CDN dep can override via the
 * `workerSrc` option, set `pdfjs.GlobalWorkerOptions.workerSrc`
 * directly before constructing the services, or self-host the file.
 *
 * @public
 */
export const defaultBrowserWorkerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/** 1×1 transparent PNG — returned by `getPageImageUrl` while a tile
 *  is still being lazy-built. Page raster tiles are reactive (the
 *  PageCanvas re-renders on `notify`), so a placeholder bridges the
 *  brief gap until the real URL arrives. The OTHER URL builders
 *  (channel / heatmap / layer) are NOT placeholdered — those are
 *  consumed by canvases that cache the first loaded image and never
 *  retry, so a placeholder there would stick forever. Hosts must
 *  call `prepare(pageNum)` to pre-build them. */
const PLACEHOLDER_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// ---------------------------------------------------------------------------
// CMYK approximation
// ---------------------------------------------------------------------------

/**
 * Convert an sRGB triplet to a CMYK approximation. Uses an additive
 * decomposition with a "rich-black" K plate:
 *
 *   C = 1 - R/255
 *   M = 1 - G/255
 *   Y = 1 - B/255
 *   K = min(C, M, Y) × {@link K_FACTOR}
 *   TAC = (C + M + Y + K) × 100   // [0, 380]
 *
 * Returns each ink in [0, 1] and total area coverage as a percentage
 * in [0, 380].
 *
 * This is intentionally NOT a GCR substitution — keeping the full
 * C/M/Y values lets the TAC heatmap actually trip on solid-black
 * artwork instead of bottoming out at 100 % from K alone, which is
 * the behaviour print-prepress reviewers expect.
 *
 * @public
 */
export function rgbToCmyk(
  r: number,
  g: number,
  b: number,
): { c: number; m: number; y: number; k: number; tac: number } {
  const c = 1 - r / 255;
  const m = 1 - g / 255;
  const y = 1 - b / 255;
  const k = Math.min(c, m, y) * K_FACTOR;
  return { c, m, y, k, tac: (c + m + y + k) * 100 };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface AnalysisRaster {
  pageNum: number;
  widthPts: number;
  heightPts: number;
  widthPx: number;
  heightPx: number;
  rgba: ImageData;
}

async function rasterizeBlobUrl(
  width: number,
  height: number,
  fill: (i: number) => [number, number, number, number],
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("[loupe-pdf] 2D context unavailable.");
  const out = ctx.createImageData(width, height);
  const total = width * height;
  for (let p = 0; p < total; p++) {
    const i = p * 4;
    const [r, g, b, a] = fill(i);
    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
    out.data[i + 3] = a;
  }
  ctx.putImageData(out, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("[loupe-pdf] toBlob returned null"))),
      "image/png",
    ),
  );
  return URL.createObjectURL(blob);
}

/**
 * Heatmap colour stops. Tuned for the rich-black TAC formula:
 *   < 200 %      → green (clean)
 *   200–limit    → amber (watch)
 *   ≥ limit      → red   (over the press limit)
 */
function heatmapColor(
  tac: number,
  limit: number,
): [number, number, number, number] {
  if (tac < 200) return [0, 180, 0, 200];
  if (tac < limit) return [255, 200, 0, 200];
  return [255, 0, 0, 220];
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Options for {@link createBrowserViewerServices}.
 *
 * @public
 */
export interface BrowserViewerServicesOptions {
  /** Raw PDF URL the browser can fetch. */
  pdfUrl: string;
  /**
   * Optional override for the pdf.js worker URL. Default:
   * {@link defaultBrowserWorkerSrc}.
   */
  workerSrc?: string;
  /**
   * Theme tokens to expose on `services.tokens`. Defaults to the
   * package's neutral light palette.
   */
  tokens?: ThemeTokens;
  /**
   * Default TAC limit (in percent) used when the host doesn't specify
   * one explicitly. The TAC heatmap and densitometer both respect the
   * per-call value first; this is only used when the call site omits
   * it. Default 300 — typical sheet-fed press limit.
   */
  tacLimit?: number;
  /**
   * Email used as the synthetic author for the in-browser annotation
   * service. Default: `"you@browser.local"`.
   */
  annotationAuthorEmail?: string;
}

/**
 * Augmented `ViewerServices` returned by {@link createBrowserViewerServices}.
 * Extends the wire protocol with lifecycle helpers, a subscription
 * hook that fires whenever a lazily-built tile URL becomes available,
 * and a `prepare()` method that pre-warms the analysis raster, every
 * channel, the TAC heatmap, and (if the PDF has OCGs) every layer
 * for a given page.
 *
 * @public
 */
export interface BrowserViewerServices extends ViewerServices {
  /** How many pages the underlying PDF has (resolves once parsed). */
  getPageCount(): Promise<number>;
  /** Page dimensions in PDF points for `pageNum` (1-indexed). */
  getPageDimensions(pageNum: number): Promise<{ widthPts: number; heightPts: number }>;
  /**
   * Pre-build analysis raster + every CMYK channel image + the TAC
   * heatmap + every layer image for `pageNum`. Resolves once they're
   * all cached so the synchronous URL builders return real blob URLs
   * rather than placeholders. Hosts mounting `<SeparationCanvas>`,
   * `<TACHeatmapOverlay>`, or `<LayerCanvas>` should `await` this
   * before mounting the canvas — those components cache the first
   * loaded image and never retry on URL change.
   */
  prepare(
    pageNum: number,
    opts?: { tacLimit?: number },
  ): Promise<{
    widthPts: number;
    heightPts: number;
    layerCount: number;
  }>;
  /**
   * Subscribe to "URL available" notifications. Components that read
   * synchronous URL builders (`pageImages.getPageImageUrl` in
   * particular) should re-render on each event so the next builder
   * call returns the freshly-cached blob URL instead of the
   * placeholder.
   */
  subscribe(listener: () => void): () => void;
  /** Free every blob URL the services minted. Call on unmount. */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a fully-wired {@link ViewerServices} backed by pdf.js. Every
 * service the package consumes is implemented; consumers can drop the
 * returned object straight into a `<ViewerServicesContext.Provider>`
 * and every viewer-only feature works.
 *
 * @public
 */
export function createBrowserViewerServices(
  opts: BrowserViewerServicesOptions,
): BrowserViewerServices {
  const tokens = opts.tokens ?? defaultThemeTokens;
  const defaultTacLimit = opts.tacLimit ?? 300;
  const authorEmail = opts.annotationAuthorEmail ?? "you@browser.local";
  const workerSrc = opts.workerSrc ?? defaultBrowserWorkerSrc;

  if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  }

  // ── State ────────────────────────────────────────────────────────────
  let docPromise: Promise<pdfjs.PDFDocumentProxy> | null = null;
  // Keyed `${pageNum}@${dpi}` — page raster blob URLs for `pageImages`.
  const pageUrls = new Map<string, string>();
  const pageBuilds = new Map<string, Promise<string>>();
  // Keyed by page — the "analysis" raster used for color sample,
  // densitometer, separations, and the TAC heatmap. Always rendered
  // at ANALYSIS_DPI so reads don't depend on what the page-image cache
  // happens to contain.
  const analysisRasters = new Map<number, AnalysisRaster>();
  const analysisBuilds = new Map<number, Promise<AnalysisRaster>>();
  // Keyed `${pageNum}|${channelName}` — channel image blob URLs.
  const channelUrls = new Map<string, string>();
  const channelBuilds = new Map<string, Promise<string>>();
  // Keyed `${pageNum}|${tacLimit}` — TAC heatmap blob URLs.
  const heatmapUrls = new Map<string, string>();
  const heatmapBuilds = new Map<string, Promise<string>>();
  // Per-page OCG metadata — id list keeps draw order; index → id map
  // lets the layer URL builder re-key by ocg_index (the public API).
  const ocgIdsPerPage = new Map<number, string[]>();
  // Keyed `${pageNum}|${layerIndex}` — single-layer transparent PNGs.
  const layerUrls = new Map<string, string>();
  const layerBuilds = new Map<string, Promise<string>>();
  // In-memory annotation store — single anonymous author per page.
  const annotations = new Map<number, AnnotationEntry>();
  // Subscribers notified when a URL becomes available so consumers can
  // re-render and pick up the fresh blob URL.
  const subscribers = new Set<() => void>();
  // All blob URLs we've created (so dispose() can revoke them all).
  const blobs: string[] = [];

  function notify() {
    for (const cb of subscribers) cb();
  }

  // ── pdf.js helpers ───────────────────────────────────────────────────

  async function getDoc(): Promise<pdfjs.PDFDocumentProxy> {
    if (!docPromise) {
      docPromise = pdfjs.getDocument({ url: opts.pdfUrl })
        .promise as Promise<pdfjs.PDFDocumentProxy>;
    }
    return docPromise;
  }

  async function buildPageUrl(pageNum: number, dpi: number): Promise<string> {
    const doc = await getDoc();
    const page = await doc.getPage(pageNum);
    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[loupe-pdf] 2D context unavailable for page raster.");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("[loupe-pdf] page toBlob null"))),
        "image/png",
      ),
    );
    const url = URL.createObjectURL(blob);
    blobs.push(url);
    return url;
  }

  async function buildAnalysisRaster(pageNum: number): Promise<AnalysisRaster> {
    const doc = await getDoc();
    const page = await doc.getPage(pageNum);
    const baseViewport = page.getViewport({ scale: 1 });
    const widthPts = baseViewport.width;
    const heightPts = baseViewport.height;
    const ptsToPx = ANALYSIS_DPI / 72;
    const viewport = page.getViewport({ scale: ptsToPx });
    const widthPx = Math.ceil(viewport.width);
    const heightPx = Math.ceil(viewport.height);
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("[loupe-pdf] 2D context unavailable for analysis raster.");
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const rgba = ctx.getImageData(0, 0, widthPx, heightPx);
    return { pageNum, widthPts, heightPts, widthPx, heightPx, rgba };
  }

  async function getAnalysisRaster(pageNum: number): Promise<AnalysisRaster> {
    const cached = analysisRasters.get(pageNum);
    if (cached) return cached;
    const inflight = analysisBuilds.get(pageNum);
    if (inflight) return inflight;
    const promise = buildAnalysisRaster(pageNum).then((raster) => {
      analysisRasters.set(pageNum, raster);
      analysisBuilds.delete(pageNum);
      return raster;
    });
    analysisBuilds.set(pageNum, promise);
    return promise;
  }

  // ── Lazy URL helpers ─────────────────────────────────────────────────

  function ensurePageUrl(pageNum: number, dpi: number): void {
    const key = `${pageNum}@${dpi}`;
    if (pageUrls.has(key) || pageBuilds.has(key)) return;
    const promise = buildPageUrl(pageNum, dpi)
      .then((url) => {
        pageUrls.set(key, url);
        pageBuilds.delete(key);
        notify();
        return url;
      })
      .catch((err) => {
        pageBuilds.delete(key);
        // eslint-disable-next-line no-console
        console.error("[loupe-pdf] page raster failed", err);
        throw err;
      });
    pageBuilds.set(key, promise);
  }

  async function buildChannelUrl(
    pageNum: number,
    channelName: string,
  ): Promise<string> {
    const lower = channelName.toLowerCase();
    const channelIndex =
      lower === "cyan"
        ? 0
        : lower === "magenta"
          ? 1
          : lower === "yellow"
            ? 2
            : lower === "black"
              ? 3
              : -1;
    const raster = await getAnalysisRaster(pageNum);
    const data = raster.rgba.data;
    const url = await rasterizeBlobUrl(raster.widthPx, raster.heightPx, (i) => {
      if (channelIndex < 0) return [255, 255, 255, 255];
      const r = data[i] ?? 255;
      const g = data[i + 1] ?? 255;
      const b = data[i + 2] ?? 255;
      const cmyk = rgbToCmyk(r, g, b);
      const ink =
        channelIndex === 0
          ? cmyk.c
          : channelIndex === 1
            ? cmyk.m
            : channelIndex === 2
              ? cmyk.y
              : cmyk.k;
      const grey = Math.max(0, Math.min(255, Math.round(255 * (1 - ink))));
      return [grey, grey, grey, 255];
    });
    blobs.push(url);
    return url;
  }

  function ensureChannelUrl(pageNum: number, channelName: string): Promise<string> {
    const key = `${pageNum}|${channelName}`;
    const cached = channelUrls.get(key);
    if (cached) return Promise.resolve(cached);
    const inflight = channelBuilds.get(key);
    if (inflight) return inflight;
    const promise = buildChannelUrl(pageNum, channelName)
      .then((url) => {
        channelUrls.set(key, url);
        channelBuilds.delete(key);
        notify();
        return url;
      })
      .catch((err) => {
        channelBuilds.delete(key);
        // eslint-disable-next-line no-console
        console.error("[loupe-pdf] channel raster failed", err);
        throw err;
      });
    channelBuilds.set(key, promise);
    return promise;
  }

  async function buildHeatmapUrl(
    pageNum: number,
    tacLimit: number,
  ): Promise<string> {
    const raster = await getAnalysisRaster(pageNum);
    const data = raster.rgba.data;
    const url = await rasterizeBlobUrl(raster.widthPx, raster.heightPx, (i) => {
      const r = data[i] ?? 255;
      const g = data[i + 1] ?? 255;
      const b = data[i + 2] ?? 255;
      const { tac } = rgbToCmyk(r, g, b);
      if (tac < 1) return [0, 0, 0, 0];
      return heatmapColor(tac, tacLimit);
    });
    blobs.push(url);
    return url;
  }

  function ensureHeatmapUrl(pageNum: number, tacLimit: number): Promise<string> {
    const key = `${pageNum}|${tacLimit}`;
    const cached = heatmapUrls.get(key);
    if (cached) return Promise.resolve(cached);
    const inflight = heatmapBuilds.get(key);
    if (inflight) return inflight;
    const promise = buildHeatmapUrl(pageNum, tacLimit)
      .then((url) => {
        heatmapUrls.set(key, url);
        heatmapBuilds.delete(key);
        notify();
        return url;
      })
      .catch((err) => {
        heatmapBuilds.delete(key);
        // eslint-disable-next-line no-console
        console.error("[loupe-pdf] heatmap raster failed", err);
        throw err;
      });
    heatmapBuilds.set(key, promise);
    return promise;
  }

  // ── Layer rendering (single OCG with transparent bg) ─────────────────

  async function getOcgIds(pageNum: number): Promise<string[]> {
    const cached = ocgIdsPerPage.get(pageNum);
    if (cached) return cached;
    try {
      const doc = await getDoc();
      const config = await doc.getOptionalContentConfig();
      const groups = (config?.getGroups?.() ?? {}) as Record<
        string,
        { name?: string }
      >;
      const ids = Object.keys(groups);
      ocgIdsPerPage.set(pageNum, ids);
      return ids;
    } catch {
      ocgIdsPerPage.set(pageNum, []);
      return [];
    }
  }

  async function buildLayerUrl(
    pageNum: number,
    layerIndex: number,
    dpi: number,
  ): Promise<string> {
    const ids = await getOcgIds(pageNum);
    if (layerIndex < 0 || layerIndex >= ids.length) {
      throw new Error(`[loupe-pdf] layer ${layerIndex} out of range`);
    }
    const targetId = ids[layerIndex];
    const doc = await getDoc();
    const page = await doc.getPage(pageNum);

    // pdf.js render() accepts a `optionalContentConfigPromise` so we
    // can flip every other OCG off and render the chosen group in
    // isolation. The base config exposes `setVisibility(id, visible)`
    // mutators directly on the result of getOptionalContentConfig().
    const config = await doc.getOptionalContentConfig();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cfgAny = config as any;
    if (typeof cfgAny.setVisibility === "function") {
      for (const id of ids) cfgAny.setVisibility(id, id === targetId);
    } else if (typeof cfgAny.setOCGState === "function") {
      // older pdf.js: { state: [["set", id, visible], ...] }
      const state = ids.map((id) => ["set", id, id === targetId]);
      cfgAny.setOCGState({ state });
    }

    const scale = dpi / 72;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("[loupe-pdf] 2D context unavailable for layer raster.");
    }
    // No paper fill — caller composites layers over their own
    // white-paper canvas via source-over blending. Transparent bg
    // means hidden layers reveal the canvas underneath.
    await page.render({
      canvasContext: ctx,
      viewport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      optionalContentConfigPromise: Promise.resolve(config) as any,
      background: "rgba(0,0,0,0)" as unknown as string,
    } as Parameters<typeof page.render>[0]).promise;

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("[loupe-pdf] layer toBlob null"))),
        "image/png",
      ),
    );
    const url = URL.createObjectURL(blob);
    blobs.push(url);
    return url;
  }

  function ensureLayerUrl(
    pageNum: number,
    layerIndex: number,
    dpi: number,
  ): Promise<string> {
    const key = `${pageNum}|${layerIndex}@${dpi}`;
    const cached = layerUrls.get(key);
    if (cached) return Promise.resolve(cached);
    const inflight = layerBuilds.get(key);
    if (inflight) return inflight;
    const promise = buildLayerUrl(pageNum, layerIndex, dpi)
      .then((url) => {
        layerUrls.set(key, url);
        layerBuilds.delete(key);
        notify();
        return url;
      })
      .catch((err) => {
        layerBuilds.delete(key);
        // eslint-disable-next-line no-console
        console.error("[loupe-pdf] layer raster failed", err);
        throw err;
      });
    layerBuilds.set(key, promise);
    return promise;
  }

  // ── Sample helpers ───────────────────────────────────────────────────

  async function sampleAt(
    pageNum: number,
    pdfX: number,
    pdfY: number,
  ): Promise<{
    rgb: [number, number, number];
    cmyk: { c: number; m: number; y: number; k: number };
    tac: number;
    hex: string;
  } | null> {
    const raster = await getAnalysisRaster(pageNum);
    const ptsToPx = ANALYSIS_DPI / 72;
    const pxX = Math.max(
      0,
      Math.min(raster.widthPx - 1, Math.round(pdfX * ptsToPx)),
    );
    const pxY = Math.max(
      0,
      Math.min(
        raster.heightPx - 1,
        Math.round((raster.heightPts - pdfY) * ptsToPx),
      ),
    );
    const i = (pxY * raster.widthPx + pxX) * 4;
    const r = raster.rgba.data[i] ?? 255;
    const g = raster.rgba.data[i + 1] ?? 255;
    const b = raster.rgba.data[i + 2] ?? 255;
    const cmyk = rgbToCmyk(r, g, b);
    const hex =
      "#" +
      [r, g, b]
        .map((v) => v.toString(16).padStart(2, "0"))
        .join("")
        .toUpperCase();
    return {
      rgb: [r, g, b] as [number, number, number],
      cmyk: { c: cmyk.c, m: cmyk.m, y: cmyk.y, k: cmyk.k },
      tac: cmyk.tac,
      hex,
    };
  }

  // ── ViewerServices impl ──────────────────────────────────────────────

  const services: BrowserViewerServices = {
    pageImages: {
      getPageImageUrl: ({ pageNum, dpi }) => {
        const key = `${pageNum}@${dpi}`;
        const cached = pageUrls.get(key);
        if (cached) return cached;
        ensurePageUrl(pageNum, dpi);
        return PLACEHOLDER_PNG;
      },
    },
    layers: {
      getLayerImageUrl: ({ pageNum, layerIndex, dpi }) => {
        const key = `${pageNum}|${layerIndex}@${dpi}`;
        const cached = layerUrls.get(key);
        if (cached) return cached;
        // No placeholder — LayerCanvas caches the first-loaded image
        // and never retries, so a placeholder would stick. Hosts
        // should `await services.prepare(pageNum)` before mounting
        // <LayerCanvas>; consumers calling cold get an empty string
        // and the canvas just paints paper-white.
        ensureLayerUrl(pageNum, layerIndex, dpi);
        return "";
      },
      listLayers: async () => {
        try {
          const doc = await getDoc();
          const config = await doc.getOptionalContentConfig();
          const groups = (config?.getGroups?.() ?? {}) as Record<
            string,
            { name?: string }
          >;
          const ids = Object.keys(groups);
          ocgIdsPerPage.set(1, ids);
          return ids.map((id, index) => ({
            name: groups[id]?.name ?? `Layer ${index + 1}`,
            ocg_index: index,
            default_on: config?.isVisible(id) ?? true,
          }));
        } catch {
          return [];
        }
      },
    },
    separations: {
      getChannelImageUrl: ({ pageNum, channelName }) => {
        const key = `${pageNum}|${channelName}`;
        const cached = channelUrls.get(key);
        if (cached) return cached;
        // Same caching gotcha as layers — no placeholder. Hosts call
        // `prepare(pageNum)` before mounting <SeparationCanvas>.
        ensureChannelUrl(pageNum, channelName);
        return "";
      },
    },
    tacHeatmap: {
      getHeatmapImageUrl: ({ pageNum, tacLimit }) => {
        const limit = tacLimit ?? defaultTacLimit;
        const key = `${pageNum}|${limit}`;
        const cached = heatmapUrls.get(key);
        if (cached) return cached;
        ensureHeatmapUrl(pageNum, limit);
        return "";
      },
      // pdf.js renderer doesn't expose per-text-run bboxes the same
      // way poppler does, so the demo skips the run tooltips. The
      // pixel heatmap still works.
      listRuns: async () => [],
    },
    colorSample: {
      sampleAt: async ({ pageNum, pdfX, pdfY }) => {
        const sample = await sampleAt(pageNum, pdfX, pdfY);
        if (!sample) return null;
        const out: ColorSample = {
          x: pdfX,
          y: pdfY,
          rgb: sample.rgb,
          hex: sample.hex,
          tac: Math.round(sample.tac * 10) / 10,
        };
        return out;
      },
    },
    densitometer: {
      sampleAt: async ({ pageNum, pdfX, pdfY, tacLimit }) => {
        const limit = tacLimit ?? defaultTacLimit;
        const sample = await sampleAt(pageNum, pdfX, pdfY);
        if (!sample) {
          throw new Error("Sampling failed for this point.");
        }
        const out: DensitometerSample = {
          x: pdfX,
          y: pdfY,
          dpi: ANALYSIS_DPI,
          channels: [
            { name: "Cyan", percent: sample.cmyk.c * 100 },
            { name: "Magenta", percent: sample.cmyk.m * 100 },
            { name: "Yellow", percent: sample.cmyk.y * 100 },
            { name: "Black", percent: sample.cmyk.k * 100 },
          ],
          tac: sample.tac,
          tac_limit: limit,
          limit_exceeded: sample.tac > limit,
        };
        return out;
      },
    },
    annotations: {
      list: async () =>
        Array.from(annotations.values()).sort((a, b) => a.pageNum - b.pageNum),
      getForPage: async (pageNum) => annotations.get(pageNum) ?? null,
      saveForPage: async (pageNum, fabricJson) => {
        const now = new Date().toISOString();
        const existing = annotations.get(pageNum);
        if (existing) {
          annotations.set(pageNum, {
            ...existing,
            fabricJson,
            updatedAt: now,
          });
          notify();
          return;
        }
        annotations.set(pageNum, {
          id: `browser-${pageNum}`,
          jobId: "browser",
          pageNum,
          authorEmail: authorEmail,
          authorName: "You",
          createdAt: now,
          updatedAt: now,
          fabricJson,
        });
        notify();
      },
      remove: async (id) => {
        for (const [page, entry] of annotations) {
          if (entry.id === id) {
            annotations.delete(page);
            notify();
            return;
          }
        }
      },
    },
    // Reports require a server-side renderer (HTML report dashboard +
    // PDF export) — leave as no-op so the toolbar items self-hide.
    reports: markUnwired({
      getHtmlReportUrl: () => "",
      getPdfDownloadUrl: () => "",
    }),
    telemetry: noopTelemetry,
    i18n: noopI18n,
    tokens,

    // ── Lifecycle / metadata extensions ──────────────────────────────
    async getPageCount() {
      const doc = await getDoc();
      return doc.numPages;
    },
    async getPageDimensions(pageNum: number) {
      const doc = await getDoc();
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      return { widthPts: viewport.width, heightPts: viewport.height };
    },
    async prepare(pageNum: number, prepareOpts?: { tacLimit?: number }) {
      const limit = prepareOpts?.tacLimit ?? defaultTacLimit;
      const raster = await getAnalysisRaster(pageNum);
      const ids = await getOcgIds(pageNum);
      // Channels + heatmap can run in parallel — they all read from
      // the same analysis raster which is already cached above.
      // Layers MUST be serialised because pdf.js's
      // OptionalContentConfig has shared mutable state for visibility.
      await Promise.all([
        ...PROCESS_CHANNELS.map((c) => ensureChannelUrl(pageNum, c)),
        ensureHeatmapUrl(pageNum, limit),
      ]);
      for (let layerIndex = 0; layerIndex < ids.length; layerIndex++) {
        await ensureLayerUrl(pageNum, layerIndex, ANALYSIS_DPI);
      }
      return {
        widthPts: raster.widthPts,
        heightPts: raster.heightPts,
        layerCount: ids.length,
      };
    },
    subscribe(listener: () => void) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose() {
      for (const url of blobs) URL.revokeObjectURL(url);
      blobs.length = 0;
      pageUrls.clear();
      pageBuilds.clear();
      analysisRasters.clear();
      analysisBuilds.clear();
      channelUrls.clear();
      channelBuilds.clear();
      heatmapUrls.clear();
      heatmapBuilds.clear();
      layerUrls.clear();
      layerBuilds.clear();
      ocgIdsPerPage.clear();
      annotations.clear();
      subscribers.clear();
      docPromise = null;
    },
  };

  return services;
}

// ---------------------------------------------------------------------------
// React helpers
// ---------------------------------------------------------------------------

/**
 * React hook that re-renders whenever a {@link BrowserViewerServices}
 * instance fires a `subscribe` event (i.e. a lazily-built page tile,
 * channel image, heatmap, or annotation has become available).
 *
 * Use this in the top-level component that holds the services instance
 * so children re-read the synchronous URL builders and pick up freshly-
 * cached blob URLs.
 *
 * @public
 */
export function useBrowserViewerServicesVersion(
  services: BrowserViewerServices | null | undefined,
): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!services) return;
    return services.subscribe(() => setV((x) => x + 1));
  }, [services]);
  return v;
}
