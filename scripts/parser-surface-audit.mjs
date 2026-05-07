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

async function scan(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
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
      out.push(...(await scan(path)));
      continue;
    }
    const ext = extname(entry.name);
    if (![".ts", ".tsx", ".js", ".mjs"].includes(ext)) continue;
    const rel = relative(root, path);
    const content = await readFile(path, "utf8");
    const fileHits = [];
    for (const { name, re } of PARSER_PATTERNS) {
      const matches = content.match(re);
      if (matches) fileHits.push({ pattern: name, count: matches.length });
    }
    if (fileHits.length > 0) {
      out.push({ file: rel, hits: fileHits.reduce((acc, h) => acc + h.count, 0), patterns: fileHits });
    }
  }
  return out;
}

const findings = await scan(root);
const violations = findings.filter((item) => !allowlist.has(item.file));

const report = {
  status: violations.length === 0 ? "pass" : "fail",
  allowlist: Array.from(allowlist).sort(),
  patterns: PARSER_PATTERNS.map(({ name, re }) => ({ name, regex: re.source })),
  findings,
  violations,
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
if (report.status !== "pass") {
  const bad = violations
    .map((item) => `${item.file} (${item.patterns?.map((p) => p.pattern).join(", ")})`)
    .join("\n  ");
  throw new Error(`Parser surface violation outside allowlist:\n  ${bad}`);
}
