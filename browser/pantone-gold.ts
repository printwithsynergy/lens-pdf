/**
 * Pantone "Gold" / coated-base lookup table — built-in fallback used
 * when no host-provided palette is available and the PDF's tint
 * transform did not yield a usable RGB primary.
 *
 * Hex values are sRGB approximations of the Pantone Coated palette as
 * published by Pantone for screen rendering. They are not a perfect
 * substitute for proofing against a physical Pantone chip, but they
 * give the separations panel a recognisable swatch instead of the
 * generic "every spot is purple" fallback.
 *
 * Lookup is case-insensitive and tolerates the common variants:
 * trailing " C" / " U" suffix, no suffix, whitespace, "PMS " prefix.
 * Add entries as customers report missing spots.
 */

/**
 * Process-plate hex values (CMYK + common neutrals + RGB plates).
 * Process plates are NOT spot colours but they often appear in the
 * same input lists (codex emits them under ``spot_colors`` for
 * convenience). Their swatches must use the canonical primary, not
 * a hash-derived random colour, otherwise the side panel renders
 * "Cyan" as orange and "Magenta" as blue.
 */
const PROCESS_PLATE: Record<string, string> = {
  cyan: "#00aeef",
  magenta: "#ec008c",
  yellow: "#ffe600",
  black: "#101820",
  // Common synonyms / overprint variants
  "process cyan": "#00aeef",
  "process magenta": "#ec008c",
  "process yellow": "#ffe600",
  "process black": "#101820",
  k: "#101820",
  c: "#00aeef",
  m: "#ec008c",
  y: "#ffe600",
  // Display-RGB plates (some PDFs declare these as "spots")
  red: "#ed1c24",
  green: "#00a651",
  blue: "#0072bc",
  white: "#ffffff",
};

const RAW: Array<[string, string]> = [
  // Reds / pinks / magentas
  ["PANTONE 185 C", "#e4002b"],
  ["PANTONE 186 C", "#c8102e"],
  ["PANTONE 187 C", "#a6192e"],
  ["PANTONE 199 C", "#d50032"],
  ["PANTONE 200 C", "#ba0c2f"],
  ["PANTONE 201 C", "#9d2235"],
  ["PANTONE 219 C", "#da1884"],
  ["PANTONE 225 C", "#c6168d"],
  ["PANTONE 226 C", "#d0006f"],
  ["PANTONE 227 C", "#a50050"],
  ["PANTONE 232 C", "#e93cac"],
  ["PANTONE 233 C", "#cf0989"],
  ["PANTONE 234 C", "#a50761"],
  ["PANTONE 235 C", "#871650"],
  ["PANTONE 236 C", "#da1884"],
  ["PANTONE 237 C", "#de3d83"],
  ["PANTONE 238 C", "#df6daa"],
  ["PANTONE 239 C", "#e277b8"],
  ["PANTONE 240 C", "#d57bbf"],
  ["PANTONE 241 C", "#c41e85"],
  ["PANTONE 242 C", "#80225f"],
  ["PANTONE 485 C", "#da291c"],
  ["PANTONE 1795 C", "#d22630"],
  ["PANTONE 1797 C", "#c8102e"],
  ["PROCESS MAGENTA C", "#d6006f"],
  ["RUBINE RED C", "#ce0058"],
  ["RHODAMINE RED C", "#e10098"],
  ["WARM RED C", "#f9423a"],

  // Oranges / yellows
  ["PANTONE 021 C", "#fe5000"],
  ["PANTONE 151 C", "#ff8200"],
  ["PANTONE 158 C", "#e87722"],
  ["PANTONE 165 C", "#ff671f"],
  ["PANTONE 172 C", "#fa4616"],
  ["PANTONE 122 C", "#fed141"],
  ["PANTONE 123 C", "#ffc72c"],
  ["PANTONE 124 C", "#eaaa00"],
  ["PANTONE 125 C", "#b58500"],
  ["PANTONE 109 C", "#ffd100"],
  ["PANTONE 116 C", "#ffcd00"],
  ["PANTONE 7405 C", "#f1c400"],
  ["PROCESS YELLOW C", "#ffe600"],
  ["YELLOW C", "#fedd00"],

  // Greens
  ["PANTONE 354 C", "#00b140"],
  ["PANTONE 355 C", "#009639"],
  ["PANTONE 356 C", "#007a33"],
  ["PANTONE 348 C", "#00843d"],
  ["PANTONE 347 C", "#009a44"],
  ["PANTONE 368 C", "#78be20"],
  ["PANTONE 376 C", "#84bd00"],
  ["PANTONE 382 C", "#c4d600"],
  ["GREEN C", "#00ab84"],

  // Blues / cyans
  ["PANTONE 286 C", "#0033a0"],
  ["PANTONE 287 C", "#003087"],
  ["PANTONE 293 C", "#003da5"],
  ["PANTONE 300 C", "#005eb8"],
  ["PANTONE 285 C", "#0072ce"],
  ["PANTONE 2935 C", "#0057b8"],
  ["PANTONE 7461 C", "#0083be"],
  ["PANTONE 312 C", "#00a7e1"],
  ["PANTONE 313 C", "#0098c4"],
  ["PANTONE 314 C", "#008ca8"],
  ["PROCESS CYAN C", "#00b0e6"],
  ["PROCESS BLUE C", "#0085ca"],
  ["REFLEX BLUE C", "#001489"],

  // Purples
  ["PANTONE 2685 C", "#330072"],
  ["PANTONE 267 C", "#5f249f"],
  ["PANTONE 268 C", "#582c83"],
  ["PANTONE 2603 C", "#67178c"],
  ["PANTONE 2613 C", "#5c0f8b"],
  ["PANTONE 2623 C", "#621243"],
  ["PURPLE C", "#a73dad"],
  ["VIOLET C", "#440099"],

  // Browns / neutrals / blacks
  ["PANTONE 4625 C", "#4a2c2a"],
  ["PANTONE 4695 C", "#603d20"],
  ["PANTONE 477 C", "#623b2a"],
  ["PANTONE 7531 C", "#917469"],
  ["PANTONE 432 C", "#333f48"],
  ["PANTONE 877 C", "#8a8d8f"], // metallic silver
  ["PANTONE 871 C", "#84754e"], // metallic gold
  ["PANTONE 872 C", "#85714d"], // metallic gold
  ["BLACK C", "#101820"],
  ["COOL GRAY 11 C", "#53565a"],
  ["COOL GRAY 10 C", "#63666a"],

  // White / paper
  ["WHITE", "#ffffff"],
  ["OPAQUE WHITE", "#ffffff"],
];

