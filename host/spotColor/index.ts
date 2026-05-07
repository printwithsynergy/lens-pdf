/**
 * Spot-ink swatch colour resolution surface.
 *
 * The viewer used to colour spot-ink chips and separation tints from
 * a hash of the ink name. This package replaces that with a
 * source-of-truth resolver that prefers (in order):
 *
 *   host override → codex extracted Lab/CMYK → bundled Pantone
 *   reference → curated semantic map → hash fallback
 *
 * Hosts integrating loupe-pdf reach for {@link resolveSpotSwatchColor}
 * directly when wiring custom panels; the four built-in tools
 * (`browser/index.ts`, `<SeparationCanvas>`, `<ColorPickerTool>`,
 * `<DensitometerTool>`) all consume the same resolver internally.
 *
 * @public
 */

export {
  resolveSpotSwatchColor,
  hashHueRgb,
} from "./resolveSpotSwatchColor";
export type {
  CmykQuad,
  CodexSpotIntent,
  LabTriplet,
  ResolveSpotSwatchColorOptions,
  RgbTriplet,
  SpotInkOverride,
  SpotOverrideMap,
  SpotSwatchResolution,
  SpotSwatchSource,
} from "./resolveSpotSwatchColor";
export { labD50ToSrgb, cmykToSrgb } from "./colorMath";
export { normalizePantoneName, alternatePantoneKey } from "./normalize";
export { lookupPantoneSpot, pantoneFormulaGuideMeta } from "./pantone";
export type { PantoneLookupResult, PantoneRefMap } from "./pantone";
export { lookupCuratedSpot, curatedSpotEntries } from "./curated";
export type { CuratedSpotEntry } from "./curated";
