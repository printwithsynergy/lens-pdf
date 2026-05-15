import { PDFDocument, rgb, StandardFonts, type PDFPage, type PDFFont } from "pdf-lib";
import type { ViewerAnnotation, ViewerComment } from "./renderTypes.js";

function hexToRgb(hex: string): [number, number, number] {
  try {
    const raw = hex.startsWith("#") ? hex.slice(1) : hex;
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    return [r, g, b];
  } catch {
    return [0.86, 0.15, 0.15];
  }
}

function drawAnnotationOnPage(
  page: PDFPage,
  ann: ViewerAnnotation,
  num: number,
  font: PDFFont,
) {
  const color = hexToRgb(ann.color ?? "#ef4444");
  const geo = ann.geometry as Record<string, number> | null;
  const kind = ann.kind?.toLowerCase() ?? "";

  if ((kind === "rect" || kind === "rectangle") && geo) {
    const { x = 0, y = 0, width = 0, height = 0 } = geo;
    if (width > 1 && height > 1) {
      page.drawRectangle({
        x, y, width, height,
        borderColor: rgb(...color),
        borderWidth: 1.5,
        opacity: 0.05,
        borderOpacity: 0.85,
      });
    }
  } else if (kind === "ellipse" || kind === "circle") {
    const { x = 0, y = 0, rx = 20, ry = 20 } = geo ?? {};
    page.drawEllipse({
      x, y, xScale: rx, yScale: ry,
      borderColor: rgb(...color),
      borderWidth: 1.5,
      opacity: 0.05,
      borderOpacity: 0.85,
    });
  }

  // Sticky-note number badge
  const px = (geo?.x ?? 10) as number;
  const py = (geo?.y ?? 10) as number;
  const PIN_R = 7;
  page.drawCircle({
    x: Math.max(px, PIN_R + 2),
    y: Math.min(py + (geo?.height as number ?? 0), page.getSize().height - PIN_R - 2),
    size: PIN_R,
    color: rgb(...color),
    opacity: 0.9,
  });
  page.drawText(String(num), {
    x: Math.max(px - 3, 2),
    y: Math.min(py + (geo?.height as number ?? 0) - 4, page.getSize().height - PIN_R * 2),
    size: 7, font, color: rgb(1, 1, 1),
  });
}

export async function generateMarkupPdf(
  pdfBytes: Buffer,
  annotations: ViewerAnnotation[],
  commentsByAnnotation: Record<string, ViewerComment[]>,
  brandingName = "LintPDF",
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);

  // Sort annotations by page
  const sorted = [...annotations].sort((a, b) => (a.page_num ?? 0) - (b.page_num ?? 0));

  for (let i = 0; i < sorted.length; i++) {
    const ann = sorted[i];
    const pageNum = ann.page_num ?? 0;
    if (pageNum < 1 || pageNum > doc.getPageCount()) continue;
    drawAnnotationOnPage(doc.getPage(pageNum - 1), ann, i + 1, font);
  }

  // Appendix page
  const MARGIN = 40;
  const appendix = doc.addPage([612, 792]);
  appendix.drawText(`${brandingName} — Review Comments`, {
    x: MARGIN, y: 792 - MARGIN - 12, size: 12, font, color: rgb(0.1, 0.2, 0.5),
  });
  let y = 792 - MARGIN - 12 - 20;
  for (let i = 0; i < sorted.length && y > MARGIN; i++) {
    const ann = sorted[i];
    const comments = commentsByAnnotation[ann.id] ?? [];
    appendix.drawText(`${i + 1}. Page ${ann.page_num ?? "—"}${ann.text ? ": " + ann.text.slice(0, 80) : ""}`, {
      x: MARGIN, y, size: 8, font, color: rgb(0.1, 0.2, 0.5),
      maxWidth: 612 - MARGIN * 2,
    });
    y -= 12;
    for (const c of comments) {
      if (y < MARGIN) break;
      const body = `  ${c.author_email ?? "Anonymous"}: ${(c.body ?? "").slice(0, 100)}`;
      appendix.drawText(body, {
        x: MARGIN + 12, y, size: 7, font: bodyFont, color: rgb(0.3, 0.3, 0.3),
        maxWidth: 612 - MARGIN * 2 - 12,
      });
      y -= 10;
    }
    y -= 6;
  }

  return Buffer.from(await doc.save());
}
