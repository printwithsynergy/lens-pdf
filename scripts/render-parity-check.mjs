import { createServer } from "node:http";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const root = resolve(".");
const baselinePath = resolve(root, "reports/parity/baseline/minimal-page1.png");
const currentPath = resolve(root, "reports/parity/current/minimal-page1.png");
const reportPath = resolve(root, "reports/parity/render_pixel_report.json");
const fixturePdf = "/reports/parity/fixtures/minimal.pdf";
const updateBaseline = process.argv.includes("--update-baseline");

const contentType = (path) => {
  const ext = extname(path).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js" || ext === ".mjs") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  return "application/octet-stream";
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const target = resolve(root, `.${url.pathname}`);
  if (!target.startsWith(root)) {
    res.statusCode = 403;
    res.end("forbidden");
    return;
  }
  try {
    const file = await readFile(target);
    res.statusCode = 200;
    res.setHeader("Content-Type", contentType(target));
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end("not found");
  }
});

await new Promise((resolveListen) => server.listen(4179, "127.0.0.1", resolveListen));

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1300, height: 1700 },
    deviceScaleFactor: 1,
  });
  const pageMessages = [];
  page.on("console", (msg) => {
    pageMessages.push(`[console:${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    pageMessages.push(`[pageerror] ${String(err)}`);
  });
  const harness = `http://127.0.0.1:4179/scripts/render-parity-harness.html?pdf=${encodeURIComponent(
    fixturePdf,
  )}&page=1&dpi=144`;
  await page.goto(harness, { waitUntil: "networkidle" });
  try {
    await page.waitForFunction(() => window.__renderParityReady === true, null, {
      timeout: 15000,
    });
  } catch (error) {
    const details = pageMessages.join("\n");
    throw new Error(
      `Render harness did not become ready.\n${details || "No browser logs captured."}`,
      { cause: error },
    );
  }
  await mkdir(resolve(root, "reports/parity/current"), { recursive: true });
  await page.locator("#viewport").screenshot({ path: currentPath });

  if (updateBaseline) {
    await mkdir(resolve(root, "reports/parity/baseline"), { recursive: true });
    const currentPng = await readFile(currentPath);
    await writeFile(baselinePath, currentPng);
  }

  const baselineExists = await stat(baselinePath)
    .then(() => true)
    .catch(() => false);
  if (!baselineExists) {
    throw new Error("Baseline image missing. Run with --update-baseline once.");
  }

  const baselinePng = PNG.sync.read(await readFile(baselinePath));
  const currentPng = PNG.sync.read(await readFile(currentPath));
  if (
    baselinePng.width !== currentPng.width ||
    baselinePng.height !== currentPng.height
  ) {
    throw new Error("Baseline/current screenshot dimensions differ.");
  }

  const diff = new PNG({ width: baselinePng.width, height: baselinePng.height });
  const mismatchedPixels = pixelmatch(
    baselinePng.data,
    currentPng.data,
    diff.data,
    baselinePng.width,
    baselinePng.height,
    { threshold: 0.1 },
  );
  const mismatchRatio = mismatchedPixels / (baselinePng.width * baselinePng.height);
  const maxRatio = 0.001;
  const report = {
    status: mismatchRatio <= maxRatio ? "pass" : "fail",
    baseline_path: "reports/parity/baseline/minimal-page1.png",
    current_path: "reports/parity/current/minimal-page1.png",
    mismatched_pixels: mismatchedPixels,
    mismatch_ratio: mismatchRatio,
    allowed_ratio: maxRatio,
  };
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  if (report.status !== "pass") {
    throw new Error(
      `Render parity failed: mismatch ratio ${mismatchRatio.toFixed(6)} > ${maxRatio.toFixed(6)}.`,
    );
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
