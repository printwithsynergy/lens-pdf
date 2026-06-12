/**
 * One-shot document inspection — `POST /inspect?page=N`.
 *
 * Unlike the job-based routes, the PDF arrives in the request itself
 * (multipart `file` field, or a raw `application/pdf` body) and
 * nothing is persisted: the document is written to a temp dir,
 * inspected, and deleted before the response is sent. This is the
 * contract synergy's `lens.inspect` node calls — the response shape
 * is the node's `metadata` output port.
 *
 * Response: `{ pageCount, page, inks, widthPx, heightPx, dpi }`
 * where `inks` is the page's ink-channel names (process + spot) as
 * reported by Ghostscript's `tiffsep` device, and the dimensions are
 * pixels at the inspection DPI (low — this is metadata, not a render).
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { requireAuth } from "../auth.js";
import { config } from "../config.js";
import { readPageCount, renderSeparations } from "../ghostscript.js";
import { badRequest, unprocessable } from "../problemDetails.js";

export const inspect = new Hono();

/** Low DPI keeps the tiffsep pass cheap — ink names + aspect ratio
 *  don't need print resolution. */
const INSPECT_DPI = 72;

async function readUploadedPdf(
  ct: string,
  req: Request,
): Promise<Buffer | null> {
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
}

inspect.post("/inspect", requireAuth, async (c) => {
  const pageRaw = c.req.query("page") ?? "1";
  const page = Number(pageRaw);
  if (!Number.isInteger(page) || page < 1) {
    return unprocessable(c, "page must be a positive integer.");
  }

  const ct = (c.req.header("content-type") ?? "").toLowerCase();
  const pdf = await readUploadedPdf(ct, c.req.raw);
  if (!pdf) {
    return badRequest(
      c,
      "Send the PDF as a multipart `file` field or an application/pdf body.",
    );
  }
  if (pdf.byteLength > config.maxUploadMib * 1024 * 1024) {
    return unprocessable(
      c,
      `PDF too large (${(pdf.byteLength / 1024 / 1024).toFixed(1)} MiB > ${config.maxUploadMib} MiB).`,
    );
  }

  const tmp = await mkdtemp(path.join(os.tmpdir(), "inspect-"));
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

    const seps = await renderSeparations({
      pdfPath,
      pageNum: page,
      dpi: INSPECT_DPI,
    });

    return c.json({
      pageCount,
      page,
      inks: Object.keys(seps.channels),
      widthPx: seps.width,
      heightPx: seps.height,
      dpi: INSPECT_DPI,
    });
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
