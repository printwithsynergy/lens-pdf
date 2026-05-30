/**
 * Page rendering (composite RGB PNG) + per-channel separations.
 * Heavy lifting still lives in ghostscript.ts; this module is the
 * HTTP wrapping.
 */
import { type Context, Hono } from "hono";
import { requireAuth } from "../auth.js";
import { compositeCache, jobCacheKey, separationsCache } from "../cache.js";
import { config } from "../config.js";
import { renderComposite, renderSeparations } from "../ghostscript.js";
import { bytesResponse, notFound, unprocessable } from "../problemDetails.js";
import {
  ValidationError,
  assertValidJobId,
  jobExists,
  sourcePath,
} from "../storage.js";

export const pages = new Hono();

const IMMUTABLE_TTL_S = 31_536_000; // 1 year
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

pages.get("/jobs/:jobId/page/:pageNum.png", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  let pageNum: number;
  let dpi: number;
  try {
    pageNum = parsePageNum(c.req.param("pageNum"));
    dpi = parseDpi(c.req.query("dpi"));
    await assertJob(jobId);
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

  const key = jobCacheKey(jobId, "composite", pageNum, dpi);
  const cached = compositeCache.get(key);
  if (cached) return sendPng(c, cached, jobId);
  const png = await renderComposite({
    pdfPath: sourcePath(jobId),
    pageNum,
    dpi,
  });
  compositeCache.set(key, png);
  return sendPng(c, png, jobId);
});

pages.get("/jobs/:jobId/channels", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  let pageNum: number;
  let dpi: number;
  try {
    pageNum = parsePageNum(c.req.query("page"));
    dpi = parseDpi(c.req.query("dpi"), 72);
    await assertJob(jobId);
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
  const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
  c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
  c.header("Cache-Tag", `job-${jobId}`);
  return c.json({ channels: Object.keys(seps.channels) });
});

pages.get("/jobs/:jobId/channel/:channelName.png", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  const channelRaw = c.req.param("channelName");
  if (!channelRaw) {
    return unprocessable(c, "channelName missing.");
  }
  const channelName = decodeURIComponent(channelRaw);
  let pageNum: number;
  let dpi: number;
  try {
    pageNum = parsePageNum(c.req.query("page"));
    dpi = parseDpi(c.req.query("dpi"));
    await assertJob(jobId);
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
  const seps = await getOrRenderSeparations(jobId, pageNum, dpi);
  const png = seps.channels[channelName];
  if (!png) {
    return notFound(
      c,
      `Channel "${channelName}" not present on page ${pageNum}. Available: ${Object.keys(seps.channels).join(", ")}.`,
    );
  }
  return sendPng(c, png, jobId);
});

function sendPng(c: Context, png: Buffer, jobId: string): Response {
  c.header("Content-Type", "image/png");
  c.header("Cache-Control", IMMUTABLE_CACHE_CONTROL);
  c.header("Cache-Tag", `job-${jobId}`);
  return bytesResponse(c, png);
}
