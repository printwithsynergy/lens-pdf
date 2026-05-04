/**
 * LoupePDF reference HTTP backend.
 *
 * Exposes the endpoints a `ViewerServices` impl points at to get real
 * preflight-grade ink separations, densitometer readings, TAC heatmap,
 * and color sampling — driven by Ghostscript's `tiffsep` device.
 *
 * Auth, rate limiting, and multi-tenant isolation are intentionally
 * out of scope. Run this behind your gateway / proxy / app server.
 */

import express, { type ErrorRequestHandler, type Request, type Response, type NextFunction } from "express";
import morgan from "morgan";
import { config } from "./config.js";
import {
  assertValidJobId,
  ensureJobsDir,
  jobExists,
  saveSourceFromStream,
  saveSourceFromUrl,
  sourcePath,
  ValidationError,
} from "./storage.js";
import {
  renderComposite,
  renderSeparations,
} from "./ghostscript.js";
import {
  compositeCache,
  invalidateJob,
  jobCacheKey,
  separationsCache,
} from "./cache.js";
import {
  renderTacHeatmap,
  sampleColor,
  sampleDensitometer,
} from "./sampling.js";

const app = express();
app.disable("x-powered-by");
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));

if (config.bearerToken) {
  app.use((req, res, next) => {
    const auth = req.header("authorization");
    if (auth !== `Bearer ${config.bearerToken}`) {
      res.status(401).json({ error: "Unauthorised" });
      return;
    }
    next();
  });
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Source management
// ---------------------------------------------------------------------------

/**
 * Register a PDF source for a job. Two body shapes:
 *
 *   - application/pdf  → raw PDF bytes
 *   - application/json → `{ "url": "https://..." }` to fetch on the
 *                        server's behalf
 */
app.post("/jobs/:jobId/source", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    assertValidJobId(jobId);
    invalidateJob(jobId);

    const ct = (req.header("content-type") ?? "").toLowerCase();
    if (ct.includes("application/json")) {
      const url = (req.body as { url?: unknown })?.url;
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
        throw new ValidationError("Body must be `{ url: 'http(s)://...' }`.");
      }
      const meta = await saveSourceFromUrl(jobId, url);
      res.json(meta);
    } else if (ct.includes("application/pdf")) {
      const cl = req.header("content-length");
      const meta = await saveSourceFromStream(
        jobId,
        req,
        cl ? Number(cl) : null,
      );
      res.json(meta);
    } else {
      throw new ValidationError(
        "Content-Type must be application/pdf (raw bytes) or application/json (`{ url }`).",
      );
    }
  } catch (err) {
    next(err);
  }
});

app.delete("/jobs/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    assertValidJobId(jobId);
    invalidateJob(jobId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Page rendering (composite RGB)
// ---------------------------------------------------------------------------

app.get("/jobs/:jobId/page/:pageNum.png", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const pageNum = parsePageNum(req.params.pageNum);
    const dpi = parseDpi(req.query.dpi);
    await assertJob(jobId);

    const key = jobCacheKey(jobId, "composite", pageNum, dpi);
    const cached = compositeCache.get(key);
    if (cached) return sendPng(res, cached, jobId);

    const png = await renderComposite({
      pdfPath: sourcePath(jobId),
      pageNum,
      dpi,
    });
    compositeCache.set(key, png);
    sendPng(res, png, jobId);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Per-channel separations
// ---------------------------------------------------------------------------

app.get("/jobs/:jobId/channels", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const pageNum = parsePageNum(req.query.page);
    const dpi = parseDpi(req.query.dpi, 72);
    await assertJob(jobId);
    const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
    sendJsonCached(res, { channels: Object.keys(seps.channels) }, jobId);
  } catch (err) {
    next(err);
  }
});

app.get("/jobs/:jobId/channel/:channelName.png", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const channelName = decodeURIComponent(req.params.channelName);
    const pageNum = parsePageNum(req.query.page);
    const dpi = parseDpi(req.query.dpi);
    await assertJob(jobId);
    const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
    const png = seps.channels[channelName];
    if (!png) {
      res.status(404).json({
        error: `Channel "${channelName}" not present on page ${pageNum}.`,
        available: Object.keys(seps.channels),
      });
      return;
    }
    sendPng(res, png, jobId);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Densitometer + color sample
// ---------------------------------------------------------------------------

app.post("/jobs/:jobId/density", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const body = req.body as Partial<{
      page: number;
      x: number;
      y: number;
      pageWidthPts: number;
      pageHeightPts: number;
      dpi: number;
      tacLimit: number;
    }>;
    assertNum(body.page, "page");
    assertNum(body.x, "x");
    assertNum(body.y, "y");
    assertNum(body.pageWidthPts, "pageWidthPts");
    assertNum(body.pageHeightPts, "pageHeightPts");
    const dpi = parseDpi(body.dpi);
    const tacLimit = body.tacLimit ?? 300;
    await assertJob(jobId);

    const seps = await getOrRenderSeparations(jobId, body.page!, dpi);
    const sample = await sampleDensitometer({
      separations: seps,
      pageWidthPts: body.pageWidthPts!,
      pageHeightPts: body.pageHeightPts!,
      dpi,
      pdfX: body.x!,
      pdfY: body.y!,
      tacLimit,
    });
    res.json(sample);
  } catch (err) {
    next(err);
  }
});

