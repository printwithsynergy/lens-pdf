/**
 * Tiny, dependency-free colour-space conversions used by the spot
 * swatch resolver. Two paths matter for swatch display:
 *
 *   1. Pantone Lab (D50, 2° observer) → sRGB triplet, via XYZ + a
 *      Bradford D50→D65 chromatic adaptation. Pantone publishes Lab
 *      under D50 and that's what the bundled reference holds.
 *   2. CMYK → sRGB, naïve subtractive composite — only used as a
 *      fallback when no Lab is available. This is intentionally
 *      approximate; a real CMM pass would need an output ICC profile,
 *      which the browser viewer does not own.
 *
 * Numbers here favour readability over micro-optimisation; the resolver
 * runs once per spot ink, not per pixel.
 *
 * @internal
 */

/**
 * Bradford-adapted D50 → D65 transform of the Pantone reference Lab
 * white. Computed once; identical to the matrix Krita / Lcms ship.
 */
// linear sRGB → XYZ_D65 (Rec. 709 / IEC 61966-2-1)
const XYZ_D65_FROM_LINEAR_SRGB = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

// Inverse of XYZ_D65_FROM_LINEAR_SRGB.
const LINEAR_SRGB_FROM_XYZ_D65 = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

// Bradford D50 → D65 chromatic adaptation matrix (ICC-published).
const D50_TO_D65 = [
  [0.9555766, -0.0230393, 0.0631636],
  [-0.0282895, 1.0099416, 0.0210077],
  [0.0122982, -0.020483, 1.3299098],
];

/** D50 reference white tristimulus (CIE 2° observer, X/Y/Z). */
const D50_WHITE: [number, number, number] = [0.9642, 1.0, 0.8249];

function matMul3([a, b, c]: [number, number, number], m: number[][]): [number, number, number] {
  return [
    (m[0]?.[0] ?? 0) * a + (m[0]?.[1] ?? 0) * b + (m[0]?.[2] ?? 0) * c,
    (m[1]?.[0] ?? 0) * a + (m[1]?.[1] ?? 0) * b + (m[1]?.[2] ?? 0) * c,
    (m[2]?.[0] ?? 0) * a + (m[2]?.[1] ?? 0) * b + (m[2]?.[2] ?? 0) * c,
  ];
}

/**
 * sRGB gamma encode. `linear` is in [0, 1]; output stays in [0, 1].
 * Uses the standard piecewise transform from IEC 61966-2-1.
 */
function srgbEncode(linear: number): number {
  const v = Math.max(0, Math.min(1, linear));
  if (v <= 0.0031308) return 12.92 * v;
  return 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

/**
 * Inverse of {@link srgbEncode}. Used only when a host hands us a
 * 0–255 sRGB triple and we want to ensure round-tripping precision
 * isn't lost in the curated → Lab metadata path. Currently unused.
 *
 * @public
 */
export function srgbDecode(channel: number): number {
  const v = Math.max(0, Math.min(1, channel));
  if (v <= 0.04045) return v / 12.92;
  return Math.pow((v + 0.055) / 1.055, 2.4);
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Convert CIE Lab (D50, 2° observer) to an sRGB triplet on [0, 255].
 * Out-of-gamut values are clamped per channel — display chips need a
 * concrete colour, not "undefined".
 *
 * @public
 */
export function labD50ToSrgb([L, a, b]: [number, number, number]): [number, number, number] {
  // Lab → XYZ_D50
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const eps = 216 / 24389;
  const kappa = 24389 / 27;
  const fxCubed = fx * fx * fx;
  const fzCubed = fz * fz * fz;
  const xr = fxCubed > eps ? fxCubed : (116 * fx - 16) / kappa;
  const yr = L > kappa * eps ? Math.pow((L + 16) / 116, 3) : L / kappa;
  const zr = fzCubed > eps ? fzCubed : (116 * fz - 16) / kappa;
  const X50 = xr * (D50_WHITE[0] ?? 0);
  const Y50 = yr * (D50_WHITE[1] ?? 0);
  const Z50 = zr * (D50_WHITE[2] ?? 0);

  // D50 → D65 (Bradford)
  const [X, Y, Z] = matMul3([X50, Y50, Z50], D50_TO_D65);

  // XYZ_D65 → linear sRGB
  const [lr, lg, lb] = matMul3([X, Y, Z], LINEAR_SRGB_FROM_XYZ_D65);

  return [
    clamp255(srgbEncode(lr) * 255),
    clamp255(srgbEncode(lg) * 255),
    clamp255(srgbEncode(lb) * 255),
  ];
}

/**
 * Convert CMYK (each channel either 0–1 or 0–100; auto-detected by
 * range) to a naïve subtractive sRGB triplet on [0, 255].
 *
 * This is only ever called as a 2nd-tier fallback inside the spot
 * resolver — preferred path is Lab. Not ICC-correct; output is fine
 * for a display swatch but should not drive press readouts.
 *
 * @public
 */
export function cmykToSrgb([c, m, y, k]: [number, number, number, number]): [number, number, number] {
  const isPercent = c > 1 || m > 1 || y > 1 || k > 1;
  const div = isPercent ? 100 : 1;
  const cn = c / div;
  const mn = m / div;
  const yn = y / div;
  const kn = k / div;
  const r = (1 - cn) * (1 - kn);
  const g = (1 - mn) * (1 - kn);
  const b = (1 - yn) * (1 - kn);
  return [clamp255(r * 255), clamp255(g * 255), clamp255(b * 255)];
}

/**
 * Reference XYZ matrices exposed for tests.
 *
 * @internal
 */
export const _conversionMatrices = {
  XYZ_D65_FROM_LINEAR_SRGB,
  LINEAR_SRGB_FROM_XYZ_D65,
  D50_TO_D65,
};
