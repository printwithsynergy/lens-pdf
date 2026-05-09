/**
 * `@printwithsynergy/loupe-pdf/host/codexHostServices`
 *
 * Optional bridge between an embedding host and the codex render
 * service. Use it when your host wants the viewer's separations,
 * heatmap, and densitometer panels to be powered by a remote
 * codex-pdf >= 1.2.0 deployment instead of the in-browser pdf.js
 * fallback.
 *
 * Browser callers stay client-side for primary page raster — the
 * pdf.js path in `browser/index.ts` is fast and avoids per-redraw
 * round trips. The codex-backed surfaces here are the ones that
 * benefit most from real ICC separations and tiffsep-quality
 * channel decomposition: they only run on demand (panel open,
 * tooltip hover, etc.) so the latency cost is absorbed.
 *
 * @public
 */

import type { ViewerServices } from "../plugin/services";
import type { PdfRef } from "@printwithsynergy/codex-client";
import { markUnwired, noopI18n, noopTelemetry } from "../plugin/services";
import { defaultThemeTokens } from "../plugin/services";

/**
 * Minimal interface satisfied by `@printwithsynergy/codex-client`'s
 * `HttpClient`. Stays a structural type so hosts can pass either the
 * real package or a mock without bringing the runtime dep into
 * loupe-pdf itself.
 *
 * @public
 */
export interface CodexLikeClient {
  renderHeatmap(
    pdf: PdfRef,
    opts?: { page?: number; dpi?: number; tacLimit?: number },
  ): Promise<{ png: Uint8Array; runs: unknown[] }>;
  sampleColor(
    pdf: PdfRef,
    opts: { page?: number; x: number; y: number; pageW?: number; pageH?: number; dpi?: number },
  ): Promise<{ x: number; y: number; rgb: [number, number, number]; hex: string }>;
  sampleDensity(
    pdf: PdfRef,
    opts: {
      page?: number;
      x: number;
      y: number;
      pageW?: number;
      pageH?: number;
      dpi?: number;
      tacLimit?: number;
    },
  ): Promise<{
    channels: { name: string; percent: number }[];
    tac: number;
    tac_limit: number;
    limit_exceeded: boolean;
  }>;
}

/**
 * Configuration for {@link createCodexBackedViewerServices}.
 *
 * @public
 */
export interface CodexBackedViewerServicesOptions {
  /** Concrete codex client (e.g. `new HttpClient()` from `@printwithsynergy/codex-client`). */
  codex: CodexLikeClient;
  /** Loader that returns the raw PDF bytes the codex calls operate on. */
  pdfBytes: ArrayBuffer | Uint8Array | Blob | (() => Promise<ArrayBuffer | Uint8Array | Blob>);
  /** Page dimensions in PDF points (origin lower-left). Used for sample coords. */
  pageDimensionsPt?: { width: number; height: number };
  /** Default DPI for the heatmap; defaults to 200. */
  heatmapDpi?: number;
  /** Default DPI for the densitometer + color picker; defaults to 300. */
  sampleDpi?: number;
}

async function _loadPdf(
  source: CodexBackedViewerServicesOptions["pdfBytes"],
): Promise<ArrayBuffer | Uint8Array | Blob> {
  return typeof source === "function" ? source() : source;
}

/**
 * Build a ViewerServices instance whose tac heatmap / color picker /
 * densitometer surfaces are backed by a codex client. Page raster +
 * layer + annotations still come from the host (use
 * `defaultUnwiredServices` to merge a partial override).
 *
 * Components that want a URL-builder API (e.g. `<TacHeatmap>` looks
 * for `getHeatmapImageUrl`) get a Blob URL minted on-demand via the
 * codex client; the URL is revoked the next time the heatmap renders.
 *
 * @public
 */
