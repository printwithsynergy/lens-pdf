# LoupePDF demo

A small Vite app that mounts a handful of LoupePDF components against three host
contexts so you can verify the hide-on-unwired behaviour from PR #3 / #4 by hand.

## Run

```sh
cd demo
npm install
npm run dev
# open http://localhost:5173
```

The demo declares the parent package as `"file:.."` so any local change to the
library is picked up after a rebuild (`npm run build` from the repo root) — no
need to publish or symlink.

## Modes

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
