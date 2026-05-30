import { Readable } from "node:stream";
/**
 * Job source management. A "source" is the PDF a job operates on.
 * Two body shapes:
 *
 *   - application/pdf  → raw PDF bytes streamed straight to disk
 *   - application/json → `{ "url": "https://..." }` to fetch on the
 *                        server's behalf (SSRF-safe — see
 *                        storage.ts saveSourceFromUrl)
 */
import { Hono } from "hono";
import { requireAuth } from "../auth.js";
import { invalidateJob } from "../cache.js";
import { badRequest, unprocessable } from "../problemDetails.js";
import {
  ValidationError,
  assertValidJobId,
  saveSourceFromStream,
  saveSourceFromUrl,
} from "../storage.js";

export const sources = new Hono();

sources.post("/jobs/:jobId/source", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  try {
    assertValidJobId(jobId);
  } catch (e) {
    return e instanceof ValidationError
      ? unprocessable(c, e.message)
      : unprocessable(c, "Invalid jobId.");
  }
  invalidateJob(jobId);

  const ct = (c.req.header("content-type") ?? "").toLowerCase();
  try {
    if (ct.includes("application/json")) {
      const body = await c.req.json<{ url?: unknown }>();
      const url = body?.url;
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) {
        return unprocessable(c, "Body must be `{ url: 'http(s)://...' }`.");
      }
      const meta = await saveSourceFromUrl(jobId, url);
      return c.json(meta);
    }
    if (ct.includes("application/pdf")) {
      // Stream the request body to disk. Hono exposes the underlying
      // Web ReadableStream; wrap it as a Node Readable for the
      // existing storage helper.
      const webStream = c.req.raw.body;
      if (!webStream) return badRequest(c, "Empty request body.");
      const cl = c.req.header("content-length");
      const meta = await saveSourceFromStream(
        jobId,
        Readable.fromWeb(webStream as never),
        cl ? Number(cl) : null,
      );
      return c.json(meta);
    }
    return badRequest(
      c,
      "Content-Type must be application/pdf or application/json.",
    );
  } catch (err) {
    if (err instanceof ValidationError) {
      return unprocessable(c, err.message);
    }
    throw err;
  }
});

sources.delete("/jobs/:jobId", requireAuth, async (c) => {
  const jobId = c.req.param("jobId");
  try {
    assertValidJobId(jobId);
  } catch (e) {
    return e instanceof ValidationError
      ? unprocessable(c, e.message)
      : unprocessable(c, "Invalid jobId.");
  }
  invalidateJob(jobId);
  return c.body(null, 204);
});
