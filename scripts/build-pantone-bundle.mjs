#!/usr/bin/env node
/**
 * Regenerate `host/spotColor/pantoneFormulaGuide.ts` from the
 * lint-pdf Pantone reference database.
 *
 * Default source: `../lint-pdf/src/lintpdf/profiles/icc/pantone_reference.json`
 * (community-measured, public-domain colour science values; not
 * official Pantone proprietary data).
 *
 * Override the source path:
 *   PANTONE_REFERENCE_PATH=/abs/path/full.json node scripts/build-pantone-bundle.mjs
 *
 * Override the libraries to include (comma-separated, trims whitespace):
 *   PANTONE_LIBRARIES="Pantone Formula Guide Coated,Pantone Formula Guide Uncoated" \
 *     node scripts/build-pantone-bundle.mjs
 *
 * The output stays in pure-data shape: `{ lab?, cmyk? }` per Pantone
 * name — the resolver maps that to RGB at runtime via the CIE Lab
 * (D50) → sRGB pipeline. We intentionally drop the verbose `library`,
 * `lab_source`, and `cmyk_source` provenance fields to keep the
 * shipped bundle small (~290 kB minified for ~4,600 colours).
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const defaultSource = resolve(
  repoRoot,
  "..",
  "lint-pdf",
  "src",
  "lintpdf",
  "profiles",
  "icc",
  "pantone_reference.json",
);
const sourcePath = process.env.PANTONE_REFERENCE_PATH ?? defaultSource;

const defaultLibraries = [
  "Pantone Formula Guide Coated",
  "Pantone Formula Guide Uncoated",
];
const libraries = (process.env.PANTONE_LIBRARIES ?? defaultLibraries.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const wantedSet = new Set(libraries);

const outPath = resolve(repoRoot, "host", "spotColor", "pantoneFormulaGuide.ts");

const raw = await readFile(sourcePath, "utf8");
const data = JSON.parse(raw);
const colors = data.colors ?? {};

const subset = {};
for (const [name, value] of Object.entries(colors)) {
  if (!wantedSet.has(value?.library)) continue;
  const entry = {};
  if (Array.isArray(value.lab) && value.lab.length === 3) {
    entry.lab = value.lab.map((x) => Math.round(x * 100) / 100);
  }
  if (Array.isArray(value.cmyk_bridge) && value.cmyk_bridge.length === 4) {
    entry.cmyk = value.cmyk_bridge.map((x) => Math.round(x * 10) / 10);
  }
  if (entry.lab) subset[name] = entry;
}

const sortedKeys = Object.keys(subset).sort();
const sorted = {};
for (const key of sortedKeys) sorted[key] = subset[key];

const meta = {
  source: "Subset of lint-pdf pantone_reference.json",
  license: "Public domain color science measurements; not official Pantone data",
  libraries,
  count: sortedKeys.length,
  generated: new Date().toISOString().slice(0, 10),
};

const body =
  `/**\n` +
  ` * Auto-generated bundled Pantone reference. Do not edit by hand.\n` +
  ` * Regenerate via \`scripts/build-pantone-bundle.mjs\`.\n` +
  ` *\n` +
  ` * Source: ${meta.source}\n` +
  ` * Libraries: ${libraries.join("; ")}\n` +
  ` * Entries: ${meta.count}\n` +
  ` *\n` +
  ` * @internal\n` +
  ` */\n\n` +
  `export interface BundledPantoneEntry {\n` +
  `  /** CIE Lab (D50, 2° observer). */\n` +
  `  readonly lab?: readonly [number, number, number];\n` +
  `  /** Color Bridge CMYK approximation (percent, 0-100). */\n` +
  `  readonly cmyk?: readonly [number, number, number, number];\n` +
  `}\n\n` +
  `export const pantoneFormulaGuideMeta = ${JSON.stringify(meta)} as const;\n\n` +
  `export const pantoneFormulaGuide: Readonly<Record<string, BundledPantoneEntry>> = ` +
  `${JSON.stringify(sorted)};\n`;

await writeFile(outPath, body, "utf8");
console.log(
  `[build-pantone-bundle] wrote ${outPath} (${meta.count} colours, ${(body.length / 1024).toFixed(1)} kB)`,
);