app.get("/jobs/:jobId/color", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const pageNum = parsePageNum(req.query.page);
    const x = Number(req.query.x);
    const y = Number(req.query.y);
    const pageWidthPts = Number(req.query.pageWidthPts);
    const pageHeightPts = Number(req.query.pageHeightPts);
    const dpi = parseDpi(req.query.dpi);
    if (![x, y, pageWidthPts, pageHeightPts].every(Number.isFinite)) {
      throw new ValidationError(
        "Query must include numeric x, y, pageWidthPts, pageHeightPts.",
      );
    }
    await assertJob(jobId);
    const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
    const sample = await sampleColor({
      separations: seps,
      pageWidthPts,
      pageHeightPts,
      dpi,
      pdfX: x,
      pdfY: y,
    });
    if (!sample) {
      res.status(404).json({ error: "No composite raster available." });
      return;
    }
    sendJsonCached(res, sample, jobId);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// TAC heatmap
// ---------------------------------------------------------------------------

app.get("/jobs/:jobId/tac.png", async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const pageNum = parsePageNum(req.query.page);
    const dpi = parseDpi(req.query.dpi);
    const tacLimit = Number(req.query.limit ?? 300);
    if (!Number.isFinite(tacLimit) || tacLimit <= 0) {
      throw new ValidationError("limit must be a positive number.");
    }
    await assertJob(jobId);
    const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
    const png = await renderTacHeatmap({ separations: seps, tacLimit });
    sendPng(res, png, jobId);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function assertJob(jobId: string): Promise<void> {
  assertValidJobId(jobId);
  if (!(await jobExists(jobId))) {
    const err = new Error("Job not found.");
    (err as Error & { httpStatus?: number }).httpStatus = 404;
    throw err;
  }
}

async function getOrRenderSeparations(jobId: string, pageNum: number, dpi: number) {
  const key = jobCacheKey(jobId, "sep", pageNum, dpi);
  const cached = separationsCache.get(key);
  if (cached) return cached;
  const seps = await renderSeparations({
    pdfPath: sourcePath(jobId),
    pageNum,
    dpi,
  });
  separationsCache.set(key, seps);
  return seps;
}

function parsePageNum(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError("page must be a positive integer.");
  }
  return n;
}

function parseDpi(raw: unknown, fallback = 150): number {
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(n) || n < config.minDpi || n > config.maxDpi) {
    throw new ValidationError(
      `dpi must be a number in [${config.minDpi}, ${config.maxDpi}].`,
    );
  }
  return Math.round(n);
}

function assertNum(v: unknown, name: string): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError(`Body field "${name}" must be a number.`);
  }
}

/**
 * Cache-Control for content that's immutable for a given (jobId,
 * page, dpi, channel, ...) tuple. Hosts replace the PDF by changing
 * the jobId (or `DELETE /jobs/{jobId}` and re-upload), so we can
 * promise long browser + CDN lifetimes:
 *
 *   - `public`        — shared caches may store
 *   - `immutable`     — modern browsers skip revalidation entirely
 *   - `max-age`       — browsers
 *   - `s-maxage`      — shared caches (Cloudflare honours this over max-age)
 *   - `Cache-Tag`     — Cloudflare-specific. `DELETE /jobs/{jobId}` on
 *                       the origin should be paired with a Cloudflare
 *                       purge-by-tag call against `job-{jobId}` from
 *                       the host's control plane.
 *
 * Auth-bearing requests bypass shared caches by default — if you set
 * `LOUPE_BEARER_TOKEN`, expect to lose the CDN tier. Move auth to the
 * gateway (Cloudflare Access, signed URLs, etc.) to keep both.
 */
const IMMUTABLE_TTL_S = 31_536_000; // 1 year
const IMMUTABLE_CACHE_CONTROL = `public, max-age=${IMMUTABLE_TTL_S}, immutable, s-maxage=${IMMUTABLE_TTL_S}`;

function setJobCacheHeaders(res: Response, jobId: string): void {
  res.setHeader("Cache-Control", IMMUTABLE_CACHE_CONTROL);
  res.setHeader("Cache-Tag", `job-${jobId}`);
}

function sendPng(res: Response, png: Buffer, jobId: string): void {
  res.setHeader("Content-Type", "image/png");
  setJobCacheHeaders(res, jobId);
  res.send(png);
}

function sendJsonCached(res: Response, body: unknown, jobId: string): void {
  setJobCacheHeaders(res, jobId);
  res.json(body);
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    err instanceof ValidationError
      ? err.httpStatus
      : (err as { httpStatus?: number }).httpStatus ?? 500;
  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(status).json({ error: err.message ?? "Internal error." });
};
app.use(errorHandler);

ensureJobsDir().then(() => {
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`loupe-pdf-server listening on :${config.port}`);
  });
});
