import { describe, expect, it } from "vitest";

import { hasViewerLocation, splitFindingsByLocation } from "./findings-location";
import type { OverlayItem } from "./types";

function item(overrides: Partial<OverlayItem> & { id: string }): OverlayItem {
  return {
    page: 1,
    ...overrides,
  } as OverlayItem;
}

describe("hasViewerLocation", () => {
  it("returns true for a 4-tuple bbox", () => {
    expect(hasViewerLocation(item({ id: "a", bbox: [0, 0, 10, 10] }))).toBe(true);
  });

  it("returns false when bbox is absent", () => {
    expect(hasViewerLocation(item({ id: "b" }))).toBe(false);
  });

  it("returns true for a non-empty regions array", () => {
    expect(
      hasViewerLocation(
        item({ id: "c", regions: [[0, 0, 10, 10]] } as unknown as OverlayItem),
      ),
    ).toBe(true);
  });

  it("returns false for an empty regions array", () => {
    expect(
      hasViewerLocation(
        item({ id: "d", regions: [] } as unknown as OverlayItem),
      ),
    ).toBe(false);
  });
});

describe("splitFindingsByLocation", () => {
  it("groups located items and informational items, preserving order", () => {
    const items: OverlayItem[] = [
      item({ id: "1" }),
      item({ id: "2", bbox: [0, 0, 1, 1] }),
      item({ id: "3" }),
      item({ id: "4", bbox: [2, 2, 3, 3] }),
    ];
    const { located, informational } = splitFindingsByLocation(items);
    expect(located.map((i) => i.id)).toEqual(["2", "4"]);
    expect(informational.map((i) => i.id)).toEqual(["1", "3"]);
  });

  it("returns empty arrays for empty input", () => {
    expect(splitFindingsByLocation([])).toEqual({ located: [], informational: [] });
  });
});
