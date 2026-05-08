/**
 * Pantone reference lookup against the bundled Formula Guide subset.
 *
 * Hosts that need additional libraries (Color Bridge CMYK, Metallics,
 * Pastels & Neons, FHI textile sets) can either:
 *
 *   1. Pass a richer reference via {@link withExtraPantoneRefs} when
 *      building services — bundle a JSON they own and merge it in.
 *   2. Regenerate the bundled file from a fuller source via the
 *      `scripts/build-pantone-bundle.mjs` build script (drives the
 *      `PANTONE_LIBRARIES` env override).
 *
 * The lookup canonicalises names using {@link normalizePantoneName} +
 * {@link alternatePantoneKey} so the standard ``"PANTONE 485 C"`` /
 * ``"PANTONE 485C"`` / ``"Pantone 485 c"`` variants all resolve.
 *
 * @internal
 */

import { alternatePantoneKey, normalizePantoneName } from "./normalize";
import {
  pantoneFormulaGuide,
  type BundledPantoneEntry,
} from "./pantoneFormulaGuide";

export type PantoneRefMap = Readonly<Record<string, BundledPantoneEntry>>;

interface IndexedEntry {
  readonly entry: BundledPantoneEntry;
  /** Original (display-canonical) key as stored in the source map. */
  readonly originalName: string;
}

let cachedNormalizedIndex: Map<string, IndexedEntry> | null = null;
let runtimeInkbook: PantoneRefMap | null = null;

/**
 * Inject a Pantone inkbook fetched from the codex authority.
 *
 * As of loupe-pdf 0.3.0-beta.37 / codex-pdf 1.4.0, the bundled
 * Formula Guide subset is no longer shipped with this package.
 * Hosts that want full Pantone-name resolution call this once at
 * startup with the catalogue retrieved from
 * :func:`@printwithsynergy/codex-client.HttpClient#getInkbook`.
 *
 * Subsequent calls replace the previous catalogue; resolver state
 * is invalidated so the next lookup rebuilds the index.
 *
 * @public
 */
export function setBundledPantoneInkbook(map: PantoneRefMap | null): void {
  runtimeInkbook = map;
  cachedNormalizedIndex = null;
}

function buildIndex(): Map<string, IndexedEntry> {
  if (cachedNormalizedIndex) return cachedNormalizedIndex;
  const map = new Map<string, IndexedEntry>();
  // Static bundled DB (legacy seam — empty in 1.4.0+; kept so existing
  // unit tests that monkey-patch the file still type-check).
  for (const [name, entry] of Object.entries(pantoneFormulaGuide)) {
    map.set(normalizePantoneName(name), { entry, originalName: name });
  }
  // Runtime inkbook injected by the host via setBundledPantoneInkbook.
  if (runtimeInkbook) {
    for (const [name, entry] of Object.entries(runtimeInkbook)) {
      map.set(normalizePantoneName(name), { entry, originalName: name });
    }
  }
  cachedNormalizedIndex = map;
  return map;
}

function indexExtras(extraRefs: PantoneRefMap): Map<string, IndexedEntry> {
  const map = new Map<string, IndexedEntry>();
  for (const [name, entry] of Object.entries(extraRefs)) {
    map.set(normalizePantoneName(name), { entry, originalName: name });
  }
  return map;
}

/**
 * Result of a Pantone reference lookup. `pantone_name` carries the
 * display-canonical key from the bundled DB (preserving the original
 * casing — e.g. "PANTONE Reflex Blue C", not "PANTONE REFLEX BLUE C")
 * so UI tooltips read naturally.
 *
 * @internal
 */
export interface PantoneLookupResult extends BundledPantoneEntry {
  readonly pantone_name: string;
}

/**
 * Look up a spot name in the bundled Pantone Formula Guide subset and
 * any extra reference maps the host supplied. Returns `null` when the
 * name is not recognised.
 *
 * Search order:
 *   1. Extra refs (per-call) — exact normalized match.
 *   2. Extra refs — alternate-key (toggle space before C/U/M/V).
 *   3. Bundled Formula Guide — exact normalized match.
 *   4. Bundled Formula Guide — alternate-key.
 *
 * Extra refs take precedence so hosts can override or fill in entries
 * without rebuilding the package.
 *
 * @internal
 */
export function lookupPantoneSpot(
  spotName: string,
  extraRefs?: PantoneRefMap,
): PantoneLookupResult | null {
  const key = normalizePantoneName(spotName);
  const altKey = alternatePantoneKey(key);
  const index = buildIndex();

  if (extraRefs) {
    const normalizedExtras = indexExtras(extraRefs);
    const direct = normalizedExtras.get(key);
    if (direct) return { ...direct.entry, pantone_name: direct.originalName };
    if (altKey) {
      const alt = normalizedExtras.get(altKey);
      if (alt) return { ...alt.entry, pantone_name: alt.originalName };
    }
  }

  const direct = index.get(key);
  if (direct) return { ...direct.entry, pantone_name: direct.originalName };
  if (altKey) {
    const alt = index.get(altKey);
    if (alt) return { ...alt.entry, pantone_name: alt.originalName };
  }
  return null;
}

/**
 * Convenience alias for callers that want to present the bundled
 * reference metadata (e.g. "Pantone Formula Guide Coated/Uncoated,
 * 4646 colours bundled") in a UI.
 *
 * @public
 */
export { pantoneFormulaGuideMeta } from "./pantoneFormulaGuide";
