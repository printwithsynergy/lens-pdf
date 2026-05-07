import { describe, expect, it } from "vitest";

import {
  alternatePantoneKey,
  cmykToSrgb,
  hashHueRgb,
  labD50ToSrgb,
  lookupCuratedSpot,
  lookupPantoneSpot,
  normalizePantoneName,
  resolveSpotSwatchColor,
} from "./index";

describe("normalizePantoneName", () => {
  it("uppercases and trims whitespace", () => {
    expect(normalizePantoneName("  pantone 485 c  ")).toBe("PANTONE 485 C");
  });
  it("collapses multiple spaces", () => {
    expect(normalizePantoneName("PANTONE   485    C")).toBe("PANTONE 485 C");
  });
  it("is idempotent on already-normalized values", () => {
    expect(normalizePantoneName("PANTONE 485 C")).toBe("PANTONE 485 C");
  });
});

describe("alternatePantoneKey", () => {
  it("inserts a space before C/U/M/V finish suffix when missing", () => {
    expect(alternatePantoneKey("PANTONE 485C")).toBe("PANTONE 485 C");
    expect(alternatePantoneKey("PANTONE 485U")).toBe("PANTONE 485 U");
  });
  it("removes the space before the suffix when present", () => {
    expect(alternatePantoneKey("PANTONE 485 C")).toBe("PANTONE 485C");
  });
  it("returns null for non-matching keys", () => {
    expect(alternatePantoneKey("PANTONE Reflex Blue")).toBe(null);
    expect(alternatePantoneKey("Cut")).toBe(null);
  });
});

describe("lookupPantoneSpot", () => {
  it("resolves canonical Pantone names from the bundled DB", () => {
    const ref = lookupPantoneSpot("PANTONE 185 C");
    expect(ref?.pantone_name).toBe("PANTONE 185 C");
    expect(ref?.lab).toBeDefined();
    expect(ref?.cmyk).toBeDefined();
  });

  it("matches case-insensitive and space-collapsed variants", () => {
    const a = lookupPantoneSpot("pantone 185 c");
    const b = lookupPantoneSpot("PANTONE  185   C");
    expect(a?.pantone_name).toBe("PANTONE 185 C");
    expect(b?.pantone_name).toBe("PANTONE 185 C");
  });

  it("matches the no-space variant via alternate key", () => {
    const ref = lookupPantoneSpot("PANTONE 485C");
    expect(ref?.pantone_name).toBe("PANTONE 485 C");
  });

  it("resolves named non-numeric Pantone spots and preserves display casing", () => {
    expect(lookupPantoneSpot("PANTONE Reflex Blue C")?.pantone_name).toBe(
      "PANTONE Reflex Blue C",
    );
    // Even though the input was lower-cased, the result reports the
    // bundled DB's canonical display name (mixed case).
    expect(lookupPantoneSpot("pantone process blue c")?.pantone_name).toBe(
      "PANTONE Process Blue C",
    );
  });

  it("returns null when the name is not in the bundled DB", () => {
    expect(lookupPantoneSpot("Made Up Brand Color")).toBeNull();
    expect(lookupPantoneSpot("PANTONE 9999 C")).toBeNull();
  });

  it("prefers extra refs over the bundled DB", () => {
    const ref = lookupPantoneSpot("PANTONE 185 C", {
      "PANTONE 185 C": { lab: [1, 2, 3], cmyk: [10, 20, 30, 40] },
    });
    expect(ref?.lab).toEqual([1, 2, 3]);
    expect(ref?.cmyk).toEqual([10, 20, 30, 40]);
  });
});

