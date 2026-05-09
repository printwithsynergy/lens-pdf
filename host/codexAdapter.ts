import type { LayerInfo, PageInfo } from "../types";
import type {
  CmykQuad,
  CodexSpotIntent,
  LabTriplet,
  RgbTriplet,
} from "./spotColor";

/**
 * Per-spot-colorant intent surfaced from the codex document — an
 * additive view of `color_spaces[*].spot_colorants[*]` plus any
 * extended fields the codex extractor populates (Lab, CMYK, RGB,
 * canonical PANTONE name).
 *
 * The shape mirrors {@link CodexSpotIntent} so the loupe-pdf spot
 * resolver can consume it directly.
 *
 * @public
 */
export interface CodexSpotColorantInfo extends CodexSpotIntent {
  /** Original spot ink name as recorded in the PDF (preserved casing). */
  name: string;
}

/**
 * Adapted shape consumed by the browser viewer services. Hosts
 * shouldn't reach for this directly; the factory does the conversion.
 *
 * @public
 */
export interface CodexViewerAdapterPayload {
  codex_schema_version: string | null;
  page_count: number;
  pages: PageInfo[];
  layers: LayerInfo[];
  /**
   * Deduplicated spot colorant inventory, keyed by ink name in the
   * order the codex document presents them. The loupe spot resolver
   * uses this to pull intent-accurate colour values before falling
   * back to the bundled Pantone reference.
   *
   * Codex PDFs that don't carry per-colorant Lab/CMYK still surface
   * here with just `name` populated — that's enough for the resolver
   * to attempt a Pantone lookup by name.
   */
  spot_colorants: CodexSpotColorantInfo[];
}

function toNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function toPageInfo(page: Record<string, unknown>, fallbackPageNum: number): PageInfo {
  const pageNum = Math.max(1, Math.trunc(toNumber(page.page_num, fallbackPageNum)));
  // Try boxes.media first; fall back to direct width_pts/height_pts; then 612×792 defaults.
  let x0 = 0, y0 = 0, x1 = 612, y1 = 792;
  const boxes = page.boxes;
  const boxRecord: Record<string, unknown> = (boxes && typeof boxes === "object")
    ? (boxes as Record<string, unknown>)
    : {};
  if (boxes && typeof boxes === "object") {
    const media = boxRecord.media;
    if (media && typeof media === "object") {
      const m = media as Record<string, unknown>;
      x0 = toNumber(m.x0, 0);
      y0 = toNumber(m.y0, 0);
      x1 = toNumber(m.x1, 612);
      y1 = toNumber(m.y1, 792);
    }
  }
  if (typeof page.width_pts === "number" && page.width_pts > 0) x1 = x0 + page.width_pts;
  if (typeof page.height_pts === "number" && page.height_pts > 0) y1 = y0 + page.height_pts;

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

// ---------------------------------------------------------------------------
// Spot colorant extraction
// ---------------------------------------------------------------------------

function asLabTriplet(value: unknown): LabTriplet | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const triplet = value.map((v) => toNumber(v, NaN));
  if (triplet.some((v) => !Number.isFinite(v))) return undefined;
  return [triplet[0]!, triplet[1]!, triplet[2]!];
}

function asCmykQuad(value: unknown): CmykQuad | undefined {
  if (!Array.isArray(value) || value.length !== 4) return undefined;
  const quad = value.map((v) => toNumber(v, NaN));
  if (quad.some((v) => !Number.isFinite(v))) return undefined;
  return [quad[0]!, quad[1]!, quad[2]!, quad[3]!];
}

function asRgbTriplet(value: unknown): RgbTriplet | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const triplet = value.map((v) => toNumber(v, NaN));
  if (triplet.some((v) => !Number.isFinite(v))) return undefined;
  // Auto-detect 0-1 vs 0-255 ranges. Pantone lookup paths always emit
  // 0-255 ints; some codex producers emit floats on [0, 1].
  const isUnit = triplet.every((v) => v >= 0 && v <= 1);
  if (isUnit) {
    return [
      Math.round(triplet[0]! * 255),
      Math.round(triplet[1]! * 255),
      Math.round(triplet[2]! * 255),
    ];
  }
  return [
    Math.max(0, Math.min(255, Math.round(triplet[0]!))),
    Math.max(0, Math.min(255, Math.round(triplet[1]!))),
    Math.max(0, Math.min(255, Math.round(triplet[2]!))),
  ];
}

