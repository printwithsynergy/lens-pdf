/**
 * loupe-pdf parser-surface audit (0.3.0-beta.36+).
 *
 * Enforces "loupe-pdf does 0% direct PDF byte-level work" by failing
 * the build when ANY runtime path references pdfjs-dist, pdf-lib,
 * `getDocument(`, or other PDF parser primitives outside the codex
 * client.
 *
 * The previous fallback allowlist (browser/index.ts, fallback-pdfjs/,
 * host/pdfFallback.ts) is removed — the codex render service is the
 * only path. Devscript / docs / parity-harness HTML are exempt.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(".");
const reportPath = resolve(root, "reports/parity/parser_surface_report.json");

// Files exempt because they're tooling rather than runtime code.
const allowlist = new Set([
  "scripts/parser-surface-audit.mjs",
  "scripts/render-parity-check.mjs",
  "scripts/render-parity-harness.html",
  "scripts/service-contract-parity.mjs",
  "scripts/build-pantone-bundle.mjs",
  "scripts/codex-viewer-adapter.mjs",
  "scripts/fix-import-extensions.mjs",
  "scripts/rename-jsx-to-js.mjs",
]);

// Runtime patterns that indicate direct PDF parsing. Each entry is
// the regex source (so the report renders as a string).
const PARSER_PATTERNS = [
  { name: "pdfjs-dist import", re: /from\s+["']pdfjs-dist["']|require\(\s*["']pdfjs-dist["']\s*\)/g },
  { name: "pdf-lib import", re: /from\s+["']pdf-lib["']|require\(\s*["']pdf-lib["']\s*\)/g },
  { name: "getDocument(", re: /\bgetDocument\s*\(/g },
  { name: "OptionalContentConfig", re: /\bOptionalContentConfig\b/g },
  { name: "PDFDocumentProxy", re: /\bPDFDocumentProxy\b/g },
  { name: "fallback-pdfjs", re: /fallback-pdfjs/g },
];

// Patterns that indicate a parallel Pantone catalogue or colour-math
// implementation outside the codex authority surface. As of loupe-pdf
// 0.3.0-beta.37 / codex-pdf 1.4.0, ANY runtime file (other than the
// thin `host/spotColor/*` adapter package) carrying Pantone NAME
// literals or hand-rolled colour-math constants is a regression — the
// codex-client owns those.
const COLOR_AUTHORITY_PATTERNS = [
  // PANTONE NAME literal in source code. The adapter itself is
  // exempt (see allowlist below); fixture / test files are too.
  { name: "PANTONE name literal", re: /['"]PANTONE\s+[^'"]+['"]/g },
  // Catch reintroductions of a parallel Pantone bundle by symbol name.
  { name: "PANTONE catalogue constant", re: /\b(?:PANTONE_REFERENCE|PANTONE_FORMULA_GUIDE|_PANTONE_REFERENCE)\b/g },
];

// Allowlist for the colour-authority audit. Files in the
// `host/spotColor/` package are part of the codex adapter and may
// reference Pantone names + matrices. Tests across the repo also
// pass real PANTONE names through the resolver as fixtures — those
// don't constitute a parallel catalogue.
const COLOR_AUTHORITY_ALLOWLIST_PREFIX = ["host/spotColor/"];
const COLOR_AUTHORITY_ALLOWLIST_SUFFIX = [".test.ts", ".test.tsx", ".test.mjs", ".test.js"];

async function scan(dir) {
  const out = [];
  const colorOut = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "demo" ||
      entry.name === "docs" ||
      entry.name === "reports" ||
      entry.name === "units" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await scan(path);
      out.push(...nested.parser);
      colorOut.push(...nested.color);
      continue;
    }
    const ext = extname(entry.name);
    if (![".ts", ".tsx", ".js", ".mjs"].includes(ext)) continue;
    const rel = relative(root, path);
    const content = await readFile(path, "utf8");

    const parserHits = [];
    for (const { name, re } of PARSER_PATTERNS) {
      const matches = content.match(re);
      if (matches) parserHits.push({ pattern: name, count: matches.length });
    }
    if (parserHits.length > 0) {
      out.push({
        file: rel,
        hits: parserHits.reduce((acc, h) => acc + h.count, 0),
        patterns: parserHits,
      });
    }

    const colorHits = [];
    const lines = content.split("\n");
    for (const { name, re } of COLOR_AUTHORITY_PATTERNS) {
      let count = 0;
      for (const line of lines) {
        // Skip the line if the literal sits inside a `//` line
        // comment, a TSDoc/JSDoc `*`-prefixed block-comment line, or
        // an explicit string-message context.
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        const match = line.match(re);
        if (!match) continue;
        // Skip when the match appears AFTER a `//` on the same line.
        const matchIndex = line.indexOf(match[0]);
        const commentIndex = line.indexOf("//");
        if (commentIndex !== -1 && commentIndex < matchIndex) continue;
        count += match.length;
      }
      if (count > 0) colorHits.push({ pattern: name, count });
    }
    if (colorHits.length > 0) {
      colorOut.push({
        file: rel,
        hits: colorHits.reduce((acc, h) => acc + h.count, 0),
        patterns: colorHits,
      });
    }
  }
  return { parser: out, color: colorOut };
}

const { parser: findings, color: colorFindings } = await scan(root);
const violations = findings.filter((item) => !allowlist.has(item.file));
const colorViolations = colorFindings.filter(
  (item) =>
    !COLOR_AUTHORITY_ALLOWLIST_PREFIX.some((prefix) => item.file.startsWith(prefix)) &&
    !COLOR_AUTHORITY_ALLOWLIST_SUFFIX.some((suffix) => item.file.endsWith(suffix)) &&
    !allowlist.has(item.file),
);

const report = {
  status: violations.length === 0 && colorViolations.length === 0 ? "pass" : "fail",
  allowlist: Array.from(allowlist).sort(),
  patterns: PARSER_PATTERNS.map(({ name, re }) => ({ name, regex: re.source })),
  findings,
  violations,
  color_authority: {
    allowlist_prefix: COLOR_AUTHORITY_ALLOWLIST_PREFIX,
    patterns: COLOR_AUTHORITY_PATTERNS.map(({ name, re }) => ({ name, regex: re.source })),
    findings: colorFindings,
    violations: colorViolations,
  },
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
if (report.status !== "pass") {
  const bad = [
    ...violations.map(
      (item) => `parser: ${item.file} (${item.patterns?.map((p) => p.pattern).join(", ")})`,
    ),
    ...colorViolations.map(
      (item) => `color: ${item.file} (${item.patterns?.map((p) => p.pattern).join(", ")})`,
    ),
  ].join("\n  ");
  throw new Error(`Parser/color surface violation outside allowlist:\n  ${bad}`);
}
