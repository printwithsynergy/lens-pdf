"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DPI } from "../types";
import { useViewerHost } from "../host";

/**
 * WS-17C — instant layer toggling via per-OCG isolated tiles.
 *
 * The engine renders one PNG per layer with a transparent
 * background (``pngalpha`` device + every other OCG hidden via
 * ``_apply_ocg_overrides``). The browser then composites the active
 * subset locally via ``source-over`` blending. Toggling a layer
 * is just removing it from the draw list and redrawing — no API
 * round-trip after the first warm-up.
 *
 * The first paint of an unseen layer takes ~1-3 s (Ghostscript +
 * cache write). Subsequent toggles of the same layer hit the S3
 * cache and complete in well under 100 ms.
 *
 * Mirrors the public-shape of SeparationCanvas so PdfViewer can
 * swap them in / out by ``viewerMode``.
 */

interface LayerCanvasProps {
  jobId: string;
  pageNum: number;
  enabledLayers: Set<number>;
  /** All OCG indices for this page (drawing order). */
  allLayers: number[];
  width: number;
  height: number;
  dpi?: number;
}

export function LayerCanvas({
  jobId: _jobId,
  pageNum,
  enabledLayers,
  allLayers,
  width,
  height,
  dpi = DEFAULT_DPI,
}: LayerCanvasProps) {
  const { apiBase } = useViewerHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layerImages, setLayerImages] = useState<Map<number, HTMLImageElement>>(
    new Map(),
  );
  const [loadingLayers, setLoadingLayers] = useState<Set<number>>(new Set());

  // Drop the cache when the page changes — different page = different
  // OCG set, even if indices happen to overlap numerically.
  useEffect(() => {
    setLayerImages(new Map());
    setLoadingLayers(new Set());
  }, [pageNum]);

  const loadLayer = useCallback(
    async (layerIndex: number) => {
      if (layerImages.has(layerIndex) || loadingLayers.has(layerIndex)) {
        return;
      }
      setLoadingLayers((prev) => new Set(prev).add(layerIndex));

      const img = new Image();
      const url = `${apiBase}/pages/${pageNum}/layers/${layerIndex}?dpi=${dpi}`;

      await new Promise<void>((resolve) => {
        img.onload = () => {
          setLayerImages((prev) => {
            const next = new Map(prev);
            next.set(layerIndex, img);
            return next;
          });
          setLoadingLayers((prev) => {
            const next = new Set(prev);
            next.delete(layerIndex);
            return next;
          });
          resolve();
        };
        img.onerror = () => {
          // Don't bubble the error — let the canvas show the layers
          // that DID load. Render failures on a single layer are
          // logged server-side; the viewer just shows everything else.
          setLoadingLayers((prev) => {
            const next = new Set(prev);
            next.delete(layerIndex);
            return next;
          });
          resolve();
        };
        img.src = url;
      });
    },
    [apiBase, pageNum, dpi, layerImages, loadingLayers],
  );

  // Trigger fetches for any enabled layer we don't have cached yet.
  useEffect(() => {
    for (const idx of enabledLayers) {
      if (!layerImages.has(idx)) {
        void loadLayer(idx);
      }
    }
  }, [enabledLayers, layerImages, loadLayer]);

  // Repaint every time the enabled set or the cached images change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Start from white paper so hidden layers reveal blank stock,
    // not the slate-900 viewer chrome behind the canvas.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "source-over";
    for (const layerIndex of allLayers) {
      if (!enabledLayers.has(layerIndex)) continue;
      const img = layerImages.get(layerIndex);
      if (!img) continue;
      ctx.drawImage(img, 0, 0, width, height);
    }
  }, [width, height, enabledLayers, layerImages, allLayers]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute left-0 top-0"
      style={{ width, height }}
    />
  );
}
