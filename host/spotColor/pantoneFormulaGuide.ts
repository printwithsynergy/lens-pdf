/**
 * Pantone reference shape — runtime data is sourced from codex-pdf.
 *
 * As of loupe-pdf 0.3.0-beta.37 / codex-pdf 1.4.0, the bundled
 * Pantone Formula Guide subset that previously lived in this file
 * (~290 kB of inline JSON, generated from
 * ``lint-pdf/src/lintpdf/profiles/icc/pantone_reference.json``) was
 * deleted in favour of the codex authority. Hosts that want
 * Pantone-name → Lab/CMYK resolution in the browser must fetch the
 * inkbook from codex via the TS client and feed it back to
 * loupe-pdf's resolver:
 *
 * ```ts
 * import { HttpClient } from "@printwithsynergy/codex-client";
 * import { setBundledPantoneInkbook } from "@printwithsynergy/loupe-pdf";
 *
 * const codex = new HttpClient();
 * const inkbook = await codex.getInkbook();
 * setBundledPantoneInkbook(
 *   Object.fromEntries(
 *     inkbook.pantone
 *       .filter((entry) => entry.lab)
 *       .map((entry) => [entry.name, { lab: entry.lab!, cmyk: entry.cmyk_bridge }]),
 *   ),
 * );
 * ```
 *
 * Resolver call sites that don't pre-populate the inkbook fall
 * straight through to the curated → hash tiers — exactly the shape
 * the resolver always supported via the ``extraPantoneRefs`` slot.
 *
 * @internal
 */

export interface BundledPantoneEntry {
  /** CIE Lab (D50, 2° observer). */
  readonly lab?: readonly [number, number, number];
  /** Color Bridge CMYK approximation (percent, 0-100). */
  readonly cmyk?: readonly [number, number, number, number];
}

export const pantoneFormulaGuideMeta = {
  source: "codex-pdf 1.4.0+ inkbook (fetch via @printwithsynergy/codex-client)",
  license: "Public domain color science measurements; not official Pantone data",
  libraries: [],
  count: 0,
  generated: "delegated-to-codex",
} as const;

export const pantoneFormulaGuide: Readonly<Record<string, BundledPantoneEntry>> = {};
