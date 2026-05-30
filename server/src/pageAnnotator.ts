import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { renderComposite } from "./ghostscript.js";
import type { AnnotatedPage, Callout, Finding } from "./renderTypes.js";

const SEVERITY_STROKE: Record<string, string> = {
  error: "#dc2626",
  warning: "#d97706",
  advisory: "#2563eb",
};
const SEVERITY_FILL: Record<string, string> = {
  error: "rgba(239,68,68,0.18)",
  warning: "rgba(245,158,11,0.16)",
  advisory: "rgba(59,130,246,0.14)",
};
const SEVERITY_BADGE: Record<string, string> = {
  error: "#dc2626",
  warning: "#d97706",
  advisory: "#2563eb",
};

async function getPageMediaBox(
  pdfBytes: Buffer,
  pageNum: number,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const page = doc.getPage(pageNum - 1);
  return page.getMediaBox();
}

function buildAnnotationSvg(
  width: number,
  height: number,
  findings: Finding[],
  mediaBox: { x: number; y: number; width: number; height: number },
): { svg: string; callouts: Callout[] } {
  const BADGE_R = 10;
  const callouts: Callout[] = [];
  let shapes = "";
  let num = 0;

  for (const f of findings) {
    num++;
    const sev = f.severity ?? "advisory";
    const stroke = SEVERITY_STROKE[sev] ?? "#2563eb";
    const fill = SEVERITY_FILL[sev] ?? "rgba(59,130,246,0.14)";
    const badge = SEVERITY_BADGE[sev] ?? "#2563eb";
    const bbox = f.bbox;
    const hasBbox = Array.isArray(bbox) && bbox[0] != null;

    callouts.push({
      number: num,
      severity: sev,
      inspection_id: f.inspection_id,
      message: f.message,
      bbox_present: hasBbox,
    });

    if (hasBbox) {
      const [b0, b1, b2, b3] = bbox as [number, number, number, number];
      const mb = mediaBox;
      const scaleX = width / mb.width;
      const scaleY = height / mb.height;
      const px0 = Math.round((b0 - mb.x) * scaleX);
      const py0 = Math.round(height - (b3 - mb.y) * scaleY);
      const px1 = Math.round((b2 - mb.x) * scaleX);
      const py1 = Math.round(height - (b1 - mb.y) * scaleY);
      const rx = Math.max(0, px0),
        ry = Math.max(0, py0);
      const rw = Math.max(0, Math.min(px1, width) - rx);
      const rh = Math.max(0, Math.min(py1, height) - ry);
      if (rw > 2 && rh > 2) {
        shapes += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        const bx = Math.min(px1 + 2, width - BADGE_R - 2);
        const by = Math.max(py0 - 2, BADGE_R + 2);
        shapes += `<circle cx="${bx}" cy="${by}" r="${BADGE_R}" fill="${badge}" opacity="0.9"/>`;
        shapes += `<text x="${bx}" y="${by + 4}" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${num}</text>`;
      }
    } else {
      const flagY = Math.min(20 + (num - 1) * 26, height - BADGE_R - 4);
      shapes += `<circle cx="${BADGE_R + 6}" cy="${flagY}" r="${BADGE_R}" fill="${badge}" opacity="0.9"/>`;
      shapes += `<text x="${BADGE_R + 6}" y="${flagY + 4}" text-anchor="middle" fill="white" font-size="9" font-weight="bold" font-family="sans-serif">${num}</text>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${shapes}</svg>`;
  return { svg, callouts };
}

export async function renderAnnotatedPage(
  pdfPath: string,
  pdfBytes: Buffer,
  pageNum: number,
  findings: Finding[],
  dpi = 150,
): Promise<AnnotatedPage> {
  const [pngBuf, mediaBox] = await Promise.all([
    renderComposite({ pdfPath, pageNum, dpi }),
    getPageMediaBox(pdfBytes, pageNum),
  ]);

  const meta = await sharp(pngBuf).metadata();
  const width = meta.width!;
  const height = meta.height!;

  const { svg, callouts } = buildAnnotationSvg(
    width,
    height,
    findings,
    mediaBox,
  );
  const svgBuf = Buffer.from(svg);

  const annotated = await sharp(pngBuf)
    .composite([{ input: svgBuf, top: 0, left: 0 }])
    .png()
    .toBuffer();

  return {
    page_num: pageNum,
    image_base64: annotated.toString("base64"),
    width,
    height,
    callouts,
  };
}

export async function renderFindingThumbnail(
  pdfPath: string,
  pdfBytes: Buffer,
  pageNum: number,
  finding: Finding,
  dpi = 120,
): Promise<string> {
  const [pngBuf, mediaBox] = await Promise.all([
    renderComposite({ pdfPath, pageNum, dpi }),
    getPageMediaBox(pdfBytes, pageNum),
  ]);
  const meta = await sharp(pngBuf).metadata();
  const width = meta.width!;
  const height = meta.height!;
  const sev = finding.severity ?? "advisory";
  const stroke = SEVERITY_STROKE[sev] ?? "#2563eb";
  const fill = SEVERITY_FILL[sev] ?? "rgba(59,130,246,0.14)";
  const PADDING = 48;
  const THUMB_W = 240,
    THUMB_H = 180;
  const bbox = finding.bbox;
  const hasBbox = Array.isArray(bbox) && bbox[0] != null;

  let cropX = 0,
    cropY = 0,
    cropW = width,
    cropH = height;
  let highlightSvg = "";

  if (hasBbox) {
    const [b0, b1, b2, b3] = bbox as [number, number, number, number];
    const mb = mediaBox;
    const scaleX = width / mb.width;
    const scaleY = height / mb.height;
    const px0 = Math.round((b0 - mb.x) * scaleX);
    const py0 = Math.round(height - (b3 - mb.y) * scaleY);
    const px1 = Math.round((b2 - mb.x) * scaleX);
    const py1 = Math.round(height - (b1 - mb.y) * scaleY);
    cropX = Math.max(0, px0 - PADDING);
    cropY = Math.max(0, py0 - PADDING);
    cropW = Math.min(width, px1 + PADDING) - cropX;
    cropH = Math.min(height, py1 + PADDING) - cropY;
    const rx = px0 - cropX,
      ry = py0 - cropY;
    const rw = px1 - px0,
      rh = py1 - py0;
    highlightSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cropW}" height="${cropH}"><rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`;
  } else {
    cropX = Math.max(0, Math.floor(width / 2) - THUMB_W);
    cropY = Math.max(0, Math.floor(height / 3) - THUMB_H);
    cropW = Math.min(width - cropX, THUMB_W * 2);
    cropH = Math.min(height - cropY, THUMB_H * 2);
  }

  let pipeline = sharp(pngBuf).extract({
    left: cropX,
    top: cropY,
    width: cropW,
    height: cropH,
  });
  if (highlightSvg) {
    pipeline = pipeline.composite([
      { input: Buffer.from(highlightSvg), top: 0, left: 0 },
    ]);
  }
  const thumb = await pipeline
    .resize(THUMB_W, THUMB_H, { fit: "inside" })
    .png()
    .toBuffer();
  return thumb.toString("base64");
}
