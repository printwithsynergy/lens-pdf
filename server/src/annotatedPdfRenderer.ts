import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { Finding } from "./renderTypes.js";

const SEV_RGB: Record<string, [number, number, number]> = {
  error: [0.937, 0.267, 0.267],
  warning: [0.961, 0.620, 0.043],
  advisory: [0.231, 0.510, 0.965],
};
const SEV_STROKE: Record<string, [number, number, number]> = {
  error: [0.863, 0.149, 0.149],
  warning: [0.851, 0.467, 0.024],
  advisory: [0.145, 0.388, 0.922],
};

export async function generateAnnotatedPdf(
  pdfBytes: Buffer,
  findings: Finding[],
  brandingName = "LintPDF",
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageCount = doc.getPageCount();

  // Group findings by page
  const byPage = new Map<number, (Finding & { calloutNum: number })[]>();
  let num = 0;
  for (const f of findings) {
    num++;
    const page = f.page_num ?? 0;
    if (page < 1 || page > pageCount) continue;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page)!.push({ ...f, calloutNum: num });
  }

  for (const [pageNum, pagefindings] of byPage) {
    const page = doc.getPage(pageNum - 1);
    const { width, height } = page.getSize();

    for (const f of pagefindings) {
      const fill = SEV_RGB[f.severity] ?? SEV_RGB.advisory;
      const stroke = SEV_STROKE[f.severity] ?? SEV_STROKE.advisory;
      const badgeColor = SEV_RGB[f.severity] ?? SEV_RGB.advisory;
      const bbox = f.bbox;
      if (Array.isArray(bbox) && bbox[0] != null) {
        const [bx0, by0, bx1, by1] = bbox as [number, number, number, number];
        const bw = bx1 - bx0, bh = by1 - by0;
        if (bw > 1 && bh > 1) {
          // Semi-transparent fill via low-opacity stroke trick (pdf-lib doesn't support opacity directly)
          page.drawRectangle({
            x: bx0,
            y: by0,
            width: bw,
            height: bh,
            color: rgb(...fill),
            borderColor: rgb(...stroke),
            borderWidth: 1.5,
            opacity: 0.2,
            borderOpacity: 0.85,
          });
          // Badge circle at top-right
          const BADGE_R = 6;
          const clampBcx = Math.min(bx1 + BADGE_R, width - BADGE_R - 2);
          const clampBcy = Math.min(by1 + BADGE_R, height - BADGE_R - 2);
          page.drawCircle({
            x: clampBcx,
            y: clampBcy,
            size: BADGE_R,
            color: rgb(...badgeColor),
            opacity: 0.9,
          });
          const label = String(f.calloutNum);
          page.drawText(label, {
            x: clampBcx - (label.length > 1 ? 4 : 2.5),
            y: clampBcy - 3,
            size: 7,
            font,
            color: rgb(1, 1, 1),
          });
        }
      }
    }
  }

  // Append legend page
  const legendPage = doc.addPage([612, 792]);
  const MARGIN = 40, LINE_H = 14, FONT_SIZE = 8, HEADER_SIZE = 12;
  legendPage.drawText(`${brandingName} — Preflight Finding Index`, {
    x: MARGIN, y: 792 - MARGIN - HEADER_SIZE,
    size: HEADER_SIZE, font, color: rgb(0.1, 0.2, 0.5),
  });
  let y = 792 - MARGIN - HEADER_SIZE - LINE_H * 2;
  for (const f of findings.slice(0, 50)) {
    if (y < MARGIN + LINE_H) break;
    const sev = f.severity ?? "advisory";
    const sevRgb = SEV_RGB[sev] ?? SEV_RGB.advisory;
    legendPage.drawText(String((findings.indexOf(f) + 1)), {
      x: MARGIN, y, size: FONT_SIZE, font, color: rgb(...sevRgb),
    });
    const msgText = `${f.inspection_id} — ${(f.message ?? "").slice(0, 100)}${(f.message ?? "").length > 100 ? "…" : ""}`;
    legendPage.drawText(msgText, {
      x: MARGIN + 20, y, size: FONT_SIZE, font, color: rgb(0.2, 0.2, 0.2),
      maxWidth: 612 - MARGIN * 2 - 20,
    });
    if (f.page_num && f.page_num > 0) {
      legendPage.drawText(`p.${f.page_num}`, {
        x: 612 - MARGIN - 30, y, size: FONT_SIZE, font, color: rgb(0.5, 0.5, 0.5),
      });
    }
    y -= LINE_H;
  }

  return Buffer.from(await doc.save());
}
