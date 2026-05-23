/**
 * Adapters — pure TypeScript, no React. Map raw engine outputs
 * (codex, lint-pdf, callas, pitstop) to the types lens-pdf accepts
 * as props. Import from `@printwithsynergy/lens-pdf/adapters`.
 *
 * Zero custom glue code needed in demos: pass raw engine responses
 * to `<LensPDF dataConfig={...}>` and lens handles the mapping.
 */

import type { OverlayItem } from "../plugin/types";
import type { DielineResult } from "../types";

// ---------------------------------------------------------------------------
// Data config type
// ---------------------------------------------------------------------------

/**
 * Raw engine outputs. Pass to `<LensPDF dataConfig={...}>` and lens
 * maps them internally — no host-side adapter code required.
 *
 * @public
 */
export interface LensPDFDataConfig {
  /** Raw codex `ExtractResponse.summary` object. */
  codexSummary?: Record<string, unknown> | null;
  /** Raw codex `ExtractResponse.findings` array. */
  codexFindings?: ReadonlyArray<Record<string, unknown>> | null;
  /** Raw lint-pdf engine findings array. */
  lintFindings?: ReadonlyArray<Record<string, unknown>> | null;
  /** Raw callas PDF Toolbox / pdfaPilot hits array. */
  callasFindings?: ReadonlyArray<Record<string, unknown>> | null;
  /** Raw Enfocus PitStop results array. */
  pitstopFindings?: ReadonlyArray<Record<string, unknown>> | null;
  /** Raw artwork-pdf preflight issues array. */
  artworkFindings?: ReadonlyArray<Record<string, unknown>> | null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const KNOWN_TIERS = new Set(["error", "warning", "advisory", "info", "neutral"]);

function pickTier(severity: unknown): OverlayItem["tier"] {
  const v = (typeof severity === "string" ? severity : "").toLowerCase();
  if (KNOWN_TIERS.has(v)) return v as OverlayItem["tier"];
  if (v === "fail" || v === "blocker" || v === "critical") return "error";
  if (v === "warn") return "warning";
  return "info";
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function asBbox(v: unknown): [number, number, number, number] | undefined {
  if (
    Array.isArray(v) &&
    v.length === 4 &&
    v.every((x) => typeof x === "number")
  ) {
    return [v[0], v[1], v[2], v[3]];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// fromCodexSummary
// ---------------------------------------------------------------------------

/**
 * Map a raw codex `summary` object to a lens dieline result and spot
 * palette. Backward-compatible: falls back to `(0, 0)` origin when the
 * codex version predates the `x0_pt` / `y0_pt` fields.
 *
 * @public
 */
export function fromCodexSummary(summary: Record<string, unknown>): {
  dieline: DielineResult | null;
  spotPalette: Record<string, string> | undefined;
} {
  // --- dieline ---
  let dieline: DielineResult | null = null;
  const die = summary.dieline;
  if (die && typeof die === "object") {
    const d = die as Record<string, unknown>;
    const size =
      d.size && typeof d.size === "object"
        ? (d.size as Record<string, unknown>)
        : null;
    if (size && size.available === true) {
      const widthPt = typeof size.width_pt === "number" ? size.width_pt : 0;
      const heightPt = typeof size.height_pt === "number" ? size.height_pt : 0;
      const x0 = typeof size.x0_pt === "number" ? size.x0_pt : 0;
      const y0 = typeof size.y0_pt === "number" ? size.y0_pt : 0;
      const widthMm =
        typeof size.width_mm === "number"
          ? size.width_mm
          : (widthPt * 25.4) / 72;
      const heightMm =
        typeof size.height_mm === "number"
          ? size.height_mm
          : (heightPt * 25.4) / 72;
      const candidates = Array.isArray(d.candidates) ? d.candidates : [];
      const firstNamed = candidates
        .filter(
          (c): c is Record<string, unknown> =>
            Boolean(c && typeof c === "object"),
        )
        .find(
          (c) =>
            typeof c.name === "string" &&
            c.source !== "analysis_stroke_bbox",
        );
      const overallConf =
        typeof d.overall_confidence === "number" ? d.overall_confidence : 0;
      const sizeConf =
        typeof size.confidence === "number" ? size.confidence : 0;
      dieline = {
        source: firstNamed ? "name" : "vision",
        polylines: [],
        spot_name:
          firstNamed && typeof firstNamed.name === "string"
            ? firstNamed.name
            : null,
        confidence: Math.max(0, Math.min(1, overallConf || sizeConf)),
        regions: [
          {
            x0,
            y0,
            x1: x0 + widthPt,
            y1: y0 + heightPt,
            width_mm: widthMm,
            height_mm: heightMm,
          },
        ],
        multi_color: false,
      };
    }
  }

  // --- spot palette ---
  let spotPalette: Record<string, string> | undefined;
  const sc = summary.spot_colors;
  if (sc && typeof sc === "object") {
    const colors = (sc as Record<string, unknown>).colors;
    if (Array.isArray(colors) && colors.length > 0) {
      const out: Record<string, string> = {};
      for (const entry of colors) {
        if (!entry || typeof entry !== "object") continue;
        const e = entry as Record<string, unknown>;
        const name = typeof e.name === "string" ? e.name.trim() : "";
        const hex =
          typeof e.swatch_hex === "string" ? e.swatch_hex.trim() : "";
        if (name && hex) out[name] = hex;
      }
      if (Object.keys(out).length > 0) spotPalette = out;
    }
  }

  return { dieline, spotPalette };
}

// ---------------------------------------------------------------------------
// fromCodexFindings
// ---------------------------------------------------------------------------

/**
 * Map raw codex `findings[]` to `OverlayItem[]`. Codex findings are
 * already 1-indexed and use the same severity vocabulary as lens tiers,
 * so this is a direct mapping.
 *
 * @public
 */
export function fromCodexFindings(
  findings: ReadonlyArray<Record<string, unknown>>,
): OverlayItem[] {
  return findings.map((f, i) => {
    const id =
      typeof f.id === "string" && f.id
        ? `codex-${f.id}`
        : `codex-finding-${i}`;
    const tier = pickTier(f.severity);
    const page = typeof f.page === "number" && f.page > 0 ? f.page : 1;
    const bbox = asBbox(f.bbox);
    const message =
      typeof f.message === "string" && f.message
        ? f.message
        : String(f.type ?? "finding");
    const code = typeof f.type === "string" ? f.type : undefined;
    return {
      id,
      page,
      bbox,
      tier,
      code,
      label: truncate(message, 80),
      description: message,
      data: f,
    };
  });
}

// ---------------------------------------------------------------------------
// fromLintFindings
// ---------------------------------------------------------------------------

/**
 * Map raw lint-pdf engine findings to `OverlayItem[]`. Lint engine
 * emits 0-indexed `page_num`; OverlayItem expects 1-indexed.
 *
 * This adapter does not know the document's pageCount and cannot
 * clamp against it — if an engine version drifts and emits a
 * `page_num` past the document end, the resulting `page` value
 * will be out of range. That is caught downstream by `<LensPDF>`'s
 * finding-selection effect, which clamps `currentPage` to
 * `[1, pageCount]` before driving pdfjs. The adapter itself only
 * drops `page_num`s that aren't finite non-negative integers, so
 * a stray `NaN` / `-1` / `"3"` can't become a `page: 0` or
 * `page: -2` overlay item.
 *
 * @public
 */
export function fromLintFindings(
  findings: ReadonlyArray<Record<string, unknown>>,
): OverlayItem[] {
  return findings.map((f, i) => {
    const code =
      (typeof f.inspection_id === "string" && f.inspection_id) ||
      (typeof f.rule_id === "string" && f.rule_id) ||
      (typeof f.code === "string" && f.code) ||
      "lintpdf";
    const message =
      (typeof f.message === "string" && f.message) ||
      (typeof f.description === "string" && f.description) ||
      code;
    const id =
      typeof f.id === "string" && f.id ? f.id : `lintpdf-${code}-${i}`;
    const tier = pickTier(
      (f.severity ?? f.level) as string | null | undefined,
    );
    const validPageNum =
      typeof f.page_num === "number" &&
      Number.isInteger(f.page_num) &&
      f.page_num >= 0;
    const validPage1 =
      typeof f.page === "number" &&
      Number.isInteger(f.page) &&
      f.page > 0;
    const page = validPageNum
      ? (f.page_num as number) + 1
      : validPage1
        ? (f.page as number)
        : 1;
    const bbox = asBbox(f.bbox);
    // Spell-check findings get a squiggly rendering hint so PageCanvas
    // draws a wavy underline instead of the standard filled rectangle.
    const type =
      typeof code === "string" && code.startsWith("LPDF_SPELL")
        ? "spell_check"
        : undefined;
    return {
      id,
      page,
      bbox,
      tier,
      code,
      label: truncate(message, 80),
      description: message,
      data: f,
      ...(type ? { type } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// fromCallasFindings
// ---------------------------------------------------------------------------

/**
 * Map raw callas PDF Toolbox / pdfaPilot hit objects to `OverlayItem[]`.
 * Callas shape: `{ severity, message, page, rule, ... }` per hit.
 *
 * @public
 */
export function fromCallasFindings(
  findings: ReadonlyArray<Record<string, unknown>>,
): OverlayItem[] {
  return findings.map((f, i) => {
    const severity = f.severity ?? f.level ?? f.type;
    const tier = pickTier(severity);
    const message =
      (typeof f.message === "string" && f.message) ||
      (typeof f.description === "string" && f.description) ||
      (typeof f.rule === "string" && f.rule) ||
      `callas-${i}`;
    const code =
      (typeof f.rule === "string" && f.rule) ||
      (typeof f.checkName === "string" && f.checkName) ||
      undefined;
    const rawPage = f.page ?? f.pageNumber ?? f.page_num;
    const page =
      typeof rawPage === "number" ? (rawPage > 0 ? rawPage : 1) : 1;
    const id =
      typeof f.id === "string" && f.id ? f.id : `callas-${code ?? i}-${i}`;
    const bbox = asBbox(f.bbox ?? f.rect);
    return {
      id,
      page,
      bbox,
      tier,
      code,
      label: truncate(message, 80),
      description: message,
      data: f,
    };
  });
}

// ---------------------------------------------------------------------------
// fromPitstopFindings
// ---------------------------------------------------------------------------

/**
 * Map raw Enfocus PitStop result objects to `OverlayItem[]`.
 * PitStop shape: `{ level, description, pageNumber, checkName, ... }`.
 *
 * @public
 */
export function fromPitstopFindings(
  findings: ReadonlyArray<Record<string, unknown>>,
): OverlayItem[] {
  return findings.map((f, i) => {
    const severity = f.level ?? f.severity ?? f.type;
    const tier = pickTier(severity);
    const message =
      (typeof f.description === "string" && f.description) ||
      (typeof f.message === "string" && f.message) ||
      (typeof f.checkName === "string" && f.checkName) ||
      `pitstop-${i}`;
    const code =
      (typeof f.checkName === "string" && f.checkName) ||
      (typeof f.rule === "string" && f.rule) ||
      undefined;
    const rawPage = f.pageNumber ?? f.page_num ?? f.page;
    const page =
      typeof rawPage === "number" ? (rawPage > 0 ? rawPage : 1) : 1;
    const id =
      typeof f.id === "string" && f.id
        ? f.id
        : `pitstop-${code ?? i}-${i}`;
    const bbox = asBbox(f.bbox ?? f.rect);
    return {
      id,
      page,
      bbox,
      tier,
      code,
      label: truncate(message, 80),
      description: message,
      data: f,
    };
  });
}

// ---------------------------------------------------------------------------
// fromArtworkFindings
// ---------------------------------------------------------------------------

/**
 * Map raw artwork-pdf `PreflightIssue[]` to `OverlayItem[]`.
 * Remaps legacy severity vocab: `"block"` → `"error"`, `"warn"` →
 * `"warning"`. Handles missing bbox gracefully (no canvas overlay).
 *
 * @public
 */
export function fromArtworkFindings(
  findings: ReadonlyArray<Record<string, unknown>>,
): OverlayItem[] {
  return findings.flatMap((f, i) => {
    const rawSev = typeof f.severity === "string" ? f.severity : "";
    const tier: OverlayItem["tier"] =
      rawSev === "block"
        ? "error"
        : rawSev === "warn"
          ? "warning"
          : (["error", "warning", "advisory", "info"].includes(rawSev)
              ? rawSev
              : "advisory") as OverlayItem["tier"];
    const page = typeof f.page === "number" && f.page > 0 ? f.page : 1;
    const bbox = asBbox(f.bbox);
    const message =
      (typeof f.message === "string" && f.message) ||
      (typeof f.checkName === "string" && f.checkName) ||
      `artwork-${i}`;
    const code =
      (typeof f.checkName === "string" && f.checkName) ||
      (typeof f.type === "string" && f.type) ||
      undefined;
    const id =
      typeof f.id === "string" && f.id
        ? f.id
        : `artwork-${code ?? i}-${i}`;
    return [
      {
        id,
        page,
        bbox,
        tier,
        code,
        label: truncate(message, 80),
        description: message,
        data: f,
      },
    ];
  });
}
