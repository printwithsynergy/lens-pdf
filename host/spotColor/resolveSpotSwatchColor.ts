/**
 * `resolveSpotSwatchColor` — the single source of truth for spot-ink
 * swatch colour decisions in the loupe-pdf viewer. Replaces the
 * legacy hash-of-name fallback that previously drove `getInks()`,
 * `<SeparationCanvas>`, `<ColorPickerTool>`, and `<DensitometerTool>`.
 *
 * Acceptance order — first hit wins, source recorded:
 *
 *   1. **host**    — explicit per-ink override the embedding host
 *                    passed via `BrowserViewerServicesOptions.spotOverrides`.
 *   2. **codex**   — Lab/CMYK/RGB the codex extractor surfaced for the
 *                    spot colorant on its parent colour space (or a
 *                    canonical ``pantone_name`` it recognised).
 *   3. **pantone** — bundled Pantone Formula Guide subset (Coated +
 *                    Uncoated, 4,600+ colours, Lab D50 + Color Bridge
 *                    CMYK), looked up via canonicalised name.
 *   4. **curated** — semantic map (cut, dieline, varnish, foil,
 *                    silver, gold, etc.) so role-named spots get a
 *                    recognisable swatch.
 *   5. **hash**    — final tie-breaker. Hash-derived hue, returned
 *                    only with `source: "hash"` so UIs can mark the
 *                    swatch as approximate.
 *
 * The result always includes a concrete `rgb` value; downstream code
 * must never need a fallback. `lab`, `cmyk`, and `pantone_name` are
 * populated whenever the chosen source carried that information.
 *
 * @public
 */

import { cmykToSrgb, labD50ToSrgb } from "./colorMath";
import { lookupCuratedSpot } from "./curated";
import {
  lookupPantoneSpot,
  type PantoneRefMap,
} from "./pantone";

/**
 * Provenance label for {@link SpotSwatchResolution}. UI surfaces
 * should consider anything other than `host`, `codex`, or `pantone`
 * to be approximate and may visually mark the swatch (small badge,
 * tooltip, etc.) so users can tell intent-accurate colours from
 * conventional ones.
 *
 * @public
 */
export type SpotSwatchSource = "host" | "codex" | "pantone" | "curated" | "hash";

/** Triple of CIE Lab (D50, 2° observer) coordinates. */
export type LabTriplet = [number, number, number];
/** Quad of CMYK values; supports either 0-1 or 0-100 ranges. */
export type CmykQuad = [number, number, number, number];
/** Triple of sRGB channel values, 0-255. */
export type RgbTriplet = [number, number, number];

/**
 * Per-ink colour intent the host can pass on the
 * `BrowserViewerServicesOptions.spotOverrides` map. Any of `rgb`,
 * `lab`, or `cmyk` may be specified; precedence within an override
 * is `rgb` → `lab` → `cmyk`.
 *
 * @public
 */
export interface SpotInkOverride {
  readonly rgb?: RgbTriplet;
  readonly lab?: LabTriplet;
  readonly cmyk?: CmykQuad;
  /**
   * Optional canonical Pantone name surfaced to the UI when this
   * override applies. Useful when a host wants the swatch label to
   * read "PANTONE 485 C" even though the colour came from a brand-
   * specific override of the canonical Pantone Lab.
   */
  readonly pantone_name?: string;
}

/**
 * Per-ink colour intent the codex extractor surfaced. This is the
 * additive contract the codex adapter populates from
 * `color_spaces[*].spot_colorants[*]`. All fields optional; the
 * resolver picks the strongest signal available.
 *
 * Fields are mutable so the codex adapter can assemble the shape
 * field-by-field without per-attempt type gymnastics.
 *
 * @public
 */
export interface CodexSpotIntent {
  rgb?: RgbTriplet;
  lab?: LabTriplet;
  cmyk?: CmykQuad;
  /**
   * Canonical Pantone name (post-normalisation) when the codex
   * extractor identified this colorant as a known PMS reference.
   * The resolver uses this to pull Lab from the bundled DB if codex
   * itself didn't carry per-colorant Lab.
   */
  pantone_name?: string;
}

/**
 * Options controlling {@link resolveSpotSwatchColor}.
 *
 * @public
 */
export interface ResolveSpotSwatchColorOptions {
  /** Explicit host-supplied override; highest precedence. */
  readonly hostOverride?: SpotInkOverride;
  /** Codex-extracted colour intent for this spot colorant. */
  readonly codex?: CodexSpotIntent;
  /**
   * Optional extra Pantone reference entries the host wants merged
   * with the bundled Formula Guide subset. Keys are Pantone names
   * (any spacing / casing); values follow the bundled shape.
   */
  readonly extraPantoneRefs?: PantoneRefMap;
}

/**
 * Result of resolving a spot ink to a display swatch.
 *
 * `rgb` is always set. The other fields are populated when the chosen
 * source provided them, so UIs that want to show "Lab values are
 * available" / "from Color Bridge CMYK" badges have the data they need.
 *
 * @public
 */
export interface SpotSwatchResolution {
  /** sRGB triplet 0-255 — always populated. */
  readonly rgb: RgbTriplet;
  /** Provenance of {@link rgb}. */
  readonly source: SpotSwatchSource;
  /** CIE Lab (D50) when known. */
  readonly lab?: LabTriplet;
  /** CMYK approximation (percent or 0-1) when known. */
  readonly cmyk?: CmykQuad;
  /** Canonical Pantone name (when matched). */
  readonly pantone_name?: string;
}

// ---------------------------------------------------------------------------
// Tier evaluators
// ---------------------------------------------------------------------------

