import { describe, expect, it } from "vitest";

import { createBrowserViewerServices } from "./index";

const minimalPage = {
  page_num: 1,
  rotation: 0,
  boxes: { media: { x0: 0, y0: 0, x1: 612, y1: 792 } },
};

describe("createBrowserViewerServices codex contract", () => {
  it("rejects construction when codex metadata is missing", () => {
    expect(() =>
      createBrowserViewerServices({
        pdfUrl: "https://example.com/test.pdf",
        // Intentional runtime contract violation for strict codex mode.
        codexDocument: null as unknown as Record<string, unknown>,
      }),
    ).toThrow(/codexDocument is required/i);
  });

  it("surfaces layer inventory from codex payload", async () => {
    const services = createBrowserViewerServices({
      pdfUrl: "https://example.com/test.pdf",
      codexDocument: {
        schema_version: "1.0.0",
        pages: [minimalPage],
        ocgs: [{ ocg_id: "10R", name: "Artwork", default_on: true }],
      },
    });

    const layers = await services.layers.listLayers();
    expect(layers).toEqual([
      {
        name: "Artwork",
        ocg_index: 0,
        default_on: true,
      },
    ]);
  });
});

describe("createBrowserViewerServices spot ink resolution", () => {
  it("returns canonical CMYK primaries for the four process inks", async () => {
    const services = createBrowserViewerServices({
      pdfUrl: "https://example.com/test.pdf",
      codexDocument: { schema_version: "1.0.0", pages: [minimalPage], ocgs: [] },
    });

    const inks = await services.getInks();
    const cyan = inks.find((ink) => ink.name === "Cyan");
    const magenta = inks.find((ink) => ink.name === "Magenta");
    expect(cyan?.source).toBe("process");
    expect(magenta?.source).toBe("process");
    expect(cyan?.altRgb).toEqual([0, 174, 239]);
    expect(magenta?.altRgb).toEqual([236, 0, 140]);
  });

  it("resolves a known PANTONE name from codex spot_colorants via the bundled DB", async () => {
    const services = createBrowserViewerServices({
      pdfUrl: "https://example.com/test.pdf",
      codexDocument: {
        schema_version: "1.0.0",
        pages: [minimalPage],
        ocgs: [],
        color_spaces: [
          {
            id: "cs-185",
            family: "Separation",
            canonical: {},
            spot_colorants: [{ name: "PANTONE 185 C" }],
          },
        ],
      },
    });

    const inks = await services.getInks();
    const spot = inks.find((ink) => ink.name === "PANTONE 185 C");
    expect(spot).toBeDefined();
    expect(spot?.type).toBe("spot");
    expect(spot?.source).toBe("pantone");
    expect(spot?.pantone_name).toBe("PANTONE 185 C");
    // PANTONE 185 C is a warm red — R should clearly dominate.
    expect(spot?.altRgb[0]).toBeGreaterThan(200);
    expect(spot?.altRgb[1]).toBeLessThan(80);
    expect(spot?.altRgb[2]).toBeLessThan(80);
  });

  it("uses codex-extracted Lab when codex carries colour intent directly", async () => {
    const services = createBrowserViewerServices({
      pdfUrl: "https://example.com/test.pdf",
      codexDocument: {
        schema_version: "1.0.0",
        pages: [minimalPage],
        ocgs: [],
        color_spaces: [
          {
            id: "cs-brand",
            family: "Separation",
            canonical: {},
            spot_colorants: [
              { name: "Acme Brand Pink", lab: [60, 70, -10] },
            ],
          },
        ],
      },
    });

    const inks = await services.getInks();
    const spot = inks.find((ink) => ink.name === "Acme Brand Pink");
    expect(spot?.source).toBe("codex");
    expect(spot?.lab).toEqual([60, 70, -10]);
  });

  it("respects host spotOverrides above codex and Pantone DB", async () => {
    const services = createBrowserViewerServices({
      pdfUrl: "https://example.com/test.pdf",
      codexDocument: {
        schema_version: "1.0.0",
        pages: [minimalPage],
        ocgs: [],
        color_spaces: [
          {
            id: "cs-185",
            family: "Separation",
            canonical: {},
            spot_colorants: [
              { name: "PANTONE 185 C", lab: [50, 70, 50] },
            ],
          },
        ],
      },
      spotOverrides: {
        "PANTONE 185 C": { rgb: [12, 34, 56] },
      },
    });

    const inks = await services.getInks();
    const spot = inks.find((ink) => ink.name === "PANTONE 185 C");
    expect(spot?.source).toBe("host");
    expect(spot?.altRgb).toEqual([12, 34, 56]);
  });

  it("flags unknown spot names with source=hash so UIs can mark them approximate", async () => {
    const services = createBrowserViewerServices({
      pdfUrl: "https://example.com/test.pdf",
      codexDocument: {
        schema_version: "1.0.0",
        pages: [minimalPage],
        ocgs: [],
        color_spaces: [
          {
            id: "cs-mystery",
            family: "Separation",
            canonical: {},
            spot_colorants: [{ name: "AcmeBrandPinkV2" }],
          },
        ],
      },
    });

    const inks = await services.getInks();
    const spot = inks.find((ink) => ink.name === "AcmeBrandPinkV2");
    expect(spot?.source).toBe("hash");
  });
});
