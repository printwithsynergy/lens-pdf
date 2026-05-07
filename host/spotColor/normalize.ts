/**
 * Pantone name normalization. Mirrors lint-pdf's
 * `_normalize_pantone_name` so the same canonical-key matching
 * behaviour holds in the browser.
 *
 * Examples:
 *   "Pantone 485 C"   → "PANTONE 485 C"
 *   "PANTONE  485C"   → "PANTONE 485 C"  (via alternate-key fallback)
 *   "  pantone 485 c" → "PANTONE 485 C"
 *   "pantone reflex blue c" → "PANTONE REFLEX BLUE C"
 *
 * @internal
 */

/** Collapse whitespace runs into a single space. */
const SPACE_COLLAPSE = /\s+/g;

/**
 * Canonicalise a Pantone-style name to UPPERCASE with collapsed
 * whitespace. Idempotent; safe to call on already-normalised values.
 *
 * @internal
 */
export function normalizePantoneName(name: string): string {
  return name.trim().toUpperCase().replace(SPACE_COLLAPSE, " ");
}

/**
 * Try alternate spacings around the trailing finish suffix (one of
 * `C`, `U`, `M`, `V`). The bundled Pantone JSON ships with the
 * "PANTONE 485 C" form; some PDF producers emit "PANTONE 485C". We
 * accept both by toggling the space and retrying lookup.
 *
 * Returns `null` when the input doesn't have a recognised finish
 * suffix at all.
 *
 * @internal
 */
export function alternatePantoneKey(key: string): string | null {
  // "PANTONE 485 C" → "PANTONE 485C". Try this first because the
  // no-space pattern below would otherwise also match (with a
  // trailing-space body) and produce "PANTONE 485  C".
  const withSpace = /^(PANTONE\s+.+?)\s+([CUMV])$/.exec(key);
  if (withSpace) return `${withSpace[1]}${withSpace[2]}`;
  // "PANTONE 485C" → "PANTONE 485 C". `\S` before the suffix prevents
  // a stray-space match.
  const noSpace = /^(PANTONE\s+.+\S)([CUMV])$/.exec(key);
  if (noSpace) return `${noSpace[1]} ${noSpace[2]}`;
  return null;
}