function asPantoneName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Convert a codex spot colorant record (any shape the extractor
 * emits) into a {@link CodexSpotColorantInfo}.
 *
 * Recognised optional fields (any of which may carry colour intent):
 *   - `lab` / `alternate_lab` / `pantone_lab`
 *   - `cmyk` / `alternate_cmyk` / `cmyk_bridge` / `pantone_cmyk`
 *   - `rgb`  / `alternate_rgb`
 *   - `pantone_name` / `canonical_name`
 *
 * The resolver downstream is permissive about which path is populated
 * — first signal it finds wins.
 */
function readSpotColorantRecord(
  record: Record<string, unknown>,
): CodexSpotColorantInfo | null {
  const rawName = record.name;
  if (typeof rawName !== "string" || !rawName.trim()) return null;
  const name = rawName.trim();

  const lab =
    asLabTriplet(record.lab) ??
    asLabTriplet(record.alternate_lab) ??
    asLabTriplet(record.pantone_lab);
  const cmyk =
    asCmykQuad(record.cmyk) ??
    asCmykQuad(record.alternate_cmyk) ??
    asCmykQuad(record.cmyk_bridge) ??
    asCmykQuad(record.pantone_cmyk);
  const rgb = asRgbTriplet(record.rgb) ?? asRgbTriplet(record.alternate_rgb);
  const pantone_name =
    asPantoneName(record.pantone_name) ?? asPantoneName(record.canonical_name);

  const info: CodexSpotColorantInfo = { name };
  if (lab) info.lab = lab;
  if (cmyk) info.cmyk = cmyk;
  if (rgb) info.rgb = rgb;
  if (pantone_name) info.pantone_name = pantone_name;
  return info;
}

function mergeSpotInfo(
  existing: CodexSpotColorantInfo,
  incoming: CodexSpotColorantInfo,
): CodexSpotColorantInfo {
  return {
    name: existing.name,
    lab: existing.lab ?? incoming.lab,
    cmyk: existing.cmyk ?? incoming.cmyk,
    rgb: existing.rgb ?? incoming.rgb,
    pantone_name: existing.pantone_name ?? incoming.pantone_name,
  };
}

function extractSpotColorants(
  colorSpaces: unknown,
): CodexSpotColorantInfo[] {
  if (!Array.isArray(colorSpaces)) return [];
  const byName = new Map<string, CodexSpotColorantInfo>();

  for (const space of colorSpaces) {
    if (!space || typeof space !== "object") continue;
    const csRecord = space as Record<string, unknown>;
    const colorants = csRecord.spot_colorants;
    if (!Array.isArray(colorants)) continue;
    for (const colorant of colorants) {
      if (!colorant || typeof colorant !== "object") continue;
      const info = readSpotColorantRecord(colorant as Record<string, unknown>);
      if (!info) continue;
      // Process inks declared as Separation / DeviceN colorants are
      // valid PDF — but the viewer treats Cyan/Magenta/Yellow/Black
      // as canonical CMYK primaries, so we don't surface them here.
      const lower = info.name.toLowerCase();
      if (lower === "cyan" || lower === "magenta" || lower === "yellow" || lower === "black") {
        continue;
      }
      const prior = byName.get(info.name);
      byName.set(info.name, prior ? mergeSpotInfo(prior, info) : info);
    }
  }

  return Array.from(byName.values());
}

// ---------------------------------------------------------------------------
// Adapter entry
// ---------------------------------------------------------------------------

/**
 * Convert a raw codex document (parsed JSON) into the viewer-facing
 * payload the browser services consume.
 *
 * The transform is **additive only** — it never invents data. Empty
 * arrays are returned for codex documents that don't ship the
 * corresponding facts. Strict codex-authority mode in
 * `createBrowserViewerServices` then refuses to fall back to pdf.js
 * metadata.
 *
 * @public
 */
export function adaptCodexDocumentForViewer(raw: unknown): CodexViewerAdapterPayload {
  const doc = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const pageList = Array.isArray(doc.pages) ? doc.pages : [];
  const pages: PageInfo[] = [];

  for (const [index, page] of pageList.entries()) {
    if (!page || typeof page !== "object") continue;
    pages.push(toPageInfo(page as Record<string, unknown>, index + 1));
  }

  const ocgs = Array.isArray(doc.ocgs) ? doc.ocgs : [];
  const layers: LayerInfo[] = ocgs
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    .map((item, index) => {
      const name = typeof item.name === "string" && item.name.trim() ? item.name : `Layer ${index + 1}`;
      const ocgId =
        typeof item.ocg_id === "string" && item.ocg_id.trim() ? item.ocg_id : undefined;
      return {
        name,
        ocg_index: index,
        ocg_id: ocgId,
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
    spot_colorants: extractSpotColorants(doc.color_spaces),
  };
}