describe("lookupCuratedSpot", () => {
  it("matches dieline tokens", () => {
    expect(lookupCuratedSpot("Dieline")?.rgb).toEqual([148, 0, 211]);
    expect(lookupCuratedSpot("die-line layer")?.rgb).toEqual([148, 0, 211]);
  });
  it("matches cut tokens", () => {
    expect(lookupCuratedSpot("CutContour")?.rgb).toEqual([236, 0, 140]);
    expect(lookupCuratedSpot("Cut Layer")?.rgb).toEqual([236, 0, 140]);
  });
  it("matches metallic tokens", () => {
    expect(lookupCuratedSpot("Silver Foil")?.rgb).toEqual([165, 165, 175]);
    expect(lookupCuratedSpot("Gold Ink")?.rgb).toEqual([212, 175, 55]);
  });
  it("returns null for unknown names", () => {
    expect(lookupCuratedSpot("PANTONE 185 C")).toBeNull();
    expect(lookupCuratedSpot("Brand Pink")).toBeNull();
  });
});

describe("colorMath", () => {
  it("labD50ToSrgb on Pantone 185 C produces a red-leaning sRGB value", () => {
    const ref = lookupPantoneSpot("PANTONE 185 C");
    expect(ref?.lab).toBeDefined();
    const rgb = labD50ToSrgb(ref!.lab as [number, number, number]);
    // Pantone 185 C is a warm red; expect R dominant, B/G subordinate.
    expect(rgb[0]).toBeGreaterThan(200);
    expect(rgb[1]).toBeLessThan(80);
    expect(rgb[2]).toBeLessThan(80);
  });
  it("labD50ToSrgb on Pantone Reflex Blue C produces a cobalt-leaning value", () => {
    const ref = lookupPantoneSpot("PANTONE Reflex Blue C");
    expect(ref?.lab).toBeDefined();
    const rgb = labD50ToSrgb(ref!.lab as [number, number, number]);
    // Reflex Blue is a deep cobalt; expect B >> R, G low.
    expect(rgb[2]).toBeGreaterThan(100);
    expect(rgb[2]).toBeGreaterThan(rgb[0]);
    expect(rgb[2]).toBeGreaterThan(rgb[1]);
  });
  it("cmykToSrgb on pure cyan returns blue-cyan range", () => {
    const rgb = cmykToSrgb([100, 0, 0, 0]);
    expect(rgb[0]).toBe(0);
    expect(rgb[1]).toBe(255);
    expect(rgb[2]).toBe(255);
  });
  it("cmykToSrgb accepts 0-1 ranges as well as 0-100", () => {
    const a = cmykToSrgb([1, 0, 0, 0]);
    const b = cmykToSrgb([100, 0, 0, 0]);
    expect(a).toEqual(b);
  });
});

