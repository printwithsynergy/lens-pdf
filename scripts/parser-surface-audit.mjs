import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";

const root = resolve(".");
const reportPath = resolve(root, "reports/parity/parser_surface_report.json");

const allowlist = new Set([
  "browser/index.ts",
  "fallback-pdfjs/index.ts",
  "host/pdfFallback.ts",
]);

const parserPatterns = [
  /getDocument\(/g,
  /OptionalContentConfig/g,
];

const scan = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (
      entry.name === "node_modules" ||
      entry.name === "dist" ||
      entry.name === "demo" ||
      entry.name === "docs" ||
      entry.name === "scripts" ||
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
    let hits = 0;
    for (const pattern of parserPatterns) {
      const matches = content.match(pattern);
      if (matches) hits += matches.length;
    }
    if (hits > 0) out.push({ file: rel, hits });
  }
  return out;
};

const findings = await scan(root);
const violations = findings.filter((item) => !allowlist.has(item.file));

const report = {
  status: violations.length === 0 ? "pass" : "fail",
  allowlist: Array.from(allowlist).sort(),
  findings,
  violations,
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
if (report.status !== "pass") {
  const bad = violations.map((item) => item.file).join(", ");
  throw new Error(`Parser surface violation outside allowlist: ${bad}`);
}
