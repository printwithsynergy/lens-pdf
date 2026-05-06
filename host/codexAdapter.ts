import type { LayerInfo, PageInfo } from "../types";

export interface CodexViewerAdapterPayload {
  codex_schema_version: string | null;
  page_count: number;
  pages: PageInfo[];
  layers: LayerInfo[];
}

function toNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toPageInfo(page: Record<string, unknown>, fallbackPageNum: number): PageInfo | null {
  const boxes = page.boxes;
  if (!boxes || typeof boxes !== "object") return null;
  const boxRecord = boxes as Record<string, unknown>;
  const media = boxRecord.media;
  if (!media || typeof media !== "object") return null;
  const mediaRecord = media as Record<string, unknown>;
  const x0 = toNumber(mediaRecord.x0);
  const y0 = toNumber(mediaRecord.y0);
  const x1 = toNumber(mediaRecord.x1, 612);
  const y1 = toNumber(mediaRecord.y1, 792);
  const pageNum = Math.max(1, Math.trunc(toNumber(page.page_num, fallbackPageNum)));

  const toBox = (value: unknown) => {
    if (!value || typeof value !== "object") return null;
    const box = value as Record<string, unknown>;
    return {
      x0: toNumber(box.x0, x0),
      y0: toNumber(box.y0, y0),
      x1: toNumber(box.x1, x1),
      y1: toNumber(box.y1, y1),
    };
  };

  return {
    page_num: pageNum,
    width_pts: x1 - x0,
    height_pts: y1 - y0,
    media_box: { x0, y0, x1, y1 },
    crop_box: toBox(boxRecord.crop),
    trim_box: toBox(boxRecord.trim),
    bleed_box: toBox(boxRecord.bleed),
    rotation: Math.trunc(toNumber(page.rotation, 0)),
  };
}

export function adaptCodexDocumentForViewer(raw: unknown): CodexViewerAdapterPayload {
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pageList = Array.isArray(doc.pages) ? doc.pages : [];
  const pages: PageInfo[] = [];

  for (const [index, page] of pageList.entries()) {
    if (!page || typeof page !== "object") continue;
    const parsed = toPageInfo(page as Record<string, unknown>, index + 1);
    if (parsed) pages.push(parsed);
  }

  const ocgs = Array.isArray(doc.ocgs) ? doc.ocgs : [];
  const layers: LayerInfo[] = ocgs
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const name = typeof item.name === "string" && item.name.trim() ? item.name : `Layer ${index + 1}`;
      return {
        name,
        ocg_index: index,
        default_on: Boolean(item.default_on),
        kind: "ocg",
      };
    });

  return {
    codex_schema_version:
      typeof doc.schema_version === "string" ? doc.schema_version : null,
    page_count: pages.length,
    pages,
    layers,
  };
}