export function createCodexBackedViewerServices(
  options: CodexBackedViewerServicesOptions,
): Pick<ViewerServices, "tacHeatmap" | "colorSample" | "densitometer"> & {
  i18n: ViewerServices["i18n"];
  telemetry: ViewerServices["telemetry"];
  tokens: ViewerServices["tokens"];
} {
  const heatmapDpi = options.heatmapDpi ?? 200;
  const sampleDpi = options.sampleDpi ?? 300;
  let lastHeatmapUrl: string | null = null;

  const refreshHeatmap = async (page: number, tacLimit: number): Promise<string> => {
    const pdf = await _loadPdf(options.pdfBytes);
    const result = await options.codex.renderHeatmap(pdf, { page, dpi: heatmapDpi, tacLimit });
    if (lastHeatmapUrl) URL.revokeObjectURL(lastHeatmapUrl);
    // Re-wrap into a fresh ArrayBuffer so the Blob constructor is
    // happy under TS's stricter ArrayBufferLike vs ArrayBuffer typing.
    const ab = new ArrayBuffer(result.png.byteLength);
    new Uint8Array(ab).set(result.png);
    const blob = new Blob([ab], { type: "image/png" });
    lastHeatmapUrl = URL.createObjectURL(blob);
    return lastHeatmapUrl;
  };

  return {
    tacHeatmap: {
      getHeatmapImageUrl: ({ pageNum, tacLimit }) => {
        // The viewer expects a synchronous URL; we return a sentinel
        // that resolves on first paint via listRuns().
        void refreshHeatmap(pageNum, tacLimit);
        return lastHeatmapUrl ?? "";
      },
      listRuns: async ({ pageNum, tacLimit }) => {
        const pdf = await _loadPdf(options.pdfBytes);
        const result = await options.codex.renderHeatmap(pdf, {
          page: pageNum,
          dpi: heatmapDpi,
          tacLimit,
        });
        return result.runs as unknown as never;
      },
    },
    colorSample: {
      sampleAt: async ({ pageNum, pdfX, pdfY }) => {
        const pdf = await _loadPdf(options.pdfBytes);
        const dims = options.pageDimensionsPt;
        const r = await options.codex.sampleColor(pdf, {
          page: pageNum,
          x: pdfX,
          y: pdfY,
          pageW: dims?.width,
          pageH: dims?.height,
          dpi: sampleDpi,
        });
        return { rgb: r.rgb, hex: r.hex } as unknown as never;
      },
    },
    densitometer: {
      sampleAt: async ({ pageNum, pdfX, pdfY, tacLimit }) => {
        const pdf = await _loadPdf(options.pdfBytes);
        const dims = options.pageDimensionsPt;
        const r = await options.codex.sampleDensity(pdf, {
          page: pageNum,
          x: pdfX,
          y: pdfY,
          pageW: dims?.width,
          pageH: dims?.height,
          dpi: sampleDpi,
          tacLimit,
        });
        return r as unknown as never;
      },
    },
    i18n: noopI18n,
    telemetry: noopTelemetry,
    tokens: defaultThemeTokens,
  };
}

/**
 * Sentinel default that hosts can spread into a fully-defined
 * ViewerServices when codex is the only data source they wire:
 *
 * ```ts
 * const services = {
 *   ...defaultCodexBackedViewerServices,
 *   ...createCodexBackedViewerServices({ codex, pdfBytes }),
 * };
 * ```
 *
 * Surfaces left as no-ops so components self-hide instead of throwing.
 *
 * @public
 */
export const defaultCodexBackedViewerServices: Pick<
  ViewerServices,
  "pageImages" | "layers" | "separations" | "annotations" | "reports"
> = {
  pageImages: markUnwired({ getPageImageUrl: () => "" }),
  layers: markUnwired({ getLayerImageUrl: () => "", listLayers: async () => [] }),
  separations: markUnwired({ getChannelImageUrl: () => "" }),
  annotations: markUnwired({
    list: async () => [],
    getForPage: async () => null,
    saveForPage: async () => {},
    remove: async () => {},
  }),
  reports: markUnwired({ getHtmlReportUrl: () => "", getPdfDownloadUrl: () => "" }),
};
