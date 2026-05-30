/**
 * Densitometer / color sample / TAC heatmap — the colorimetric
 * inspection endpoints. Heavy lifting in sampling.ts +
 * ghostscript.ts; this module is the HTTP wrapping.
 */
import { Hono } from "hono";
import { requireAuth } from "../auth.js";
import { jobCacheKey, separationsCache } from "../cache.js";
import { config } from "../config.js";
import { renderSeparations } from "../ghostscript.js";
import { bytesResponse, notFound, unprocessable } from "../problemDetails.js";
import {
  renderTacHeatmap,
  sampleColor,
  sampleDensitometer,
} from "../sampling.js";
import {
  ValidationError,
  assertValidJobId,
  jobExists,
  sourcePath,
} from "../storage.js";

export const sampling = new Hono();

const IMMUTABLE_TTL_S = 31_536_000;
const IMMUTABLE_CACHE_CONTROL = `public, max-age=${IMMUTABLE_TTL_S}, immutable, s-maxage=${IMMUTABLE_TTL_S}`;

function parsePageNum(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new ValidationError("page must be a positive integer.");
  }
  return n;
}

function parseDpi(raw: string | undefined, fallback = 150): number {
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(n) || n < config.minDpi || n > config.maxDpi) {
    throw new ValidationError(
      `dpi must be a number in [${config.minDpi}, ${config.maxDpi}].`,
    );
  }
  return Math.round(n);
}

async function assertJob(jobId: string): Promise<void> {
  assertValidJobId(jobId);
  if (!(await jobExists(jobId))) {
    const err = new Error("Job not found.");
    (err as Error & { httpStatus?: number }).httpStatus = 404;
    throw err;
  }
}

async function getOrRenderSeparations(
  jobId: string,
  pageNum: number,
  dpi: number,
) {
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

function assertFiniteNumber(v: unknown, name: string): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new ValidationError(`Body field "${name}" must be a number.`);
  }
}

sampling.post("/jobs/:jobId/density", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  let body: Partial<{
    page: number;
    x: number;
    y: number;
    pageWidthPts: number;
    pageHeightPts: number;
    dpi: number;
    tacLimit: number;
  }>;
  try {
    body = await c.req.json();
  } catch {
    return unprocessable(c, "Body must be valid JSON.");
  }
  try {
    assertFiniteNumber(body.page, "page");
    assertFiniteNumber(body.x, "x");
    assertFiniteNumber(body.y, "y");
    assertFiniteNumber(body.pageWidthPts, "pageWidthPts");
    assertFiniteNumber(body.pageHeightPts, "pageHeightPts");
    const dpi = parseDpi(body.dpi !== undefined ? String(body.dpi) : undefined);
    const tacLimit = body.tacLimit ?? 300;
    await assertJob(jobId);
    const seps = await getOrRenderSeparations(jobId, body.page, dpi);
    const sample = await sampleDensitometer({
      separations: seps,
      pageWidthPts: body.pageWidthPts,
      pageHeightPts: body.pageHeightPts,
      dpi,
      pdfX: body.x,
      pdfY: body.y,
      tacLimit,
    });
    return c.json(sample);
  } catch (e) {
    if (e instanceof ValidationError) return unprocessable(c, e.message);
    if (
      e instanceof Error &&
      (e as Error & { httpStatus?: number }).httpStatus === 404
    ) {
      return notFound(c, "Job not found.");
    }
    throw e;
  }
});

sampling.get("/jobs/:jobId/color", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  try {
    const pageNum = parsePageNum(c.req.query("page"));
    const x = Number(c.req.query("x"));
    const y = Number(c.req.query("y"));
    const pageWidthPts = Number(c.req.query("pageWidthPts"));
    const pageHeightPts = Number(c.req.query("pageHeightPts"));
    const dpi = parseDpi(c.req.query("dpi"));
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
      return notFound(c, "No composite raster available.");
    }
    c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    c.header("Cache-Tag", `job-${jobId}`);
    return c.json(sample);
  } catch (e) {
    if (e instanceof ValidationError) return unprocessable(c, e.message);
    if (
      e instanceof Error &&
      (e as Error & { httpStatus?: number }).httpStatus === 404
    ) {
      return notFound(c, "Job not found.");
    }
    throw e;
  }
});

sampling.get("/jobs/:jobId/tac.png", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  try {
    const pageNum = parsePageNum(c.req.query("page"));
    const dpi = parseDpi(c.req.query("dpi"));
    const tacLimitRaw = c.req.query("limit");
    const tacLimit = Number(tacLimitRaw ?? 300);
    if (!Number.isFinite(tacLimit) || tacLimit <= 0) {
      throw new ValidationError("limit must be a positive number.");
    }
    await assertJob(jobId);
    const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
    const png = await renderTacHeatmap({ separations: seps, tacLimit });
    c.header("Content-Type", "image/png");
    c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
    c.header("Cache-Tag", `job-${jobId}`);
    return bytesResponse(c, png);
  } catch (e) {
    if (e instanceof ValidationError) return unprocessable(c, e.message);
    if (
      e instanceof Error &&
      (e as Error & { httpStatus?: number }).httpStatus === 404
    ) {
      return notFound(c, "Job not found.");
    }
    throw e;
  }
});
