/**
 * Module-local constants extracted to break a circular import between
 * `browser/index.ts` and `browser/codexOverlay.ts`. Astro / Node SSR
 * evaluates ESM modules in a strict order, and re-exporting
 * `codexOverlay` from `index` while `codexOverlay` reads
 * `PROCESS_CHANNELS` back from `index` triggered a TDZ
 * `Cannot access '_CHANNELS' before initialization` at request time.
 *
 * Keep this file dependency-free.
 */

/** Process inks the demo synthesises from RGB. */
export const PROCESS_CHANNELS = ["Cyan", "Magenta", "Yellow", "Black"] as const;
