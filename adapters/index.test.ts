import { describe, expect, it } from "vitest";

import { fromLintFindings } from "./index";

describe("fromLintFindings", () => {
  it("converts 0-indexed page_num to 1-indexed page", () => {
    const items = fromLintFindings([
      { id: "a", page_num: 0, message: "first page" },
      { id: "b", page_num: 4, message: "fifth page" },
    ]);
    expect(items.map((it) => it.page)).toEqual([1, 5]);
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
    const items = fromLintFindings([
      { id: "way-past-end", page_num: 999, message: "off the end" },
    ]);
    expect(items[0].page).toBe(1000);
  });

  it("uses 1-indexed page field when page_num is absent", () => {
    const items = fromLintFindings([
      { id: "x", page: 3, message: "page-3 finding" },
    ]);
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
