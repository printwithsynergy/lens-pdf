/**
 * Curated semantic map for non-Pantone spot inks. Print artwork
 * routinely declares spots whose names describe a *role* (Cut,
 * Dieline, Bleed, Varnish, White, Foil, Silver, Gold) rather than
 * a Pantone reference. None of those resolve through the Pantone
 * database, but every shop expects a consistent, recognisable swatch
 * — `Cut` always magenta, `Dieline` always violet, `Varnish` always
 * a translucent gloss tint, etc.
 *
 * The mapping uses substring matching against the lower-cased name
 * after stripping punctuation. Order matters: more specific names
 * come first (`silver` before `gray`).
 *
 * @internal
 */

/** Curated swatch entry — RGB + a stable display label. */
export interface CuratedSpotEntry {
  /** sRGB triplet, 0-255. */
  readonly rgb: readonly [number, number, number];
  /** Substrings (lower-cased) that match this entry. */
  readonly tokens: readonly string[];
}

/**
 * Ordered curated swatches. First match wins. Hosts can extend via
 * the `hostOverride` channel on the resolver — this list intentionally
 * stays small to cover the common print-prepress vocabulary without
 * second-guessing brand colour decisions.
 */
export const curatedSpotEntries: readonly CuratedSpotEntry[] = [
  // Cut / dieline / bleed lines — distinct, high-contrast hues so the
  // overlay doesn't disappear against typical artwork.
  { rgb: [236, 0, 140], tokens: ["cutcontour", "cut contour", "cutter"] },
  { rgb: [236, 0, 140], tokens: ["cut "] },
  { rgb: [236, 0, 140], tokens: ["cut-line", "cutline"] },
  { rgb: [148, 0, 211], tokens: ["dieline", "die-line", "die line", "die cut", "diecut"] },
  { rgb: [255, 165, 0], tokens: ["bleed"] },
  { rgb: [0, 112, 192], tokens: ["safe area", "safe-area", "safety"] },
  { rgb: [60, 180, 75], tokens: ["fold"] },
  { rgb: [128, 0, 128], tokens: ["perf", "perforation"] },
  { rgb: [220, 20, 60], tokens: ["score"] },
  { rgb: [70, 130, 180], tokens: ["registration"] },

  // Finishes — visualised as their physical appearance, lightly
  // tinted so the swatch reads as "this is a non-ink layer".
  { rgb: [220, 220, 230], tokens: ["varnish", "gloss", "matte", "satin"] },
  { rgb: [240, 240, 245], tokens: ["spot uv", "spot-uv", "uv coat"] },
  { rgb: [248, 248, 252], tokens: ["white"] },
  { rgb: [200, 200, 200], tokens: ["aqueous", "primer", "overprint clear"] },

  // Generic foil (cool grey-silver) BEFORE the more specific
  // metallic colours so a name like "Silver Foil" still resolves to
  // the silver tint via the explicit `silver` token.
  { rgb: [165, 165, 175], tokens: ["foil"] },
  { rgb: [192, 192, 192], tokens: ["silver", "metallic silver"] },
  { rgb: [212, 175, 55], tokens: ["gold", "metallic gold"] },
  { rgb: [184, 115, 51], tokens: ["copper"] },
  { rgb: [80, 50, 20], tokens: ["bronze"] },
];

/**
 * Resolve a curated swatch from a spot name, or return `null` when no
 * curated entry applies. Matching is substring against the lower-cased
 * input.
 *
 * @internal
 */
export function lookupCuratedSpot(spotName: string): CuratedSpotEntry | null {
  const haystack = spotName.toLowerCase();
  for (const entry of curatedSpotEntries) {
    for (const token of entry.tokens) {
      if (haystack.includes(token)) return entry;
    }
  }
  return null;
}
