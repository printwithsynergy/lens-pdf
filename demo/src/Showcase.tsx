/**
 * Findings showcase — drives `LensPDFDemo` with a sample PDF and a
 * curated set of `OverlayItem`s that exercise every new viewer
 * behavior shipped in the 0.4.0-beta.14+ line:
 *
 *  - **bbox1** — single small bbox → on select, the viewer zooms in to
 *    frame it (clamped to maxScale 4×).
 *  - **multi1** — multi-region finding (`regions` array, no `bbox`) →
 *    every rect is highlighted, and the union is framed as a group.
 *  - **page3** — cross-page bbox → the viewer navigates to the new
 *    page, waits for it to render, then frames the finding.
 *  - **locless** — page-level / loc-less finding → surfaced in the
 *    sidebar and navigates to the page, but **never** draws on the
 *    canvas (annotation-only contract).
 *
 * Click each in the built-in Findings sidebar (or the F-number badge
 * on the page) to see the framing animate. The overlays start visible
 * via `initialShowFindings`.
 */

import { useState } from "react";
import { LensPDFDemo } from "@printwithsynergy/lens-pdf";
import type { OverlayItem } from "@printwithsynergy/lens-pdf/plugin";

const FINDINGS: OverlayItem[] = [
  {
    id: "bbox1",
    page: 1,
    tier: "error",
    code: "image_lowres",
    label: "Low-res raster image",
    description:
      "Image is 96 dpi at its placed size; expected ≥ 300 dpi for print.",
    bbox: [60, 90, 220, 200],
  },
  {
    id: "multi1",
    page: 1,
    tier: "warning",
    code: "duplicate_lowres",
    label: "Duplicate low-res image (4 instances)",
    description:
      "Same 96 dpi image appears at four positions on the page. Selecting frames the union of all four regions.",
    regions: [
      [60, 90, 160, 170],
      [420, 90, 520, 170],
      [60, 600, 160, 680],
      [420, 600, 520, 680],
    ],
  },
  {
    id: "page3",
    page: 3,
    tier: "advisory",
    code: "barcode_quiet_zone",
    label: "Barcode quiet zone narrow (page 3)",
    description:
      "EAN-13 left quiet zone is 8pt; recommended ≥ 11pt. Selecting jumps to page 3, then frames.",
    bbox: [80, 480, 240, 580],
  },
  {
    id: "locless",
    page: 1,
    tier: "info",
    code: "document_pdf_version",
    label: "PDF version older than 1.7 — annotation only",
    description:
      "Document is PDF 1.4. Many preflight rules assume ≥ 1.7. Loc-less: surfaced in the sidebar, never highlighted on the canvas.",
  },
];

export function Showcase() {
  const [selected, setSelected] = useState<OverlayItem | null>(null);
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <LensPDFDemo
        brand="LensPDF showcase"
        initialPdfUrl="/sample.pdf"
        showUploadHeader={false}
        initialZoom={60}
        initialShowFindings
        items={FINDINGS}
        selectedItem={selected}
        onItemSelect={setSelected}
      />
    </div>
  );
}
