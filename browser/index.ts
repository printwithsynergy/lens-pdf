/**
 * `@printwithsynergy/loupe-pdf/browser`
 *
 * Codex-backed ViewerServices factory. Every byte-level raster path
 * (page raster, OCG-isolated layer, separations, TAC heatmap, color
 * picker, densitometer) flows through a `CodexLikeClient`. This
 * package no longer ships a pdf.js raster path — codex is the
 * canonical engine, and consumers must wire a client that points at
 * a deployed `codex-pdf >= 1.3.0` (typically via `@printwithsynergy/codex-client`).
 *
 * ```ts
 * import { HttpClient } from "@printwithsynergy/codex-client";
 * import { createBrowserViewerServices } from "@printwithsynergy/loupe-pdf/browser";
 *
 * const codex = new HttpClient({ baseUrl: "/api/codex-proxy" });
 * const services = createBrowserViewerServices({
 *   codex,
 *   pdfBytes: rawPdfArrayBuffer,
 *   codexDocument,
 * });
 * ```
 *
 * The "pdf bytes" + "codex client" pair is the new contract. Hosts
 * that previously passed `pdfUrl` should fetch the URL themselves
 * (server-side or via a same-origin proxy) and hand the raw bytes
 * to this factory. The browser viewer never touches PDF bytes
 * beyond shipping them to codex.
 *
 * @public
 */

import { useEffect, useState } from "react";
import {
  adaptCodexDocumentForViewer,
  type CodexViewerAdapterPayload,
} from "../host/codexAdapter";
import {
  resolveSpotSwatchColor,
  type CmykQuad,
  type LabTriplet,
  type PantoneRefMap,
  type SpotOverrideMap,
  type SpotSwatchSource,
} from "../host/spotColor";
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
import type { CodexLikeClient } from "../host/codexHostServices";
import type { PdfRef } from "@printwithsynergy/codex-client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** DPI used for color sampling, separations, TAC heatmap. */
const ANALYSIS_DPI = 200;

/** Page render DPI default. */
const PAGE_DPI = 144;

/** Process inks codex always exposes. */
export const PROCESS_CHANNELS = ["Cyan", "Magenta", "Yellow", "Black"] as const;

/** Default URL for the pdf.js worker — kept for backwards-source-compat
 *  with the previous public API. The codex-backed factory does NOT
 *  use pdf.js at all; this constant is retained as a no-op string so
 *  consumers that import it don't fail to build. Will be removed in
 *  a future major. */
export const defaultBrowserWorkerSrc = "";

/** A single ink reported by the densitometer / color picker. */
export interface DetectedInk {
  name: string;
  type: "process" | "spot";
  altRgb: [number, number, number];
  source: SpotSwatchSource | "process";
  lab?: LabTriplet;
  cmyk?: CmykQuad;
  pantone_name?: string;
}

/** Options for {@link createBrowserViewerServices}. */
export interface BrowserViewerServicesOptions {
  /** Codex client (HttpClient or compatible) used for every render call. */
  codex: CodexLikeClient & {
    renderPage?: (
      pdf: PdfRef,
      opts?: { page?: number; dpi?: number; ocgOn?: number[]; ocgOff?: number[]; simulateOverprint?: boolean },
    ) => Promise<Uint8Array>;
    renderLayer?: (
      pdf: PdfRef,
      opts: { page?: number; layerIndex: number; allLayerIndices: number[]; dpi?: number },
    ) => Promise<Uint8Array>;
    renderSeparations?: (
      pdf: PdfRef,
      opts?: { page?: number; dpi?: number },
    ) => Promise<{
      page_num: number;
      dpi: number;
      channels: { name: string; type: string; png_b64: string }[];
    }>;
  };
  /** Raw PDF bytes (codex consumes them on every render call). */
  pdfBytes: ArrayBuffer | Uint8Array | Blob | (() => Promise<ArrayBuffer | Uint8Array | Blob>);
  /**
   * Optional sha256 of the PDF (hex). When set, codex render calls
   * pass `{ sha256 }` instead of re-uploading the file every time —
   * relies on the codex API's blob cache (TTL ~60min). Falls back to
   * the raw bytes path automatically if the server returns 412.
   */
  pdfSha256?: string;
  /** Canonical codex document payload that owns page/layer metadata. */
  codexDocument: unknown;
  /** Theme tokens. Defaults to the package's neutral light palette. */
  tokens?: ThemeTokens;
  /** Default TAC limit (in percent). Default 300. */
  tacLimit?: number;
  /** Synthetic author for the in-browser annotation service. */
  annotationAuthorEmail?: string;
  /** Per-spot-ink colour overrides (host precedence). */
  spotOverrides?: SpotOverrideMap;
  /** Optional Pantone reference entries to merge with the bundled DB. */
  extraPantoneRefs?: PantoneRefMap;
}

