import { describe, expect, it } from "vitest";

import {
  buildFindingNumberMap,
  hasViewerLocation,
  splitFindingsByLocation,
} from "./findings-location";
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
      hasViewerLocation(item({ id: "c", regions: [[0, 0, 10, 10]] } as unknown as OverlayItem)),
    ).toBe(true);
  });

  it("returns false for an empty regions array", () => {
    expect(hasViewerLocation(item({ id: "d", regions: [] } as unknown as OverlayItem))).toBe(false);
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

describe("buildFindingNumberMap", () => {
  it("assigns stable 1-based numbers in input order", () => {
    const items: OverlayItem[] = [
      item({ id: "a" }),
      item({ id: "b", bbox: [0, 0, 1, 1] }),
      item({ id: "c" }),
    ];
    const map = buildFindingNumberMap(items);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("returns an empty map for empty input", () => {
    expect(buildFindingNumberMap([]).size).toBe(0);
  });

  it("numbers are stable regardless of bbox presence", () => {
    const items: OverlayItem[] = [
      item({ id: "x" }),
      item({ id: "y", bbox: [0, 0, 5, 5] }),
      item({ id: "z" }),
    ];
    const map = buildFindingNumberMap(items);
    expect(map.get("x")).toBe(1);
    expect(map.get("y")).toBe(2);
    expect(map.get("z")).toBe(3);
    expect(map.size).toBe(3);
  });

  it("uses item.id as the map key", () => {
    const items: OverlayItem[] = [item({ id: "finding-42" })];
    const map = buildFindingNumberMap(items);
    expect(map.has("finding-42")).toBe(true);
    expect(map.get("finding-42")).toBe(1);
  });
});
