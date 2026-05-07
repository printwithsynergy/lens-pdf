import { describe, expect, it } from "vitest";

import { adaptCodexDocumentForViewer } from "./codexAdapter";

describe("adaptCodexDocumentForViewer", () => {
  it("maps page and layer payloads from codex document", () => {
    const adapted = adaptCodexDocumentForViewer({
      schema_version: "1.0.0",
      pages: [
        {
          page_num: 1,
          rotation: 90,
          boxes: {
            media: { x0: 0, y0: 0, x1: 595, y1: 842 },
            crop: { x0: 0, y0: 0, x1: 590, y1: 830 },
          },
        },
      ],
      ocgs: [{ ocg_id: "10R", name: "Artwork", default_on: true }],
    });

    expect(adapted.codex_schema_version).toBe("1.0.0");
    expect(adapted.page_count).toBe(1);
    expect(adapted.pages[0]?.width_pts).toBe(595);
    expect(adapted.pages[0]?.rotation).toBe(90);
    expect(adapted.layers[0]).toMatchObject({
      name: "Artwork",
      ocg_index: 0,
      ocg_id: "10R",
      default_on: true,
      kind: "ocg",
    });
    expect(adapted.spot_colorants).toEqual([]);
  });

  it("extracts spot colorants from color_spaces, deduplicates by name, and skips process-named entries", () => {
    const adapted = adaptCodexDocumentForViewer({
      schema_version: "1.0.0",
      pages: [],
      ocgs: [],
      color_spaces: [
        {
          id: "cs-185",
          family: "Separation",
          canonical: {},
          spot_colorants: [
            {
              name: "PANTONE 185 C",
              lab: [49.41, 77, 49],
              cmyk: [0, 81.7, 69.2, 12.2],
            },
          ],
        },
        {
          id: "cs-cyan",
          family: "Separation",
          canonical: {},
          // Process inks declared as Separation are valid PDF — but
          // the viewer maps them to canonical CMYK primaries, so we
          // shouldn't surface them as `spot_colorants` here.
          spot_colorants: [{ name: "Cyan" }],
        },
        {
          id: "cs-cut",
          family: "DeviceN",
          canonical: {},
          spot_colorants: [
            // Repeat: should merge with cs-185's entry, with codex
            // values taking precedence on first-write semantics.
            { name: "PANTONE 185 C", pantone_name: "PANTONE 185 C" },
            { name: "Cut", rgb: [255, 0, 200] },
          ],
        },
      ],
    });

    expect(adapted.spot_colorants).toHaveLength(2);
    const pms = adapted.spot_colorants.find(
      (s) => s.name === "PANTONE 185 C",
    );
    expect(pms?.lab).toEqual([49.41, 77, 49]);
    expect(pms?.cmyk).toEqual([0, 81.7, 69.2, 12.2]);
    expect(pms?.pantone_name).toBe("PANTONE 185 C");
    const cut = adapted.spot_colorants.find((s) => s.name === "Cut");
    expect(cut?.rgb).toEqual([255, 0, 200]);
  });

  it("normalises 0-1 RGB triplets to 0-255", () => {
    const adapted = adaptCodexDocumentForViewer({
      schema_version: "1.0.0",
      pages: [],
      ocgs: [],
      color_spaces: [
        {
          id: "cs-soft",
          family: "Separation",
          canonical: {},
          spot_colorants: [{ name: "Brand", rgb: [1, 0.5, 0] }],
        },
      ],
    });
    expect(adapted.spot_colorants[0]?.rgb).toEqual([255, 128, 0]);
  });
});
