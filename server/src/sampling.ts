/**
 * Per-pixel sampling derived from a SeparationResult: densitometer,
 * color sample, TAC heatmap. Everything here works on the rendered
 * channel rasters, not the source PDF — so accuracy depends entirely
 * on Ghostscript's separation rendering.
 *
 * Channel rasters are 8-bit grayscale: 0 = full ink coverage,
 * 255 = no ink. We invert to ink density (0-100%) for client-facing
 * outputs.
 */

import sharp from "sharp";
import type { SeparationResult } from "./ghostscript.js";

export interface DensitometerSample {
  x: number;
  y: number;
  dpi: number;
  channels: { name: string; percent: number }[];
  tac: number;
  tac_limit: number;
  limit_exceeded: boolean;
}

export interface ColorSample {
  x: number;
  y: number;
  rgb: [number, number, number];
  hex: string;
  tac: number | null;
}

/**
 * Sample the densitometer at a PDF point. `pdfX/pdfY` come from the
 * client in PDF points with origin lower-left; we convert to canvas
 * pixels (origin upper-left) using the page's pixel dimensions.
 */
export async function sampleDensitometer(args: {
  separations: SeparationResult;
  pageWidthPts: number;
  pageHeightPts: number;
  dpi: number;
  pdfX: number;
  pdfY: number;
  tacLimit: number;
}): Promise<DensitometerSample> {
  const {
    separations,
    pageWidthPts,
    pageHeightPts,
    dpi,
    pdfX,
    pdfY,
    tacLimit,
  } = args;

  if (separations.width === 0 || separations.height === 0) {
    throw new Error("Cannot sample: separations have no rendered dimensions.");
  }

  const ptsToPx = dpi / 72;
  const pxX = clamp(Math.round(pdfX * ptsToPx), 0, separations.width - 1);
  const pxY = clamp(
    Math.round((pageHeightPts - pdfY) * ptsToPx),
    0,
    separations.height - 1,
  );

  const channels: { name: string; percent: number }[] = [];
  let tac = 0;

  for (const [name, png] of Object.entries(separations.channels)) {
    const value = await readPixelGray(png, pxX, pxY);
    // 0 = full ink, 255 = no ink → invert to density
    const percent = ((255 - value) / 255) * 100;
    channels.push({ name, percent });
    tac += percent;
  }

  return {
    x: pdfX,
    y: pdfY,
    dpi,
    channels,
    tac,
    tac_limit: tacLimit,
    limit_exceeded: tac > tacLimit,
  };
}

/**
 * Sample a single RGB pixel from the composite raster. Returns null
 * when no composite was produced.
 */
export async function sampleColor(args: {
  separations: SeparationResult;
  pageWidthPts: number;
  pageHeightPts: number;
  dpi: number;
  pdfX: number;
  pdfY: number;
}): Promise<ColorSample | null> {
  const { separations, pageWidthPts, pageHeightPts, dpi, pdfX, pdfY } = args;
  if (!separations.composite) return null;

  const ptsToPx = dpi / 72;
  const pxX = clamp(Math.round(pdfX * ptsToPx), 0, separations.width - 1);
  const pxY = clamp(
    Math.round((pageHeightPts - pdfY) * ptsToPx),
    0,
    separations.height - 1,
  );

  const [r, g, b] = await readPixelRgb(separations.composite, pxX, pxY);

  // TAC at this point — sum of the per-ink channels.
  let tac = 0;
  for (const png of Object.values(separations.channels)) {
    const v = await readPixelGray(png, pxX, pxY);
    tac += ((255 - v) / 255) * 100;
  }

  return {
    x: pdfX,
    y: pdfY,
    rgb: [r, g, b],
    hex: "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join(""),
    tac,
  };
}

/**
 * Render a TAC heatmap PNG: per-pixel TAC summed across all inks,
 * tinted on a green→yellow→red gradient with the threshold drawn at
 * `tacLimit`.
 */
export async function renderTacHeatmap(args: {
  separations: SeparationResult;
  tacLimit: number;
}): Promise<Buffer> {
  const { separations, tacLimit } = args;
  const w = separations.width;
  const h = separations.height;
  if (w === 0 || h === 0) {
    throw new Error(
      "Cannot render TAC heatmap: separations have no dimensions.",
    );
  }

  // Pull every channel into a flat Uint8Array we can iterate per pixel.
  const channelArrays: Uint8Array[] = [];
  for (const png of Object.values(separations.channels)) {
    const { data } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true });
    channelArrays.push(new Uint8Array(data));
  }

  const out = Buffer.alloc(w * h * 4); // RGBA
  for (let p = 0; p < w * h; p++) {
    let tac = 0;
    for (const arr of channelArrays) {
      // Channel rasters from sharp.raw() come out with one byte per
      // pixel for 8-bit grayscale TIFFs. 0 = ink, 255 = no ink.
      const v = arr[p] ?? 255;
      tac += ((255 - v) / 255) * 100;
    }
    const [r, g, b, a] = tacToRgba(tac, tacLimit);
    const i = p * 4;
    out[i] = r;
    out[i + 1] = g;
    out[i + 2] = b;
    out[i + 3] = a;
  }

  return await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toBuffer();
}

function tacToRgba(
  tac: number,
  limit: number,
): [number, number, number, number] {
  // Below limit: transparent. Above limit: green → yellow → red as
  // the over-coverage grows. Cap at 2× limit for the colour scale.
  if (tac <= limit) return [0, 0, 0, 0];
  const over = Math.min((tac - limit) / limit, 1);
  // Linear interpolation green (0,200,80) → yellow (240,200,40) → red (220,40,40).
  const stops: Array<[number, [number, number, number]]> = [
    [0.0, [0, 200, 80]],
    [0.5, [240, 200, 40]],
    [1.0, [220, 40, 40]],
  ];
  let lo = stops[0]!;
  let hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (over >= stops[i]![0] && over <= stops[i + 1]![0]) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }
  const span = hi[0] - lo[0] || 1;
  const t = (over - lo[0]) / span;
  const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * t);
  const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * t);
  const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * t);
  return [r, g, b, 200];
}

async function readPixelGray(
  png: Buffer,
  x: number,
  y: number,
): Promise<number> {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return data[idx] ?? 255;
}

async function readPixelRgb(
  png: Buffer,
  x: number,
  y: number,
): Promise<[number, number, number]> {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return [data[idx] ?? 0, data[idx + 1] ?? 0, data[idx + 2] ?? 0];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