function tryHost(override: SpotInkOverride | undefined): SpotSwatchResolution | null {
  if (!override) return null;
  const { rgb, lab, cmyk, pantone_name } = override;
  if (rgb) {
    return {
      rgb,
      source: "host",
      ...(lab ? { lab } : {}),
      ...(cmyk ? { cmyk } : {}),
      ...(pantone_name ? { pantone_name } : {}),
    };
  }
  if (lab) {
    return {
      rgb: labD50ToSrgb(lab),
      source: "host",
      lab,
      ...(cmyk ? { cmyk } : {}),
      ...(pantone_name ? { pantone_name } : {}),
    };
  }
  if (cmyk) {
    return {
      rgb: cmykToSrgb(cmyk),
      source: "host",
      cmyk,
      ...(pantone_name ? { pantone_name } : {}),
    };
  }
  return null;
}

function tryCodex(
  codex: CodexSpotIntent | undefined,
  extraPantoneRefs: PantoneRefMap | undefined,
): SpotSwatchResolution | null {
  if (!codex) return null;
  const { rgb, lab, cmyk, pantone_name } = codex;
  if (rgb) {
    return {
      rgb,
      source: "codex",
      ...(lab ? { lab } : {}),
      ...(cmyk ? { cmyk } : {}),
      ...(pantone_name ? { pantone_name } : {}),
    };
  }
  if (lab) {
    return {
      rgb: labD50ToSrgb(lab),
      source: "codex",
      lab,
      ...(cmyk ? { cmyk } : {}),
      ...(pantone_name ? { pantone_name } : {}),
    };
  }
  if (cmyk) {
    return {
      rgb: cmykToSrgb(cmyk),
      source: "codex",
      cmyk,
      ...(pantone_name ? { pantone_name } : {}),
    };
  }
  // Codex carried no direct colour intent, but may have a canonical
  // PANTONE name we can resolve through the bundled DB. Surface as
  // `pantone` source so the UI knows the values came from the named
  // reference, not free-form codex measurements.
  if (pantone_name) {
    const ref = lookupPantoneSpot(pantone_name, extraPantoneRefs);
    if (ref) return tieredFromPantone(ref);
  }
  return null;
}

function tieredFromPantone(
  ref: { lab?: readonly [number, number, number]; cmyk?: readonly [number, number, number, number]; pantone_name: string },
): SpotSwatchResolution {
  if (ref.lab) {
    const lab: LabTriplet = [ref.lab[0], ref.lab[1], ref.lab[2]];
    return {
      rgb: labD50ToSrgb(lab),
      source: "pantone",
      lab,
      ...(ref.cmyk
        ? { cmyk: [ref.cmyk[0], ref.cmyk[1], ref.cmyk[2], ref.cmyk[3]] as CmykQuad }
        : {}),
      pantone_name: ref.pantone_name,
    };
  }
  if (ref.cmyk) {
    const cmyk: CmykQuad = [ref.cmyk[0], ref.cmyk[1], ref.cmyk[2], ref.cmyk[3]];
    return {
      rgb: cmykToSrgb(cmyk),
      source: "pantone",
      cmyk,
      pantone_name: ref.pantone_name,
    };
  }
  // Pantone bundle entries always have lab; this branch is defensive.
  return {
    rgb: hashHueRgb(ref.pantone_name),
    source: "pantone",
    pantone_name: ref.pantone_name,
  };
}

function tryPantone(
  spotName: string,
  extraPantoneRefs: PantoneRefMap | undefined,
): SpotSwatchResolution | null {
  const ref = lookupPantoneSpot(spotName, extraPantoneRefs);
  if (!ref) return null;
  return tieredFromPantone(ref);
}

function tryCurated(spotName: string): SpotSwatchResolution | null {
  const entry = lookupCuratedSpot(spotName);
  if (!entry) return null;
  return {
    rgb: [entry.rgb[0], entry.rgb[1], entry.rgb[2]],
    source: "curated",
  };
}

/**
 * Stable hash-of-name → HSL → sRGB. Identical algorithm to the
 * legacy fallback so existing visual identities don't shuffle when a
 * truly unknown spot is rendered. Always tagged `source: "hash"`.
 *
 * @internal
 */
export function hashHueRgb(name: string): RgbTriplet {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (name.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  const s = 0.7;
  const l = 0.45;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return [
    Math.max(0, Math.min(255, Math.round((r + m) * 255))),
    Math.max(0, Math.min(255, Math.round((g + m) * 255))),
    Math.max(0, Math.min(255, Math.round((b + m) * 255))),
  ];
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Resolve a single spot-ink name to a display swatch + provenance.
 *
 * Process inks (Cyan, Magenta, Yellow, Black) should NOT go through
 * this function — they keep their canonical CMYK primaries. The
 * resolver is reserved for `Separation` / `DeviceN` colorants whose
 * intent isn't fixed by the colour model.
 *
 * @public
 */
export function resolveSpotSwatchColor(
  spotName: string,
  options: ResolveSpotSwatchColorOptions = {},
): SpotSwatchResolution {
  const { hostOverride, codex, extraPantoneRefs } = options;
  return (
    tryHost(hostOverride) ??
    tryCodex(codex, extraPantoneRefs) ??
    tryPantone(spotName, extraPantoneRefs) ??
    tryCurated(spotName) ?? {
      rgb: hashHueRgb(spotName),
      source: "hash",
    }
  );
}

/**
 * Map of spot ink names → host override values. Re-exported as a
 * convenience for the ``BrowserViewerServicesOptions.spotOverrides``
 * type.
 *
 * @public
 */
export type SpotOverrideMap = Readonly<Record<string, SpotInkOverride>>;
