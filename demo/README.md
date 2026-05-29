# LensPDF demo

A small Vite app with two top-level views:

1. **Findings showcase** (default) — mounts the full `LensPDFDemo` against a
   sample PDF and a curated set of `OverlayItem`s that exercise every new
   finding behavior shipped in the 0.4.0-beta.14+ line: zoom-to-fit on select,
   multi-region highlighting, cross-page jumps, and the loc-less
   annotation-only contract.
2. **Hide-on-unwired smoke** — the original PR #3 / #4 smoke test: flips
   between empty / pdf.js fallback / fully-mocked host contexts to verify
   every component hides silently when its services aren't wired.

## Run

```sh
cd demo
pnpm install      # or npm install
pnpm dev          # or npm run dev
# open http://localhost:5173
```

The demo declares the parent package as `"file:.."` so any local change to the
library is picked up after a rebuild (`pnpm build` from the repo root) — no
need to publish or symlink.

## Findings showcase

The showcase mounts `<LensPDFDemo>` with `initialShowFindings` on, the sample
PDF served from `public/sample.pdf`, and four curated findings:

| Finding | Page | Shape | What to click for |
| --- | --- | --- | --- |
| `bbox1` — Low-res raster image | 1 | single `bbox` | zoom-to-fit clamps to the substrate's max (~400%), framing tightly. |
| `multi1` — Duplicate image (4 instances) | 1 | `regions` array (no `bbox`) | every region highlighted; the framed view is the union of all four. |
| `page3` — Barcode quiet zone | 3 | cross-page `bbox` | viewer navigates to page 3, waits for it to render, then frames. |
| `locless` — PDF version advisory | 1 | neither `bbox` nor `regions` | shown in the sidebar; selecting navigates but draws nothing on the canvas (annotation-only). |

Click the rows in the built-in Findings sidebar (or the F-number badges on
the page) to drive selection — the zoom slider should track the actual
framed scale on every selection.

## Hide-on-unwired smoke modes

| Mode | What it wires | What you should see |
| --- | --- | --- |
| **Empty host** | No `ViewerServicesContext.Provider` at all. | Blank stage, no panels, no menu items. With debug on, one `console.info` per hidden component. |
| **pdf.js fallback** | `pdfFallback: createPdfJsFallback({ pdfUrl })`. | PageCanvas, LayerPanel, ColorPicker work from the PDF directly. Separations / densitometer / heatmap stay hidden because pdf.js can't reconstruct ink channels. |
| **Full mock** | Every service stubbed with fake data. | Every wired-with-data path renders. Verifies that wired-but-empty (`mockServices.tacHeatmap.listRuns` returning `[]`) still shows empty states — distinct from "unwired = hide". |

## Smoke checks

- [ ] Empty + debug on → no rendered surfaces; console shows one log per component.
- [ ] Empty + debug off → no rendered surfaces; console quiet.
- [ ] Fallback (no URL) → empty stage; one log only if debug.
- [ ] Fallback + URL → page rasters, layers list (or empty state if PDF has no OCGs).
- [ ] Full mock → all panels rendered; ColorPicker click returns the fixed mock colour.

## Security note

The PDF URL field hands whatever you type to the user's browser. Don't paste
private URLs into a hosted demo — sign / scope / expire them upstream the same
way you would any production download link. See
[`../docs/fallback.md#security`](../docs/fallback.md) for the full guidance.
