#!/usr/bin/env node

import { readFileSync } from "node:fs";

function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toPageInfo(page, fallbackPageNum) {
  const boxes = page?.boxes;
  const media = boxes?.media;
  if (!media || typeof media !== "object") return null;
  const x0 = toNumber(media.x0);
  const y0 = toNumber(media.y0);
  const x1 = toNumber(media.x1, 612);
  const y1 = toNumber(media.y1, 792);
  const pageNum = Math.max(1, Math.trunc(toNumber(page?.page_num, fallbackPageNum)));
  const toBox = (box) => {
    if (!box || typeof box !== "object") return null;
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
    crop_box: toBox(boxes?.crop),
    trim_box: toBox(boxes?.trim),
    bleed_box: toBox(boxes?.bleed),
    rotation: Math.trunc(toNumber(page?.rotation, 0)),
  };
}

function adapt(raw) {
  const doc = raw && typeof raw === "object" ? raw : {};
  const pages = Array.isArray(doc.pages)
    ? doc.pages.map((page, i) => toPageInfo(page, i + 1)).filter(Boolean)
    : [];
  const layers = Array.isArray(doc.ocgs)
    ? doc.ocgs
        .filter((entry) => entry && typeof entry === "object")
        .map((entry, index) => ({
          name:
            typeof entry.name === "string" && entry.name.trim()
              ? entry.name
              : `Layer ${index + 1}`,
          ocg_index: index,
          default_on: Boolean(entry.default_on),
          kind: "ocg",
        }))
    : [];

  return {
    adapter_path: "codex",
    codex_schema_version: typeof doc.schema_version === "string" ? doc.schema_version : null,
    page_count: pages.length,
    pages,
    layers,
  };
}

function parseInputPath(argv) {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--input-json") return argv[i + 1] ?? null;
  }
  return null;
}

const inputPath = parseInputPath(process.argv.slice(2));
if (!inputPath) {
  console.error("Usage: codex-viewer-adapter.mjs --input-json <path>");
  process.exit(2);
}
const payload = JSON.parse(readFileSync(inputPath, "utf8"));
process.stdout.write(`${JSON.stringify(adapt(payload), null, 2)}\n`);
