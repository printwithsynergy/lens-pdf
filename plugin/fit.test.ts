import { describe, expect, it } from "vitest";
import {
  type Bbox,
  collectItemRects,
  computeFitScale,
  itemFocusBbox,
  rectsEqual,
  unionBbox,
} from "./fit";
import type { OverlayItem } from "./types";

const item = (extra: Partial<OverlayItem>): OverlayItem => ({
  id: "f",
  page: 1,
  ...extra,
});

describe("computeFitScale", () => {
  it("fits a rect into the viewport (no padding)", () => {
    // 400x300 into 800x600 → min(2, 2) = 2
    expect(computeFitScale(400, 300, 800, 600, { padding: 0 })).toBeCloseTo(2);
  });

  it("uses the tighter of the two axes", () => {
    // 400x100 into 800x600 → min(2, 6) = 2 (width-limited)
    expect(computeFitScale(400, 100, 800, 600, { padding: 0 })).toBeCloseTo(2);
  });

  it("clamps a tiny rect to maxScale instead of zooming to a blurry crop", () => {
    expect(computeFitScale(1, 1, 800, 600)).toBe(4);
    expect(computeFitScale(1, 1, 800, 600, { maxScale: 6 })).toBe(6);
  });

  it("clamps an oversized rect up to minScale", () => {
    expect(computeFitScale(10000, 10000, 800, 600)).toBe(0.25);
    expect(computeFitScale(10000, 10000, 800, 600, { minScale: 0.1 })).toBe(0.1);
  });

  it("padding shrinks the available area", () => {
    // 200x200 into 800x800, 100px padding each edge → avail 600 → 3
    expect(computeFitScale(200, 200, 800, 800, { padding: 100 })).toBeCloseTo(3);
  });

  it("falls back to a clamped 1.0 on degenerate input", () => {
    expect(computeFitScale(0, 100, 800, 600)).toBe(1);
    expect(computeFitScale(100, 100, 0, 600)).toBe(1);
    expect(computeFitScale(-5, 100, 800, 600)).toBe(1);
    expect(computeFitScale(NaN, 100, 800, 600)).toBe(1);
  });
});

describe("unionBbox", () => {
  it("returns null for an empty list", () => {
    expect(unionBbox([])).toBeNull();
  });

  it("returns the single rect unchanged", () => {
    expect(unionBbox([[10, 20, 30, 40]])).toEqual([10, 20, 30, 40]);
  });

  it("covers every rect", () => {
    const rects: Bbox[] = [
      [10, 10, 20, 20],
      [50, 5, 60, 80],
      [0, 30, 5, 35],
    ];
    expect(unionBbox(rects)).toEqual([0, 5, 60, 80]);
  });

  it("normalizes swapped corners", () => {
    expect(unionBbox([[30, 40, 10, 20]])).toEqual([10, 20, 30, 40]);
  });
});

describe("collectItemRects / itemFocusBbox", () => {
  it("uses bbox alone when there are no regions", () => {
    const it1 = item({ bbox: [1, 2, 3, 4] });
    expect(collectItemRects(it1)).toEqual([[1, 2, 3, 4]]);
    expect(itemFocusBbox(it1)).toEqual([1, 2, 3, 4]);
  });

  it("uses regions alone when there is no bbox", () => {
    const it1 = item({
      regions: [
        [0, 0, 10, 10],
        [90, 90, 100, 100],
      ],
    });
    expect(collectItemRects(it1)).toEqual([
      [0, 0, 10, 10],
      [90, 90, 100, 100],
    ]);
    expect(itemFocusBbox(it1)).toEqual([0, 0, 100, 100]);
  });

  it("combines bbox + regions, bbox first", () => {
    const it1 = item({
      bbox: [40, 40, 50, 50],
      regions: [[0, 0, 10, 10]],
    });
    expect(collectItemRects(it1)).toEqual([
      [40, 40, 50, 50],
      [0, 0, 10, 10],
    ]);
    expect(itemFocusBbox(it1)).toEqual([0, 0, 50, 50]);
  });

  it("treats a loc-less finding as nothing to draw or frame", () => {
    const it1 = item({ label: "whole-page advisory" });
    expect(collectItemRects(it1)).toEqual([]);
    expect(itemFocusBbox(it1)).toBeNull();
  });

  it("ignores an empty regions array", () => {
    const it1 = item({ regions: [] });
    expect(collectItemRects(it1)).toEqual([]);
    expect(itemFocusBbox(it1)).toBeNull();
  });
});

describe("rectsEqual", () => {
  it("returns true for two nulls", () => {
    expect(rectsEqual(null, null)).toBe(true);
  });

  it("returns false when only one side is null", () => {
    expect(rectsEqual(null, [0, 0, 1, 1])).toBe(false);
    expect(rectsEqual([0, 0, 1, 1], null)).toBe(false);
  });

  it("returns true for identical rects (same reference)", () => {
    const a: Bbox = [1, 2, 3, 4];
    expect(rectsEqual(a, a)).toBe(true);
  });

  it("returns true for two value-equal rects with distinct identity", () => {
    expect(rectsEqual([1, 2, 3, 4], [1, 2, 3, 4])).toBe(true);
  });

  it("returns false when any coordinate differs", () => {
    expect(rectsEqual([1, 2, 3, 4], [1.001, 2, 3, 4])).toBe(false);
    expect(rectsEqual([1, 2, 3, 4], [1, 2, 3, 5])).toBe(false);
  });
});