describe("resolveSpotSwatchColor — precedence", () => {
  it("uses host override RGB at top precedence", () => {
    const res = resolveSpotSwatchColor("PANTONE 185 C", {
      hostOverride: { rgb: [10, 20, 30] },
    });
    expect(res.rgb).toEqual([10, 20, 30]);
    expect(res.source).toBe("host");
  });

  it("uses host override Lab when no RGB given", () => {
    const res = resolveSpotSwatchColor("PANTONE 185 C", {
      hostOverride: { lab: [50, 70, 50] },
    });
    expect(res.source).toBe("host");
    expect(res.lab).toEqual([50, 70, 50]);
    expect(res.rgb[0]).toBeGreaterThan(200);
  });

  it("uses host override CMYK when no Lab/RGB given", () => {
    const res = resolveSpotSwatchColor("PANTONE 185 C", {
      hostOverride: { cmyk: [0, 100, 100, 0] },
    });
    expect(res.source).toBe("host");
    expect(res.cmyk).toEqual([0, 100, 100, 0]);
    expect(res.rgb).toEqual([255, 0, 0]);
  });

  it("falls through to codex Lab when no host override is set", () => {
    const res = resolveSpotSwatchColor("Brand Spot", {
      codex: { lab: [40, 60, -20] },
    });
    expect(res.source).toBe("codex");
    expect(res.lab).toEqual([40, 60, -20]);
  });

  it("falls through to codex RGB when carried directly", () => {
    const res = resolveSpotSwatchColor("Brand Spot", {
      codex: { rgb: [42, 84, 168] },
    });
    expect(res.source).toBe("codex");
    expect(res.rgb).toEqual([42, 84, 168]);
  });

  it("uses codex pantone_name to pull bundled DB Lab when codex carries no values", () => {
    const res = resolveSpotSwatchColor("Vendor 185", {
      codex: { pantone_name: "PANTONE 185 C" },
    });
    expect(res.source).toBe("pantone");
    expect(res.pantone_name).toBe("PANTONE 185 C");
    expect(res.rgb[0]).toBeGreaterThan(200);
  });

  it("falls through to bundled Pantone DB when only the name matches", () => {
    const res = resolveSpotSwatchColor("PANTONE 485 C");
    expect(res.source).toBe("pantone");
    expect(res.pantone_name).toBe("PANTONE 485 C");
    expect(res.lab).toBeDefined();
    expect(res.cmyk).toBeDefined();
  });

  it("normalises name variants when looking up Pantone DB", () => {
    const a = resolveSpotSwatchColor("Pantone 485C");
    const b = resolveSpotSwatchColor("PANTONE 485 C");
    expect(a.source).toBe("pantone");
    expect(a.pantone_name).toBe("PANTONE 485 C");
    expect(a.rgb).toEqual(b.rgb);
  });

  it("falls through to curated map for role-named spots", () => {
    const res = resolveSpotSwatchColor("Dieline");
    expect(res.source).toBe("curated");
    expect(res.rgb).toEqual([148, 0, 211]);
  });

  it("falls through to hash for unknown names", () => {
    const res = resolveSpotSwatchColor("AcmeBrandPinkV2");
    expect(res.source).toBe("hash");
    expect(res.rgb).toEqual(hashHueRgb("AcmeBrandPinkV2"));
  });

  it("hash output is deterministic for the same input", () => {
    const a = resolveSpotSwatchColor("MysterySpot");
    const b = resolveSpotSwatchColor("MysterySpot");
    expect(a.rgb).toEqual(b.rgb);
  });

  it("named PMS samples produce intent-accurate hues", () => {
    const r185 = resolveSpotSwatchColor("PANTONE 185 C");
    const r485 = resolveSpotSwatchColor("PANTONE 485 C");
    const reflex = resolveSpotSwatchColor("PANTONE Reflex Blue C");

    // Both 185 and 485 are reds; both should be R-dominant.
    expect(r185.rgb[0]).toBeGreaterThan(r185.rgb[1]);
    expect(r185.rgb[0]).toBeGreaterThan(r185.rgb[2]);
    expect(r485.rgb[0]).toBeGreaterThan(r485.rgb[1]);
    expect(r485.rgb[0]).toBeGreaterThan(r485.rgb[2]);

    // Reflex Blue is a deep cobalt; B should dominate strongly.
    expect(reflex.rgb[2]).toBeGreaterThan(reflex.rgb[0]);
    expect(reflex.rgb[2]).toBeGreaterThan(reflex.rgb[1]);

    // Sources should all be "pantone".
    expect(r185.source).toBe("pantone");
    expect(r485.source).toBe("pantone");
    expect(reflex.source).toBe("pantone");
  });

  it("host override beats codex which beats Pantone DB", () => {
    const out = resolveSpotSwatchColor("PANTONE 185 C", {
      hostOverride: { rgb: [1, 2, 3] },
      codex: { lab: [10, 20, 30] },
    });
    expect(out.source).toBe("host");
    expect(out.rgb).toEqual([1, 2, 3]);
  });

  it("codex beats Pantone DB when host override absent", () => {
    const out = resolveSpotSwatchColor("PANTONE 185 C", {
      codex: { rgb: [42, 42, 42] },
    });
    expect(out.source).toBe("codex");
    expect(out.rgb).toEqual([42, 42, 42]);
  });
});
