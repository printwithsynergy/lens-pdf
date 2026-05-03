---
title: "Wiring ViewerServices"
description: "Implement only the protocols your host supports — page images, layers, separations, TAC heatmaps, color sampling, densitometer, annotations, reports. Unwired services hide their consuming components automatically."
group: "Reference"
order: 3
---

# Wiring `ViewerServices`

Every field on `ViewerServices` is independent. Implement the ones your host
supports; the rest fall through to *unwired* no-op defaults exported from
`@printwithsynergy/loupe-pdf/plugin`. Consuming components detect the unwired
state and self-hide rather than rendering empty placeholders — see
[docs/fallback.md](./fallback.md) for the full capability-detection model,
the in-browser pdf.js fallback, and debug logging.

```ts
import type { ViewerServices } from "@printwithsynergy/loupe-pdf/plugin";
import {
  defaultThemeTokens,
  noopI18n,
  noopTelemetry,
} from "@printwithsynergy/loupe-pdf/plugin";

export const services: ViewerServices = {
  pageImages: {
    getPageImageUrl: ({ pageNum, dpi }) =>
      `/api/pdf/${pageNum}.png?dpi=${dpi}`,
  },

  layers: {
    getLayerImageUrl: ({ pageNum, layerIndex, dpi }) =>
      `/api/pdf/${pageNum}/layer/${layerIndex}.png?dpi=${dpi}`,
    listLayers: async () => [
      { name: "Background", ocg_index: 0, default_on: true },
      { name: "CutContour", ocg_index: 1, default_on: true },
    ],
  },

  separations: {
    getChannelImageUrl: ({ pageNum, channelName, dpi }) =>
      `/api/pdf/${pageNum}/channel/${encodeURIComponent(channelName)}.png?dpi=${dpi}`,
  },

  tacHeatmap: {
    getHeatmapImageUrl: ({ pageNum, dpi, tacLimit }) =>
      `/api/pdf/${pageNum}/tac.png?dpi=${dpi}&limit=${tacLimit}`,
    listRuns: async () => [],
  },

  colorSample: {
    sampleAt: async ({ pageNum, pdfX, pdfY }) => {
      const r = await fetch(`/api/pdf/${pageNum}/color?x=${pdfX}&y=${pdfY}`);
      return r.ok ? await r.json() : null;
    },
  },

  densitometer: {
    sampleAt: async (args) => {
      const r = await fetch(`/api/pdf/${args.pageNum}/density`, {
        method: "POST",
        body: JSON.stringify(args),
      });
      if (!r.ok) {
        if (r.status === 422) throw new Error("No separations available for this page.");
        throw new Error(`Sampling failed (${r.status})`);
      }
      return await r.json();
    },
  },

  annotations: {
    list: async () => [],
    getForPage: async () => null,
    saveForPage: async () => {},
    remove: async () => {},
  },

  reports: {
    getHtmlReportUrl: () => "/api/pdf/report.html",
    getPdfDownloadUrl: () => "/api/pdf/report.pdf",
  },

  telemetry: noopTelemetry,
  i18n: noopI18n,
  tokens: defaultThemeTokens,
};
```

## When you need each field

| Service | When you need it |
| --- | --- |
| `pageImages.getPageImageUrl` | Always. Returns the URL of the rendered page tile at a given DPI. |
| `layers.*` | Mounting `LayerCanvas` or `LayerPanel`. Provides per-OCG isolated tiles + the OCG list. |
| `separations.getChannelImageUrl` | Mounting `SeparationCanvas`. Returns one tile per ink channel with a transparent background — the canvas composites locally. |
| `tacHeatmap.*` | Mounting `TACHeatmapOverlay`. Provides a heatmap image plus per-text-run TAC readings for hover tooltips. |
| `colorSample.sampleAt` | `ColorPickerTool`. Returns RGB + hex + TAC at a PDF point, or `null` on failure. |
| `densitometer.sampleAt` | `DensitometerTool`. Returns ink-channel percentages + TAC. Throw `Error("No separations available for this page.")` for RGB-only PDFs — the tool surfaces the message verbatim. |
| `annotations.*` | `AnnotationCanvas`, `AnnotationThread`. Per-page upsert + global list + delete. |
| `reports.*` | Report-export menu items in `MobileDrawer` or your own toolbar. |
| `telemetry`, `i18n`, `tokens` | Always present; defaults are safe. Override to plug into your analytics, translation table, or brand palette. |

## Notes on each service

### `pageImages`

URL builders are **synchronous**. If your host needs async signing,
pre-resolve into a redirect proxy or blob URL upstream. Returning a Promise
here would force every `<img src={...}>` consumer through `useEffect` +
state, which doesn't fit the rendering pattern.

The viewer caches results internally — your service should not implement
its own cache.

### `layers`

`getLayerImageUrl` returns one PNG per OCG with a transparent background
(typically rendered via Ghostscript's `pngalpha` device with every other
OCG hidden). The browser composites the active subset locally with
`source-over` blending, so toggling a layer is just a redraw — no API
round-trip after the first warm-up.

### `separations`

Same instant-toggle pattern, but per ink channel. Channel name is a
process ink (`"Cyan"`, `"Magenta"`, `"Yellow"`, `"Black"`) or a spot ink
(`"Pantone Reflex Blue C"`, etc.). Your service is responsible for
percent-encoding the channel name in whatever URL it returns.

### `tacHeatmap`

`getHeatmapImageUrl` returns a per-pixel RGBA tint over the page.
`listRuns` returns per-text-run TAC readings used for the hover-tooltip
layer. Run coordinates use a **top-left origin** to match poppler's
`pdftotext -bbox` output (the rest of the API uses lower-left).

### `colorSample`

The tool deliberately swallows errors — return `null` instead of throwing
so a flaky network doesn't pop a tooltip with a confusing fallback color.

### `densitometer`

Distinct error messages your `sampleAt` can throw to drive the tool's UI:

- `"No separations available for this page."` — engine 422 (RGB-only
  document, no CMYK to split). Surfaces as the friendly amber banner.
- `"Sampling failed (NNN)"` — engine non-2xx other than 422.
- `"Network error"` — fetch rejected.

The tool reads `Error.message` verbatim — keep messages user-facing.

### `annotations`

Four concrete methods that match the actual call sites:

- `list()` — sidebar thread (every page, every author).
- `getForPage(pageNum)` — canvas init for the active author.
- `saveForPage(pageNum, fabricJson)` — canvas autosave (best-effort; the
  canvas swallows network errors so the user can keep drawing).
- `remove(id)` — sidebar thread.

`fabricJson` is an opaque `unknown` — only the host and `AnnotationCanvas`
interpret it (it's the serialised Fabric.js canvas snapshot).

### `reports`

Both URL builders are synchronous. Hosts without report exports leave the
no-op defaults — the consuming menu items (currently `MobileDrawer`'s
"Share &amp; Export" section) drop the report links entirely rather than
rendering inert hrefs.

### `telemetry`, `i18n`, `tokens`

See [theming.md](./theming.md).
