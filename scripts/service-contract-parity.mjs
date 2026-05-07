import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { adaptCodexDocumentForViewer } from "../dist/host/codexAdapter.js";

const root = resolve(".");
const codexFixturePath = resolve(root, "reports/parity/fixtures/minimal.codex.json");
const reportPath = resolve(root, "reports/parity/service_contract_report.json");

const codex = JSON.parse(await readFile(codexFixturePath, "utf8"));
const adapted = adaptCodexDocumentForViewer(codex);

const expectedPageCount = Array.isArray(codex.pages) ? codex.pages.length : 0;
const expectedLayerCount = Array.isArray(codex.ocgs) ? codex.ocgs.length : 0;
const hasStableLayerIds = adapted.layers.every((layer) => Boolean(layer.ocg_id));
const pageNumbersAreSequential = adapted.pages.every((page, index) => page.page_num === index + 1);

const checks = {
  schema_version_present: Boolean(adapted.codex_schema_version),
  page_count_matches_codex: adapted.page_count === expectedPageCount,
  layer_count_matches_codex: adapted.layers.length === expectedLayerCount,
  layer_ids_stable: hasStableLayerIds,
  page_numbers_sequential: pageNumbersAreSequential,
};

const failures = Object.entries(checks)
  .filter(([, value]) => !value)
  .map(([name]) => name);

const report = {
  status: failures.length === 0 ? "pass" : "fail",
  fixture: "reports/parity/fixtures/minimal.codex.json",
  expected: {
    page_count: expectedPageCount,
    layer_count: expectedLayerCount,
  },
  actual: {
    page_count: adapted.page_count,
    layer_count: adapted.layers.length,
  },
  checks,
  failures,
};

await writeFile(reportPath, JSON.stringify(report, null, 2));
if (report.status !== "pass") {
  throw new Error(`Service-contract parity failed: ${failures.join(", ")}`);
}
