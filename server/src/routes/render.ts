/**
 * POST /render — report rendering. Accepts multipart with `context`
 * (JSON string) + optional `pdf` (file part for annotated/markup
 * formats). Returns the rendered bytes with the appropriate MIME.
 *
 * Renderer logic lives in reportRenderer.ts / annotatedPdfRenderer.ts
 * / markupPdfRenderer.ts — this module is just the HTTP wrapping +
 * input validation.
 */
import { Hono } from "hono";
import { generateAnnotatedPdf } from "../annotatedPdfRenderer.js";
import { requireAuth } from "../auth.js";
import { generateMarkupPdf } from "../markupPdfRenderer.js";
import { renderRequestsTotal } from "../observability.js";
import { bytesResponse, unprocessable } from "../problemDetails.js";
import type { RenderContext } from "../renderTypes.js";
import { renderHtml, renderPdf } from "../reportRenderer.js";

export const render = new Hono();

const ALLOWED_FORMATS = new Set(["html", "pdf", "annotated_pdf", "markup_pdf"]);

render.post("/render", requireAuth, async (c) => {
  const ct = (c.req.header("content-type") ?? "").toLowerCase();
  if (!ct.startsWith("multipart/form-data")) {
    return unprocessable(
      c,
      "Content-Type must be multipart/form-data with `context` field.",
    );
  }

  const body = await c.req.parseBody();
  const contextRaw = body.context;
  if (typeof contextRaw !== "string" || !contextRaw) {
    return unprocessable(
      c,
      "Multipart field `context` (JSON string) is required.",
    );
  }
  let ctx: RenderContext;
  try {
    ctx = JSON.parse(contextRaw) as RenderContext;
  } catch {
    return unprocessable(c, "Field `context` must be valid JSON.");
  }
  const fmt = ctx.format;
  if (!ALLOWED_FORMATS.has(fmt)) {
    return unprocessable(
      c,
      `format must be one of: ${[...ALLOWED_FORMATS].join(", ")}.`,
    );
  }

  // Optional uploaded PDF for annotated_pdf / markup_pdf.
  const pdfPart = body.pdf;
  let pdfBuf: Buffer | null = null;
  if (pdfPart instanceof File) {
    pdfBuf = Buffer.from(await pdfPart.arrayBuffer());
  }

  const jobId = (ctx as unknown as Record<string, unknown>).job_id as
    | string
    | undefined;

  try {
    if (fmt === "html") {
      const buf = await renderHtml(ctx, jobId);
      renderRequestsTotal.inc({
        tool: "report",
        format: "html",
        outcome: "ok",
      });
      c.header("Content-Type", "text/html; charset=utf-8");
      return bytesResponse(c, buf);
    }
    if (fmt === "pdf") {
      const buf = await renderPdf(ctx, jobId);
      renderRequestsTotal.inc({ tool: "report", format: "pdf", outcome: "ok" });
      c.header("Content-Type", "application/pdf");
      return bytesResponse(c, buf);
    }
    if (fmt === "annotated_pdf") {
      if (!pdfBuf) {
        return unprocessable(c, "`pdf` file part required for annotated_pdf.");
      }
      const findings = ctx.result_json?.findings ?? [];
      const brandingName = ctx.branding?.name ?? "LintPDF";
      const buf = await generateAnnotatedPdf(pdfBuf, findings, brandingName);
      renderRequestsTotal.inc({
        tool: "report",
        format: "annotated_pdf",
        outcome: "ok",
      });
      c.header("Content-Type", "application/pdf");
      return bytesResponse(c, buf);
    }
    // markup_pdf
    if (!pdfBuf) {
      return unprocessable(c, "`pdf` file part required for markup_pdf.");
    }
    const annotations = ctx.annotations ?? [];
    const comments = ctx.comments_by_annotation ?? {};
    const brandingName = ctx.branding?.name ?? "LintPDF";
    const buf = await generateMarkupPdf(
      pdfBuf,
      annotations,
      comments,
      brandingName,
    );
    renderRequestsTotal.inc({
      tool: "report",
      format: "markup_pdf",
      outcome: "ok",
    });
    c.header("Content-Type", "application/pdf");
    return bytesResponse(c, buf);
  } catch (err) {
    renderRequestsTotal.inc({ tool: "report", format: fmt, outcome: "error" });
    throw err;
  }
});
