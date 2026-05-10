/**
 * Codex accuracy overlay for `<LoupePDFDemo>`.
 *
 * When a host passes a `codex` client, `LoupePDFDemo` fires
 * `extractStream` in the background. This module wraps the codex
 * render APIs (renderSeparations, renderHeatmap, renderLayer) into
 * the `ViewerServices` slot interface so the viewer can swap in
 * Ghostscript-accurate renders silently once they arrive.
 *
 * This module has **no import of `@printwithsynergy/codex-client`**.
 * It defines a minimal structural interface — any object whose shape
 * matches `MinimalCodexClient` (including `HttpClient` from
 * `@printwithsynergy/codex-client`) satisfies it.
 *
 * @public
 */

import type { SeparationService, LayerService, TACHeatmapService, ViewerServices } from "../plugin/services";
import type { DetectedInk } from "./index";
import { PROCESS_CHANNELS, PROCESS_CHANNELS as _CHANNELS } from "./index";

// ---------------------------------------------------------------------------
// Minimal codex client interface (structural typing — no codex-client import)
// ---------------------------------------------------------------------------

/**
 * Minimal subset of `@printwithsynergy/codex-client`'s `HttpClient`
 * that `LoupePDFDemo` uses for the accuracy overlay. Any object
 * implementing this interface (including `HttpClient`) is accepted.
 *
 * @public
 */
export interface MinimalCodexClient {
  extractStream(
    pdf: ArrayBuffer | Uint8Array,
    callbacks: {
      granular?: boolean;
      onColorWorld?: (data: Record<string, unknown>) => void;
      onOcgs?: (data: Record<string, unknown>) => void;
      onPhase2?: (doc: { pdf_sha256: string; [key: string]: unknown }) => void;
    },
  ): Promise<{ pdf_sha256: string; [key: string]: unknown }>;
  renderSeparations(
    pdf: { sha256: string },
    opts?: { page?: number; dpi?: number },
  ): Promise<{ channels: Array<{ name: string; type: string; png_b64: string }> }>;
  renderHeatmap(
    pdf: { sha256: string },
    opts?: { page?: number; dpi?: number; tacLimit?: number },
  ): Promise<{ png: Uint8Array }>;
  renderLayer(
    pdf: { sha256: string },
    opts: { page?: number; layerIndex: number; allLayerIndices: number[]; dpi?: number },
  ): Promise<Uint8Array>;
}

// ---------------------------------------------------------------------------
// Ink / layer extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract a `DetectedInk[]` from the `color_world` SSE event payload.
 * Returns the 4 CMYK process channels plus any spot colorants the
 * PDF declares (accurate — from pikepdf, not regex scanning).
 *
 * @public
 */
export function extractInksFromColorWorld(
  colorWorld: Record<string, unknown>,
): DetectedInk[] {
  const process: DetectedInk[] = (PROCESS_CHANNELS as readonly string[]).map((name) => ({
    name,
    type: "process" as const,
    altRgb: _PROCESS_INK_RGB[name.toLowerCase()] ?? ([0, 0, 0] as [number, number, number]),
  }));

  const spots: DetectedInk[] = [];
  const colorants = colorWorld["spot_colorants"];
  if (Array.isArray(colorants)) {
    for (const c of colorants) {
      if (!c || typeof c !== "object") continue;
      const name = String((c as Record<string, unknown>)["name"] ?? "");
      if (!name) continue;
      const rgb = (c as Record<string, unknown>)["rgb"];
      let altRgb: [number, number, number] = [128, 128, 128];
      if (Array.isArray(rgb) && rgb.length >= 3) {
        altRgb = [
          Math.round(Number(rgb[0]) * 255),
          Math.round(Number(rgb[1]) * 255),
          Math.round(Number(rgb[2]) * 255),
        ];
      }
      spots.push({ name, type: "spot" as const, altRgb });
    }
  }

  return [...process, ...spots];
}

/** @internal */
const _PROCESS_INK_RGB: Record<string, [number, number, number]> = {
  cyan: [0, 174, 239],
  magenta: [236, 0, 140],
  yellow: [255, 242, 0],
  black: [35, 31, 32],
};

/**
 * Extract a layer list from the `ocgs` SSE event payload.
 *
 * @public
 */
