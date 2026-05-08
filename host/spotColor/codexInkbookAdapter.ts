/**
 * Codex inkbook adapter — fetches the Pantone catalogue from the
 * codex authority and feeds it into loupe-pdf's resolver.
 *
 * As of loupe-pdf 0.3.0-beta.37 / codex-pdf 1.4.0 the bundled Pantone
 * Formula Guide subset that historically shipped with loupe-pdf has
 * moved to codex-pdf. Hosts now retrieve the canonical inkbook from
 * any deployed codex sidecar via the codex-client, hand it to this
 * adapter, and the adapter wires it into ``setBundledPantoneInkbook``
 * so subsequent {@link resolveSpotSwatchColor} calls hit the codex-
 * authoritative data without per-resolver network round trips.
 *
 * The adapter exposes a single async ``ensure()`` so application code
 * can fire-and-forget at boot:
 *
 * ```ts
 * import { HttpClient } from "@printwithsynergy/codex-client";
 * import { createCodexInkbookAdapter } from "@printwithsynergy/loupe-pdf";
 *
 * const codex = new HttpClient();
 * const inkbook = createCodexInkbookAdapter({ codex });
 * void inkbook.ensure();
 * ```
 *
 * @public
 */

import { setBundledPantoneInkbook } from "./pantone";
import type { PantoneRefMap } from "./pantone";

/**
 * Subset of {@link import("@printwithsynergy/codex-client").HttpClient}
 * the adapter actually calls. Kept structural so hosts can pass either
 * the real package or a hand-rolled fetch wrapper without bringing
 * the runtime dep into loupe-pdf itself.
 *
 * @public
 */
export interface CodexInkbookClient {
  getInkbook(libraries?: string[]): Promise<{
    schema_version: string;
    manifest: {
      included_libraries: string[];
      included_count: number;
    };
    pantone: CodexInkbookEntry[];
    curated: { rgb: [number, number, number]; tokens: string[] }[];
  }>;
}

/**
 * One row of the codex inkbook payload — matches
 * :class:`codex_pdf.color.PantoneEntry`.
 *
 * @public
 */
export interface CodexInkbookEntry {
  name: string;
  library: string | null;
  lab?: [number, number, number];
  cmyk_bridge?: [number, number, number, number];
  lab_source?: string | null;
  cmyk_source?: string | null;
}

/**
 * Adapter handle returned by {@link createCodexInkbookAdapter}.
 *
 * @public
 */
export interface CodexInkbookAdapter {
  /** Fetch the inkbook (first call) and prime the resolver cache. */
  ensure(): Promise<PantoneRefMap>;
  /** Force a refresh, e.g. after a tenant updates custom Pantone overrides. */
  refresh(): Promise<PantoneRefMap>;
  /** Drop the cached map; resolver falls back to bundled (empty) DB. */
  clear(): void;
}

/**
 * Build a codex-backed inkbook adapter.
 *
 * The adapter caches the fetched map per process; concurrent
 * ``ensure()`` calls share a single in-flight request.
 *
 * @public
 */
export function createCodexInkbookAdapter(options: {
  codex: CodexInkbookClient;
  libraries?: string[];
}): CodexInkbookAdapter {
  let cached: PantoneRefMap | null = null;
  let inflight: Promise<PantoneRefMap> | null = null;

  async function fetchAndPrime(): Promise<PantoneRefMap> {
    const payload = await options.codex.getInkbook(options.libraries);
    const map: Record<string, { lab?: readonly [number, number, number]; cmyk?: readonly [number, number, number, number] }> = {};
    for (const entry of payload.pantone) {
      const value: { lab?: readonly [number, number, number]; cmyk?: readonly [number, number, number, number] } = {};
      if (entry.lab) value.lab = entry.lab;
      if (entry.cmyk_bridge) value.cmyk = entry.cmyk_bridge;
      if (value.lab || value.cmyk) {
        map[entry.name] = value;
      }
    }
    cached = map;
    setBundledPantoneInkbook(cached);
    return cached;
  }

  return {
    async ensure() {
      if (cached) return cached;
      if (inflight) return inflight;
      inflight = fetchAndPrime();
      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
    async refresh() {
      inflight = fetchAndPrime();
      try {
        return await inflight;
      } finally {
        inflight = null;
      }
    },
    clear() {
      cached = null;
      setBundledPantoneInkbook(null);
    },
  };
}
