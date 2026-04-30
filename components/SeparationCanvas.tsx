"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DPI } from "../types";
import { useViewerServices } from "../host";

/**
 * RGB tint colors for compositing each channel onto a white background
 * using multiply blending. For CMYK channels, we use their subtractive
 * color representation. Spot colors get a generated hue.
 */
const CHANNEL_RGB: Record<string, [number, number, number]> = {
  Cyan: [0, 183, 235],
  Magenta: [236, 0, 140],
  Yellow: [255, 242, 0],
  Black: [35, 31, 32],
};

function spotColorRgb(name: string): [number, number, number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  // Convert HSL(hue, 70%, 45%) to RGB
  const s = 0.7;
  const l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 60) { r = c; g = x; }
  else if (hue < 120) { r = x; g = c; }
  else if (hue < 180) { g = c; b = x; }
  else if (hue < 240) { g = x; b = c; }
  else if (hue < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

interface SeparationCanvasProps {
  jobId: string;
  pageNum: number;
  enabledChannels: Set<string>;
  allChannels: string[];
  width: number;
  height: number;
  dpi?: number;
}

export function SeparationCanvas({
  jobId: _jobId,
  pageNum,
  enabledChannels,
  allChannels,
  width,
  height,
  dpi = DEFAULT_DPI,
}: SeparationCanvasProps) {
  const { separations } = useViewerServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [channelImages, setChannelImages] = useState<
    Map<string, HTMLImageElement>
  >(new Map());
  const [loadingChannels, setLoadingChannels] = useState<Set<string>>(
    new Set(),
  );

  // Clear cached channel images when page changes
  useEffect(() => {
    setChannelImages(new Map());
    setLoadingChannels(new Set());
  }, [pageNum]);

  // Load channel images lazily
  const loadChannel = useCallback(
    async (channelName: string) => {
      if (channelImages.has(channelName) || loadingChannels.has(channelName)) {
        return;
      }
      setLoadingChannels((prev) => new Set(prev).add(channelName));

      const img = new Image();
      const url = separations.getChannelImageUrl({ pageNum, channelName, dpi });

      await new Promise<void>((resolve) => {
        img.onload = () => {
          setChannelImages((prev) => {
            const next = new Map(prev);
            next.set(channelName, img);
            return next;
          });
          setLoadingChannels((prev) => {
            const next = new Set(prev);
            next.delete(channelName);
            return next;
          });
          resolve();
        };
        img.onerror = () => {
          setLoadingChannels((prev) => {
            const next = new Set(prev);
            next.delete(channelName);
            return next;
          });
          resolve();
        };
        img.src = url;
      });
    },
    [separations, pageNum, dpi, channelImages, loadingChannels],
  );

  // Load enabled channels
  useEffect(() => {
    for (const ch of enabledChannels) {
      if (!channelImages.has(ch)) {
        loadChannel(ch);
      }
    }
  }, [enabledChannels, channelImages, loadChannel]);

  // Composite enabled channels onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Start with white paper
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // Composite each enabled channel using multiply blend
    for (const channelName of allChannels) {
      if (!enabledChannels.has(channelName)) continue;
      const img = channelImages.get(channelName);
      if (!img) continue;

      // channelName comes from the allChannels list we own — typed Record lookup.
      // eslint-disable-next-line security/detect-object-injection
      const rgb = CHANNEL_RGB[channelName] ?? spotColorRgb(channelName);

      // Create offscreen canvas for tinting
      const offscreen = document.createElement("canvas");
      offscreen.width = width;
      offscreen.height = height;
      const offCtx = offscreen.getContext("2d")!;

      // Draw grayscale channel image
      offCtx.drawImage(img, 0, 0, width, height);

      // Get pixel data and tint with channel color
      const imageData = offCtx.getImageData(0, 0, width, height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        // Grayscale value: 0 = full ink, 255 = no ink (inverted)
        // Convert to ink density: 0 = no ink, 255 = full ink
        // data is a Uint8ClampedArray and i is a bounded loop index.
        // eslint-disable-next-line security/detect-object-injection
        const inkDensity = 255 - (data[i] ?? 0);
        // Tinted color = white * (1 - density/255) + channelColor * (density/255)
        const t = inkDensity / 255;
        // eslint-disable-next-line security/detect-object-injection
        data[i] = Math.round(255 * (1 - t) + (rgb[0] ?? 0) * t);
        data[i + 1] = Math.round(255 * (1 - t) + (rgb[1] ?? 0) * t);
        data[i + 2] = Math.round(255 * (1 - t) + (rgb[2] ?? 0) * t);
        data[i + 3] = 255;
      }

      offCtx.putImageData(imageData, 0, 0);

      // Multiply blend onto main canvas
      ctx.globalCompositeOperation = "multiply";
      ctx.drawImage(offscreen, 0, 0);
    }

    // Reset blend mode
    ctx.globalCompositeOperation = "source-over";
  }, [width, height, enabledChannels, channelImages, allChannels]);

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
