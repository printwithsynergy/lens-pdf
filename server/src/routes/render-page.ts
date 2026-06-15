/**
 * One-shot page rasterization — `POST /render-page?page=N&dpi=D`.
 *
 * The stateless sibling of the job-based `GET /jobs/:jobId/page/:n.png`
 * (see `pages.ts`): the PDF arrives in the request itself (multipart
 * `file` field, or a raw `application/pdf` body) and nothing is
 * persisted — the document is written to a temp dir, the requested
 * page is rendered to a composite RGB PNG, the temp dir is removed,
 * and the PNG is returned base64-encoded.
 *
 * This is the contract synergy's `lens.render_page` node calls. It
 * mirrors `/inspect`'s upload-the-bytes model so the node never has to
 * hand lens-server a storage key it cannot resolve (lens-server has
 * its own per-job source store, distinct from synergy's storage).
 *
 * Response: `{ image_base64, width, height, format, page, pageCount }`
 * where width/height are pixels at the requested DPI.
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";
import { readPageCount, renderComposite } from "../ghostscript.js";
import { logger } from "../observability.js";
import { badRequest, unprocessable } from "../problemDetails.js";

export const renderPage = new Hono();

async function readUploadedPdf(
  ct: string,
  req: Request,
): Promise<Buffer | null> {
  // A malformed multipart envelope / truncated body makes formData() or
  // arrayBuffer() throw; swallow it and return null so the caller answers 400
  // (bad request) rather than letting it bubble to the 500 error handler.
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof Blob)) return null;
      const bytes = await file.arrayBuffer();
      return bytes.byteLength > 0 ? Buffer.from(bytes) : null;
    }
    if (ct.includes("application/pdf")) {
      const bytes = await req.arrayBuffer();
      return bytes.byteLength > 0 ? Buffer.from(bytes) : null;
    }
    return null;
  } catch {
    return null;
  }
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

/**
 * Read width/height from a PNG's IHDR chunk. A PNG is an 8-byte
 * signature followed by the IHDR chunk whose data begins at byte 16:
 * width (uint32 BE) then height (uint32 BE). Avoids re-decoding the
 * image just to learn its dimensions.
 *
 * `renderComposite` always emits a valid Ghostscript `png16m` buffer, so a
 * malformed/short buffer here means something upstream broke. Rather than
 * silently returning misleading 0×0 dims (which hides the failure) OR failing
 * an otherwise-valid render with a 500, we log a warning and fall back to 0×0
 * so the anomaly is detectable in logs.
 */
function pngDimensions(png: Buffer): { width: number; height: number } {
  if (png.length < 24 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    logger.warn(
      { byteLength: png.length },
      "render-page: rendered buffer is not a well-formed PNG — reporting 0×0 dimensions",
    );
    return { width: 0, height: 0 };
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

renderPage.post("/render-page", requireAuth, async (c) => {
  const pageRaw = c.req.query("page") ?? "1";
  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1) {
    return unprocessable(c, "page must be a positive integer.");
  }

  const dpiRaw = c.req.query("dpi");
  const dpi = dpiRaw === undefined ? 150 : Number(dpiRaw);
  if (!Number.isFinite(dpi) || dpi < config.minDpi || dpi > config.maxDpi) {
    return unprocessable(
      c,
      `dpi must be a number in [${config.minDpi}, ${config.maxDpi}].`,
    );
  }

  const ct = (c.req.header("content-type") ?? "").toLowerCase();
  const maxBytes = config.maxUploadMib * 1024 * 1024;

  // Reject oversize uploads on the declared Content-Length BEFORE buffering the
  // whole body in memory (memory-pressure DoS guard). The post-read check below
  // remains as a secondary guard for requests that omit/understate the header.
  const contentLength = Number(c.req.header("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return unprocessable(
      c,
      `PDF too large (${(contentLength / 1024 / 1024).toFixed(1)} MiB > ${config.maxUploadMib} MiB).`,
    );
  }

  const pdf = await readUploadedPdf(ct, c.req.raw);
  if (!pdf) {
    return badRequest(
      c,
      "Send the PDF as a multipart `file` field or an application/pdf body.",
    );
  }
  if (pdf.byteLength > maxBytes) {
    return unprocessable(
      c,
      `PDF too large (${(pdf.byteLength / 1024 / 1024).toFixed(1)} MiB > ${config.maxUploadMib} MiB).`,
    );
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), "render-page-"));
  try {
    const pdfPath = path.join(tmp, `${randomUUID()}.pdf`);
    await writeFile(pdfPath, pdf);

    const pageCount = await readPageCount(pdfPath);
    if (page > pageCount) {
      return unprocessable(
        c,
        `page ${page} is out of range; document has ${pageCount} page(s).`,
      );
    }

    const png = await renderComposite({
      pdfPath,
      pageNum: page,
      dpi: Math.round(dpi),
    });
    const { width, height } = pngDimensions(png);

    return c.json({
      image_base64: png.toString("base64"),
      width,
      height,
      format: "png",
      page,
      pageCount,
    });
  } finally {
    // Best-effort cleanup: a failure to remove the temp dir must NOT turn a
    // successful render response into a 500 (a thrown error in `finally`
    // replaces the returned value).
    await rm(tmp, { recursive: true, force: true }).catch((err) => {
      logger.warn(
        { tmp, err: String(err) },
        "render-page: temp dir cleanup failed",
      );
    });
  }
});
