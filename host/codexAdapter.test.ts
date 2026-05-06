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
      ocgs: [{ name: "Artwork", default_on: true }],
    });

    expect(adapted.codex_schema_version).toBe("1.0.0");
    expect(adapted.page_count).toBe(1);
    expect(adapted.pages[0]?.width_pts).toBe(595);
    expect(adapted.pages[0]?.rotation).toBe(90);
    expect(adapted.layers[0]).toMatchObject({
      name: "Artwork",
      ocg_index: 0,
      default_on: true,
      kind: "ocg",
    });
  });
});