export function extractLayersFromOcgs(
  ocgs: Record<string, unknown>,
): Array<{ name: string; ocg_index: number; default_on: boolean }> {
  const list = ocgs["ocgs"];
  if (!Array.isArray(list)) return [];
  const result: Array<{ name: string; ocg_index: number; default_on: boolean }> = [];
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (!item || typeof item !== "object") continue;
    const name = String((item as Record<string, unknown>)["name"] ?? `Layer ${i + 1}`);
    const defaultOn = (item as Record<string, unknown>)["default_on"];
    result.push({
      name,
      ocg_index: i,
      default_on: defaultOn !== false,
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Codex overlay services
// ---------------------------------------------------------------------------

export interface CodexOverlayServices {
  separations: SeparationService;
  tacHeatmap: TACHeatmapService;
  layers: LayerService;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

/**
 * Build `separations`, `tacHeatmap`, and `layers` service slots backed
 * by the codex render APIs. Lazy: each page's renders are fetched the
 * first time they're requested, then cached as blob URLs.
 *
 * Hosts swap these into `ViewerServices` after `phase2_complete` fires
 * so pdfjs approximations are replaced by Ghostscript renders.
 *
 * @public
 */
export function createCodexOverlayServices(
  client: MinimalCodexClient,
  sha256: string,
  tacLimit: number,
  layerData: ReadonlyArray<{ name: string; ocg_index: number; default_on: boolean }>,
): CodexOverlayServices {
  const pdfRef = { sha256 };

  // Blob URL caches
  // Separations: keyed `${pageNum}|${channelName}` → url
  const channelUrls = new Map<string, string>();
  const channelBuilds = new Map<string, Promise<void>>();
  // Heatmaps: keyed `${pageNum}|${limit}` → url
  const heatmapUrls = new Map<string, string>();
  const heatmapBuilds = new Map<string, Promise<string>>();
  // Layers: keyed `${pageNum}|${layerIndex}` → url
  const layerUrlMap = new Map<string, string>();
  const layerBuilds = new Map<string, Promise<string>>();

  const blobs: string[] = [];
  const subscribers = new Set<() => void>();

  function notify() {
    for (const cb of subscribers) cb();
  }

  function makeBlobUrl(bytes: Uint8Array, type = "image/png"): string {
    // Copy into a plain ArrayBuffer to satisfy Blob's type constraints
    // (TypeScript requires ArrayBuffer, not SharedArrayBuffer).
    const ab = bytes.buffer instanceof ArrayBuffer
      ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      : new Uint8Array(bytes).buffer;
    const blob = new Blob([ab], { type });
    const url = URL.createObjectURL(blob);
    blobs.push(url);
    return url;
  }

  function base64ToUint8Array(b64: string): Uint8Array {
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // Fetch all channels for a page in one call, cache each individually.
  function ensureChannelsForPage(pageNum: number): void {
    const buildKey = `page:${pageNum}`;
    if (channelBuilds.has(buildKey)) return;
    const promise = client
      .renderSeparations(pdfRef, { page: pageNum })
      .then((result) => {
        for (const ch of result.channels) {
          const key = `${pageNum}|${ch.name}`;
          if (channelUrls.has(key)) continue;
          try {
            const bytes = base64ToUint8Array(ch.png_b64);
            channelUrls.set(key, makeBlobUrl(bytes));
          } catch {
            // Skip bad channel silently.
          }
        }
        channelBuilds.delete(buildKey);
        notify();
      })
      .catch(() => {
        channelBuilds.delete(buildKey);
      });
    channelBuilds.set(buildKey, promise);
  }

  function ensureHeatmap(pageNum: number, limit: number): void {
    const key = `${pageNum}|${limit}`;
    if (heatmapUrls.has(key) || heatmapBuilds.has(key)) return;
    const promise = client
      .renderHeatmap(pdfRef, { page: pageNum, tacLimit: limit })
      .then((result) => {
        const url = makeBlobUrl(result.png);
        heatmapUrls.set(key, url);
        heatmapBuilds.delete(key);
        notify();
        return url;
      })
      .catch(() => {
        heatmapBuilds.delete(key);
        return "";
      });
    heatmapBuilds.set(key, promise);
  }

  const allLayerIndices = layerData.map((l) => l.ocg_index);

  function ensureLayer(pageNum: number, layerIndex: number): void {
    const key = `${pageNum}|${layerIndex}`;
    if (layerUrlMap.has(key) || layerBuilds.has(key)) return;
    const promise = client
      .renderLayer(pdfRef, { page: pageNum, layerIndex, allLayerIndices })
      .then((bytes) => {
        const url = makeBlobUrl(bytes);
        layerUrlMap.set(key, url);
        layerBuilds.delete(key);
        notify();
        return url;
      })
      .catch(() => {
        layerBuilds.delete(key);
        return "";
      });
    layerBuilds.set(key, promise);
  }

  const separations: SeparationService = {
    getChannelImageUrl({ pageNum, channelName }) {
      const key = `${pageNum}|${channelName}`;
      const cached = channelUrls.get(key);
      if (cached) return cached;
      ensureChannelsForPage(pageNum);
      return "";
    },
  };

  const tacHeatmap: TACHeatmapService = {
    getHeatmapImageUrl({ pageNum, tacLimit: tl }) {
      const limit = tl ?? tacLimit;
      const key = `${pageNum}|${limit}`;
      const cached = heatmapUrls.get(key);
      if (cached) return cached;
      ensureHeatmap(pageNum, limit);
      return "";
    },
    listRuns: async (_args) => [],
  };

  const layers: LayerService = {
    getLayerImageUrl({ pageNum, layerIndex }) {
      const key = `${pageNum}|${layerIndex}`;
      const cached = layerUrlMap.get(key);
      if (cached) return cached;
      ensureLayer(pageNum, layerIndex);
      return "";
    },
    listLayers: async () => layerData as Array<{ name: string; ocg_index: number; default_on: boolean }>,
  };

  return {
    separations,
    tacHeatmap,
    layers,
    subscribe(listener) {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    dispose() {
      for (const url of blobs) URL.revokeObjectURL(url);
      blobs.length = 0;
      channelUrls.clear();
      channelBuilds.clear();
      heatmapUrls.clear();
      heatmapBuilds.clear();
      layerUrlMap.clear();
      layerBuilds.clear();
      subscribers.clear();
    },
  };
}

// Unused re-export to satisfy eslint no-unused-vars on the import.
void (_CHANNELS as unknown);