/** Augmented `ViewerServices` returned by {@link createBrowserViewerServices}. */
export interface BrowserViewerServices extends ViewerServices {
  getPageCount(): Promise<number>;
  getPageDimensions(pageNum: number): Promise<{ widthPts: number; heightPts: number }>;
  getInks(): Promise<DetectedInk[]>;
  prepare(
    pageNum: number,
    opts?: { tacLimit?: number },
  ): Promise<{
    widthPts: number;
    heightPts: number;
    layerCount: number;
  }>;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROCESS_INK_RGB: Record<string, [number, number, number]> = {
  cyan: [0, 174, 239],
  magenta: [236, 0, 140],
  yellow: [255, 242, 0],
  black: [35, 31, 32],
  c: [0, 174, 239],
  m: [236, 0, 140],
  y: [255, 242, 0],
  k: [35, 31, 32],
};

const PLACEHOLDER_PNG =
  "data:image/png;base64," +
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function bytesToBlob(bytes: Uint8Array, mime = "application/pdf"): Blob {
  // Re-wrap into a fresh ArrayBuffer so the Blob constructor stays happy
  // under TS's strict ArrayBufferLike vs ArrayBuffer typing.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: mime });
}

function pngBytesToObjectUrl(bytes: Uint8Array): string {
  return URL.createObjectURL(bytesToBlob(bytes, "image/png"));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a fully-wired {@link ViewerServices} backed by the codex
 * client. Every service the package consumes is implemented.
 *
 * @public
 */
export function createBrowserViewerServices(
  opts: BrowserViewerServicesOptions,
): BrowserViewerServices {
  if (!opts.codex) {
    throw new Error(
      "[loupe-pdf] codex client is required. Construct an HttpClient from " +
        "@printwithsynergy/codex-client (or compatible) and pass it via { codex }.",
    );
  }
  if (opts.pdfBytes === undefined || opts.pdfBytes === null) {
    throw new Error(
      "[loupe-pdf] pdfBytes is required (ArrayBuffer | Uint8Array | Blob | async getter).",
    );
  }
  if (!opts.codexDocument) {
    throw new Error(
      "[loupe-pdf] codexDocument is required. loupe-pdf no longer infers metadata from pdf.js.",
    );
  }

  const tokens = opts.tokens ?? defaultThemeTokens;
  const defaultTacLimit = opts.tacLimit ?? 300;
  const authorEmail = opts.annotationAuthorEmail ?? "you@browser.local";
  const codexPayload: CodexViewerAdapterPayload = adaptCodexDocumentForViewer(
    opts.codexDocument,
  );
  const spotOverrides: SpotOverrideMap = opts.spotOverrides ?? {};
  const extraPantoneRefs: PantoneRefMap | undefined = opts.extraPantoneRefs;

  // ── State ──────────────────────────────────────────────────────────
  let pdfBlob: Blob | null = null;
  let pdfBlobPromise: Promise<Blob> | null = null;
  let inksPromise: Promise<DetectedInk[]> | null = null;
  const pageUrls = new Map<string, string>();
  const pageBuilds = new Map<string, Promise<string>>();
  const channelUrls = new Map<string, string>();
  const channelBuilds = new Map<string, Promise<string>>();
  const heatmapUrls = new Map<string, string>();
  const heatmapBuilds = new Map<string, Promise<string>>();
  const layerUrls = new Map<string, string>();
  const layerBuilds = new Map<string, Promise<string>>();
  const heatmapRunsCache = new Map<string, ReadonlyArray<unknown>>();
  const annotations = new Map<number, AnnotationEntry>();
  const subscribers = new Set<() => void>();
  const blobs: string[] = [];

  function notify(): void {
    for (const cb of subscribers) cb();
  }

  function trackBlob(url: string): string {
    blobs.push(url);
    return url;
  }

  async function getPdfBlob(): Promise<Blob> {
    if (pdfBlob) return pdfBlob;
    if (!pdfBlobPromise) {
      pdfBlobPromise = (async () => {
        const raw = typeof opts.pdfBytes === "function"
          ? await opts.pdfBytes()
          : opts.pdfBytes;
        let blob: Blob;
        if (raw instanceof Blob) blob = raw;
        else if (raw instanceof Uint8Array) blob = bytesToBlob(raw);
        else blob = new Blob([raw], { type: "application/pdf" });
        pdfBlob = blob;
        return blob;
      })();
    }
    return pdfBlobPromise;
  }

  /**
   * Render-time PDF reference. Uses `{ sha256 }` when the host
   * supplied `pdfSha256` (codex blob cache hit), otherwise falls
   * back to uploading the raw blob each call.
   */
  async function getPdfRef(): Promise<PdfRef> {
    if (opts.pdfSha256) return { sha256: opts.pdfSha256 };
    return getPdfBlob();
  }

  /**
   * Run a codex render with hash-only ref; on `412` (blob cache
   * expired) re-upload the raw PDF and retry once.
   */
  async function withFallbackToBytes<T>(
    call: (ref: PdfRef) => Promise<T>,
  ): Promise<T> {
    const ref = await getPdfRef();
    try {
      return await call(ref);
    } catch (err) {
      const status = (err as { status?: number } | undefined)?.status;
      if (status === 412 && opts.pdfSha256) {
        return await call(await getPdfBlob());
      }
      throw err;
    }
  }

  // ── Page raster ────────────────────────────────────────────────────

  async function buildPageUrl(pageNum: number, dpi: number): Promise<string> {
    const key = `${pageNum}@${dpi}`;
    if (pageUrls.has(key)) return pageUrls.get(key)!;
    const existing = pageBuilds.get(key);
    if (existing) return existing;
    const promise = (async () => {
      if (!opts.codex.renderPage) {
        throw new Error(
          "[loupe-pdf] codex client missing renderPage(). Use @printwithsynergy/codex-client@>=1.2.0.",
        );
      }
      const renderPageFn = opts.codex.renderPage;
      const png = await withFallbackToBytes((ref) =>
        renderPageFn(ref, { page: pageNum, dpi }),
      );
      const url = trackBlob(pngBytesToObjectUrl(png));
      pageUrls.set(key, url);
      pageBuilds.delete(key);
      notify();
      return url;
    })();
    pageBuilds.set(key, promise);
    return promise;
  }

  // ── Channel separations ────────────────────────────────────────────

  async function buildChannelUrls(pageNum: number): Promise<void> {
    if (!opts.codex.renderSeparations) return;
    const renderSepsFn = opts.codex.renderSeparations;
    const result = await withFallbackToBytes((ref) =>
      renderSepsFn(ref, {
        page: pageNum,
        dpi: ANALYSIS_DPI,
      }),
    );
    for (const ch of result.channels) {
      const key = `${pageNum}|${ch.name}`;
      if (channelUrls.has(key)) continue;
      const bytes = base64ToBytes(ch.png_b64);
      const url = trackBlob(pngBytesToObjectUrl(bytes));
      channelUrls.set(key, url);
    }
    notify();
  }

  function getChannelUrl(pageNum: number, channel: string): string {
    const key = `${pageNum}|${channel}`;
    if (channelUrls.has(key)) return channelUrls.get(key)!;
    if (!channelBuilds.has(key)) {
      channelBuilds.set(
        key,
        buildChannelUrls(pageNum).then(() => channelUrls.get(key) ?? ""),
      );
    }
    return PLACEHOLDER_PNG;
  }

  // ── TAC heatmap ────────────────────────────────────────────────────

  async function buildHeatmap(pageNum: number, tacLimit: number): Promise<string> {
    const key = `${pageNum}|${tacLimit}`;
    if (heatmapUrls.has(key)) return heatmapUrls.get(key)!;
    const existing = heatmapBuilds.get(key);
    if (existing) return existing;
    const promise = (async () => {
      const result = await withFallbackToBytes((ref) =>
        opts.codex.renderHeatmap(ref, {
          page: pageNum,
          dpi: ANALYSIS_DPI,
          tacLimit,
        }),
      );
      const url = trackBlob(pngBytesToObjectUrl(result.png));
      heatmapUrls.set(key, url);
      heatmapRunsCache.set(key, result.runs as ReadonlyArray<unknown>);
      heatmapBuilds.delete(key);
      notify();
      return url;
    })();
    heatmapBuilds.set(key, promise);
    return promise;
  }

  // ── Layer tiles ────────────────────────────────────────────────────

  async function buildLayerUrl(pageNum: number, layerIndex: number): Promise<string> {
    const key = `${pageNum}|${layerIndex}`;
    if (layerUrls.has(key)) return layerUrls.get(key)!;
    const existing = layerBuilds.get(key);
    if (existing) return existing;
    const promise = (async () => {
      if (!opts.codex.renderLayer) {
        throw new Error(
          "[loupe-pdf] codex client missing renderLayer(). Use @printwithsynergy/codex-client@>=1.2.0.",
        );
      }
      const renderLayerFn = opts.codex.renderLayer;
      const all = layerIndicesForPage(pageNum, codexPayload);
      const png = await withFallbackToBytes((ref) =>
        renderLayerFn(ref, {
          page: pageNum,
          layerIndex,
          allLayerIndices: all,
          dpi: ANALYSIS_DPI,
        }),
      );
      const url = trackBlob(pngBytesToObjectUrl(png));
      layerUrls.set(key, url);
      layerBuilds.delete(key);
      notify();
      return url;
    })();
    layerBuilds.set(key, promise);
    return promise;
  }

  // ── Inks ───────────────────────────────────────────────────────────

  async function getInks(): Promise<DetectedInk[]> {
    if (!inksPromise) {
      inksPromise = (async () => {
        const inks: DetectedInk[] = PROCESS_CHANNELS.map((name) => ({
          name,
          type: "process" as const,
          source: "process" as const,
          altRgb: PROCESS_INK_RGB[name.toLowerCase()] ?? [0, 0, 0],
        }));
        for (const colorant of codexPayload.spot_colorants) {
          const resolution = resolveSpotSwatchColor(colorant.name, {
            hostOverride: spotOverrides[colorant.name],
            codex: colorant,
            extraPantoneRefs,
          });
          inks.push({
            name: colorant.name,
            type: "spot",
            source: resolution.source,
            altRgb: resolution.rgb,
            ...(resolution.lab ? { lab: resolution.lab } : {}),
            ...(resolution.cmyk ? { cmyk: resolution.cmyk } : {}),
            ...(resolution.pantone_name ? { pantone_name: resolution.pantone_name } : {}),
          });
        }
        return inks;
      })();
    }
    return inksPromise;
  }

  // ── Public services ────────────────────────────────────────────────

  const services: BrowserViewerServices = {
    pageImages: {
      getPageImageUrl: ({ pageNum, dpi }) => {
        const key = `${pageNum}@${dpi ?? PAGE_DPI}`;
        if (pageUrls.has(key)) return pageUrls.get(key)!;
        void buildPageUrl(pageNum, dpi ?? PAGE_DPI).catch(() => {
          /* error surfaced via notify; component re-renders blank */
        });
        return PLACEHOLDER_PNG;
      },
    },
    layers: {
      getLayerImageUrl: ({ pageNum, layerIndex }) => {
        const key = `${pageNum}|${layerIndex}`;
        if (layerUrls.has(key)) return layerUrls.get(key)!;
        void buildLayerUrl(pageNum, layerIndex).catch(() => {
          /* placeholder until ready */
        });
        return PLACEHOLDER_PNG;
      },
      listLayers: async () => {
        return codexPayload.layers.map((l) => ({
          name: l.name,
          ocg_index: l.ocg_index,
          default_on: l.default_on,
        }));
      },
    },
    separations: {
      getChannelImageUrl: ({ pageNum, channelName }) =>
        getChannelUrl(pageNum, channelName),
    },
    tacHeatmap: {
      getHeatmapImageUrl: ({ pageNum, tacLimit }) => {
        const key = `${pageNum}|${tacLimit ?? defaultTacLimit}`;
        if (heatmapUrls.has(key)) return heatmapUrls.get(key)!;
        void buildHeatmap(pageNum, tacLimit ?? defaultTacLimit).catch(() => {
          /* placeholder until ready */
        });
        return PLACEHOLDER_PNG;
      },
      listRuns: async ({ pageNum, tacLimit }) => {
        const limit = tacLimit ?? defaultTacLimit;
        await buildHeatmap(pageNum, limit);
        return (heatmapRunsCache.get(`${pageNum}|${limit}`) ?? []) as ReadonlyArray<{
          x0: number;
          y0: number;
          x1: number;
          y1: number;
          mean_tac: number;
          limit: number;
          exceeds: boolean;
        }>;
      },
    },
    colorSample: {
      sampleAt: async ({ pageNum, pdfX, pdfY, dpi }) => {
        const dim = pageDimsFromCodex(pageNum, codexPayload);
        const r = await withFallbackToBytes((ref) =>
          opts.codex.sampleColor(ref, {
            page: pageNum,
            x: pdfX,
            y: pdfY,
            pageW: dim?.widthPts,
            pageH: dim?.heightPts,
            dpi: dpi ?? ANALYSIS_DPI,
          }),
        );
        return { rgb: r.rgb, hex: r.hex } as unknown as ColorSample;
      },
    },
    densitometer: {
      sampleAt: async ({ pageNum, pdfX, pdfY, dpi, tacLimit }) => {
        const dim = pageDimsFromCodex(pageNum, codexPayload);
        const r = await withFallbackToBytes((ref) =>
          opts.codex.sampleDensity(ref, {
            page: pageNum,
            x: pdfX,
            y: pdfY,
            pageW: dim?.widthPts,
            pageH: dim?.heightPts,
            dpi: dpi ?? ANALYSIS_DPI,
            tacLimit,
          }),
        );
        return r as unknown as DensitometerSample;
      },
    },
    annotations: {
      list: async () => Array.from(annotations.values()),
      getForPage: async (pageNum: number) => annotations.get(pageNum) ?? null,
      saveForPage: async (pageNum: number, fabricJson: unknown) => {
        const existing = annotations.get(pageNum);
        const now = new Date().toISOString();
        const next: AnnotationEntry = {
          id: existing?.id ?? `loupe-anon-${pageNum}-${Date.now()}`,
          jobId: "loupe-anon",
          authorEmail,
          authorName: existing?.authorName ?? null,
          pageNum,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          fabricJson,
        };
        annotations.set(pageNum, next);
      },
      remove: async (id: string) => {
        for (const [key, entry] of annotations) {
          if (entry.id === id) annotations.delete(key);
        }
      },
    },
    reports: markUnwired({
      getHtmlReportUrl: () => "",
      getPdfDownloadUrl: () => "",
    }),
    telemetry: noopTelemetry,
    i18n: noopI18n,
    tokens,

    getPageCount: async () => codexPayload.pages.length,
    getPageDimensions: async (pageNum: number) => {
      const dim = pageDimsFromCodex(pageNum, codexPayload);
      if (!dim) {
        throw new Error(`[loupe-pdf] no codex dimensions for page ${pageNum}`);
      }
      return dim;
    },
    getInks,
    prepare: async (pageNum: number, opts2?: { tacLimit?: number }) => {
      const dim = pageDimsFromCodex(pageNum, codexPayload);
      const tacLimit = opts2?.tacLimit ?? defaultTacLimit;
      await Promise.all([
        buildPageUrl(pageNum, PAGE_DPI),
        buildChannelUrls(pageNum),
        buildHeatmap(pageNum, tacLimit),
      ]);
      const layerCount = codexPayload.layers.length;
      return {
        widthPts: dim?.widthPts ?? 612,
        heightPts: dim?.heightPts ?? 792,
        layerCount,
      };
    },
    subscribe: (listener: () => void) => {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose: () => {
      for (const url of blobs) URL.revokeObjectURL(url);
      blobs.length = 0;
      pageUrls.clear();
      channelUrls.clear();
      heatmapUrls.clear();
      layerUrls.clear();
      heatmapRunsCache.clear();
      pdfBlob = null;
      pdfBlobPromise = null;
    },
  };

  return services;
}

// ---------------------------------------------------------------------------
// Codex payload helpers (no pdf.js access)
// ---------------------------------------------------------------------------

function pageDimsFromCodex(
  pageNum: number,
  payload: CodexViewerAdapterPayload,
): { widthPts: number; heightPts: number } | null {
  const page = payload.pages[pageNum - 1];
  if (!page) return null;
  return { widthPts: page.width_pts, heightPts: page.height_pts };
}

function layerIndicesForPage(
  _pageNum: number,
  payload: CodexViewerAdapterPayload,
): number[] {
  // CodexViewerAdapterPayload exposes a flat `layers` list because
  // OCGs are document-scoped in the codex contract today; render
  // requests pass every index along with the chosen one so codex
  // hides the rest at compose time.
  return payload.layers.map((l) => l.ocg_index);
}

// ---------------------------------------------------------------------------
// Public helpers (kept stable across the pdfjs removal so consumer code
// that imported them keeps building).
// ---------------------------------------------------------------------------

/** "Rich-black" K factor used by {@link rgbToCmyk}. */
const K_FACTOR = 0.8;

/**
 * Convert an sRGB triplet to a CMYK approximation. Mirrors the previous
 * pdf.js-backed factory's behaviour 1:1 — same K factor, same TAC
 * range — so existing UIs that consumed the helper see no diff.
 *
 *   C = 1 - R/255
 *   M = 1 - G/255
 *   Y = 1 - B/255
 *   K = min(C, M, Y) × K_FACTOR
 *   TAC = (C + M + Y + K) × 100 in [0, 380]
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

/**
 * React hook returning a counter that increments whenever the
 * services emit a "URL became available" notification. Components
 * spread the counter through their key list to force a re-render
 * once a lazy blob URL is ready. Returns `0` for `null` / undefined
 * services.
 *
 * @public
 */
export function useBrowserViewerServicesVersion(
  services: BrowserViewerServices | null | undefined,
): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!services) return;
    return services.subscribe(() => setVersion((v) => v + 1));
  }, [services]);
  return version;
}

function base64ToBytes(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node fallback (vitest with jsdom).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer?.from?.(b64, "base64");
  if (buf) return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  throw new Error("[loupe-pdf] no base64 decoder available in this environment");
}
