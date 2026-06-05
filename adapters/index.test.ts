import { describe, expect, it } from "vitest";

import {
  fromArtworkFindings,
  fromCallasFindings,
  fromCodexFindings,
  fromLintFindings,
  fromPitstopFindings,
} from "./index";

describe("fromLintFindings", () => {
  it("passes lint's 1-indexed page_num through unchanged", () => {
    // lint-pdf's FindingResponse.page_num is ALREADY 1-indexed
    // (see lint-pdf src/lintpdf/api/schemas.py:102-110 — "Downstream
    // adapters MUST treat the value as already 1-indexed"). A
    // page_num of 3 must land on page 3, not page 4.
    const items = fromLintFindings([{ id: "a", page_num: 3, message: "page three" }]);
    expect(items[0].page).toBe(3);
  });

  it("falls back to page=1 when page_num is missing", () => {
    const items = fromLintFindings([{ id: "doc-level", message: "no page" }]);
    expect(items[0].page).toBe(1);
  });

  it("rejects non-integer page_num and falls back to page=1", () => {
    const items = fromLintFindings([
      { id: "nan", page_num: NaN, message: "nan" },
      { id: "float", page_num: 2.5, message: "float" },
      { id: "neg", page_num: -1, message: "negative" },
      { id: "string", page_num: "3", message: "stringy" },
    ]);
    expect(items.map((it) => it.page)).toEqual([1, 1, 1, 1]);
  });

  it("does NOT clamp page against an unknown pageCount", () => {
    // The adapter has no pageCount context — out-of-range values
    // pass through and are clamped downstream by <LensPDF>. This
    // test pins that contract so future refactors don't accidentally
    // start dropping out-of-range items here.
    const items = fromLintFindings([{ id: "way-past-end", page_num: 999, message: "off the end" }]);
    expect(items[0].page).toBe(1000);
  });

  it("uses 1-indexed page field when page_num is absent", () => {
    const items = fromLintFindings([{ id: "x", page: 3, message: "page-3 finding" }]);
    expect(items[0].page).toBe(3);
  });
});

describe("page clamp invariant (host-side defense)", () => {
  // The selection effect in components/LensPDF.tsx clamps
  //   target = min(max(1, pageCount), max(1, item.page))
  // before calling setCurrentPage. This test pins the math so a
  // future refactor of the inline expression can't drift.
  const clampPage = (page: number, pageCount: number) =>
    Math.min(Math.max(1, pageCount), Math.max(1, page));

  it("clamps an out-of-range page down to pageCount", () => {
    expect(clampPage(999, 3)).toBe(3);
  });

  it("clamps a zero/negative page up to 1", () => {
    expect(clampPage(0, 10)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
  });

  it("passes through in-range pages unchanged", () => {
    expect(clampPage(2, 5)).toBe(2);
    expect(clampPage(5, 5)).toBe(5);
  });

  it("returns 1 when pageCount is not yet known (0 or NaN)", () => {
    expect(clampPage(3, 0)).toBe(1);
  });
});

describe("regions passthrough", () => {
  // Source formats that emit a `regions` array (multi-rect findings —
  // e.g. the same low-res image placed in N corners) should round-trip
  // through every built-in adapter into OverlayItem.regions, so the
  // viewer can highlight every rect and frame their union.

  const validRegions = [
    [10, 10, 20, 20],
    [100, 100, 140, 140],
  ];

  it("fromCodexFindings passes regions through", () => {
    const items = fromCodexFindings([
      { id: "c1", page: 2, bbox: [0, 0, 5, 5], regions: validRegions, message: "m" },
    ]);
    expect(items[0].regions).toEqual(validRegions);
  });

  it("fromLintFindings passes regions through", () => {
    const items = fromLintFindings([
      { id: "l1", page_num: 0, regions: validRegions, message: "m" },
    ]);
    expect(items[0].regions).toEqual(validRegions);
  });

  it("fromCallasFindings passes regions through", () => {
    const items = fromCallasFindings([{ id: "ca1", page: 1, regions: validRegions, message: "m" }]);
    expect(items[0].regions).toEqual(validRegions);
  });

  it("fromPitstopFindings passes regions through", () => {
    const items = fromPitstopFindings([
      { id: "ps1", pageNumber: 1, regions: validRegions, description: "m" },
    ]);
    expect(items[0].regions).toEqual(validRegions);
  });

  it("fromArtworkFindings passes regions through", () => {
    const items = fromArtworkFindings([{ id: "a1", page: 1, regions: validRegions, message: "m" }]);
    expect(items[0].regions).toEqual(validRegions);
  });

  it("omits regions when absent (not an empty array, so the field round-trips)", () => {
    const items = fromCodexFindings([{ id: "c1", page: 1, bbox: [0, 0, 5, 5], message: "m" }]);
    expect(items[0]).not.toHaveProperty("regions");
  });

  it("drops malformed entries and omits regions when none survive", () => {
    const items = fromLintFindings([
      {
        id: "l1",
        page_num: 0,
        // first is too short, second is non-numeric, third valid
        regions: [
          [1, 2, 3],
          ["a", 2, 3, 4],
          [10, 10, 20, 20],
        ],
        message: "m",
      },
    ]);
    expect(items[0].regions).toEqual([[10, 10, 20, 20]]);

    const empty = fromLintFindings([
      {
        id: "l2",
        page_num: 0,
        regions: [[1, 2, 3], "nope", null],
        message: "m",
      },
    ]);
    expect(empty[0]).not.toHaveProperty("regions");
  });

  it("treats a finding with only regions (no bbox) as locatable input", () => {
    // Smoke-test the full round-trip from raw source → OverlayItem with
    // only regions set, the case where regions alone makes the item
    // locatable (see plugin/findings-location.hasViewerLocation).
    const items = fromCodexFindings([{ id: "c1", page: 1, regions: validRegions, message: "m" }]);
    expect(items[0].bbox).toBeUndefined();
    expect(items[0].regions).toEqual(validRegions);
  });
});