function normalize(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/^PMS\s+/, "PANTONE ")
    .replace(/\s+/g, " ");
}

const LOOKUP: Map<string, string> = new Map(RAW.map(([k, v]) => [normalize(k), v.toLowerCase()]));

/**
 * Look up a process-plate name (Cyan / Magenta / Yellow / Black,
 * synonyms, display-RGB plates). Returns ``undefined`` when the
 * name isn't a known process plate so callers can fall through to
 * the Pantone Gold lookup.
 */
export function processPlateLookup(name: string): string | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return PROCESS_PLATE[n];
}

/**
 * Look up a spot-colour name in the built-in Pantone Gold table.
 * Returns ``undefined`` when there's no match; callers fall through
 * to ``rgbToHex(altRgb)`` or the default neutral grey.
 *
 * The match tolerates the common variants — "PANTONE 225 C",
 * "PANTONE 225C", "PMS 225 C", "Pantone 225 c" all resolve to the
 * same entry.
 */
export function pantoneGoldLookup(name: string): string | undefined {
  if (!name) return undefined;
  const n = normalize(name);
  // Direct hit
  const direct = LOOKUP.get(n);
  if (direct) return direct;
  // Coated → Uncoated equivalence: drop the trailing C/U so a "225 U"
  // upload still gets the coated swatch as the best-effort match.
  const stripped = n.replace(/\s+[CU]$/, "");
  if (stripped !== n) {
    const fallback = LOOKUP.get(`${stripped} C`);
    if (fallback) return fallback;
  }
  return undefined;
}

/**
 * Convenience: convert an ``[r, g, b]`` triplet (each 0–255) to a
 * lowercase ``#rrggbb`` hex string.
 */
export function rgbToHex(rgb: readonly [number, number, number]): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const [r, g, b] = rgb;
  return (
    "#" +
    clamp(r).toString(16).padStart(2, "0") +
    clamp(g).toString(16).padStart(2, "0") +
    clamp(b).toString(16).padStart(2, "0")
  );
}

/**
 * Full resolution chain for a single ink. Used by the separations
 * panel + every marketing site's spot-colour swatch render:
 *
 *   1. Built-in process-plate lookup (Cyan / Magenta / Yellow / Black
 *      + synonyms + RGB plates) — always wins because process plates
 *      have canonical primaries that no host should override
 *   2. Host-provided ``spotPalette[name]`` — usually codex's
 *      ``summary.spot_colors.colors[].swatch_hex`` or another
 *      preflight's swatch
 *   3. Built-in Pantone Gold library (~85 most-common Coated codes)
 *   4. PDF tint transform ``altRgb`` (parsed at extraction time)
 *   5. Neutral grey fallback ``#1f2937``
 *
 * The process-plate check sits at the top of the chain because
 * codex (and other engines) hash-derive random colours for process
 * plates when their detector can't read the named alternate. That
 * makes "Cyan" render orange, "Magenta" render blue, etc. The
 * canonical CMYK primaries are non-negotiable.
 */
export function resolveSpotSwatch(
  name: string,
  altRgb: readonly [number, number, number] | null | undefined,
  spotPalette: Record<string, string> | undefined,
): string {
  const plate = processPlateLookup(name);
  if (plate) return plate;
  if (spotPalette) {
    const override = spotPalette[name];
    if (override) return override;
    const caseInsensitive = Object.entries(spotPalette).find(
      ([k]) => k.toLowerCase() === name.toLowerCase(),
    );
    if (caseInsensitive) return caseInsensitive[1];
  }
  const pantone = pantoneGoldLookup(name);
  if (pantone) return pantone;
  if (altRgb && altRgb.length === 3) {
    return rgbToHex(altRgb);
  }
  return "#1f2937";
}
