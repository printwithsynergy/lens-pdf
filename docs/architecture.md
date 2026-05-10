---
title: "Architecture"
description: "How the two host contexts and the slot-aware plugin registry fit together, plus the coordinate space the viewer uses for pages, items, and sampling tools."
group: "Getting started"
order: 2
---

# Architecture

LoupePDF deliberately knows nothing about your backend. Everything that
needs an API call goes through two React contexts your host application
provides, and a slot-aware plugin registry on top of that.

## The two contexts

- **`ViewerHostContext`** — `apiBase`, `jobApiBase`, `readOnly`. Read by
  components via `useViewerHost()`.
- **`ViewerServicesContext`** — a `ViewerServices` object whose fields
  cover page-image URLs, layers, separations, TAC heatmaps, color sampling,
  the densitometer, annotations, report links, telemetry, i18n, and theme
  tokens. Every field has a no-op default tagged as *unwired*; consuming
  components self-hide when their service is unwired (see
  [fallback.md](./fallback.md)) so you only implement what your host
  actually has and tools without backing data simply don't appear.

Components inside the viewer call `useViewerServices()` to reach your host
data. Plugins receive the same `ViewerServices` through a `ViewerContext`
argument to their `mount()` callback.

```
                       ┌──────────────────────────────────┐
   <App>                │ ViewerHostContext.Provider       │
     │                  │  apiBase, jobApiBase, readOnly   │
     ▼                  └──────────────────────────────────┘
   <ViewerHostContext>          ▼
   <ViewerServicesContext>      ┌──────────────────────────────────┐
        │                       │ ViewerServicesContext.Provider   │
        ▼                       │  pageImages, layers, separations,│
     core components            │  tacHeatmap, colorSample, …      │
     (PageCanvas, …)            └──────────────────────────────────┘
        │
        ▼
     plugin registry
        │   register(plugin)
        ▼
     getPluginsForSlot("overlay.canvas") → ReactNode[]
```

## Public entry points

Imports are organised by entry point so your bundler only pulls what you use.

| Entry point | Contents |
| --- | --- |
| `@printwithsynergy/loupe-pdf/components` | Every React component (`PageCanvas`, `ZoomControls`, `PageNavigator`, `LayerCanvas`, `LayerPanel`, `SeparationCanvas`, `TACHeatmapOverlay`, `BoxOverlay`, `DielineOverlay`, `MeasureTool`, `ColorPickerTool`, `DensitometerTool`, `AnnotationCanvas`, `AnnotationNotesPanel`, `AnnotationThread`, `AnnotationToolbar`, `MobileDrawer`, `MobileBottomSheet`, **`LoupePDFViewer`**, **`LoupePDFDemo`**) plus the shell-plugin helpers (`createDefaultShellPlugins`, `pluginsForPreset`, `pluginsForSlot`, `resolveShellPlugins`, `computeFeatureAvailability`) and types (`LoupePDFShellPlugin`, `LoupePDFShellSlot`, `LoupePDFShellPluginContext`, `LoupePDFFeatureAvailability`, `LoupePDFPresetKind`). |
| `@printwithsynergy/loupe-pdf/plugin` | Plugin protocol types (`OverlayPlugin`, `PanelPlugin`, `ToolbarPlugin`, `AnnotationSourceProvider`, `DialogPlugin`, `MeasurementUnit`, `OverlayItem`), `ViewerContext`, `ViewerServices`, the registry (`register`, `unregister`, `getPluginsForSlot`, `listAll`), and no-op defaults (`noopI18n`, `noopTelemetry`, `defaultThemeTokens`, **`darkThemeTokens`**). |
| `@printwithsynergy/loupe-pdf/host` | `ViewerHostContext` + `ViewerServicesContext` and their `useViewerHost` / `useViewerServices` hooks. **`defaultUnwiredServices`**, **`useLoupePDF()`**, **`LoupePDFProvider`**, **`useFallbackMode`**, **`isUnwired`**, **`markUnwired`**, **`createPdfJsFallback`**, **`validatePdfFile`** / **`validatePdfUrl`**, **`generateShareLink`** / **`parseShareParams`**. |
| `@printwithsynergy/loupe-pdf/browser` | Browser-only `ViewerServices` factory (`createBrowserViewerServices`, `BrowserViewerServices`, `BrowserViewerServicesOptions`), `defaultBrowserWorkerSrc`, `detectSpotInksFromPdfBytes`, `rgbToCmyk`, `useBrowserViewerServicesVersion`, `PROCESS_CHANNELS`, plus codex overlay helpers (`createCodexOverlayServices`, `extractInksFromColorWorld`, `extractLayersFromOcgs`). |
| `@printwithsynergy/loupe-pdf/fallback-pdfjs` | The pdf.js-backed `PdfFallbackAdapter` factory: `createPdfJsFallback`, `defaultPdfWorkerSrc`. |
| `@printwithsynergy/loupe-pdf/units` | Built-in `MeasurementUnit`s (`mmUnit`, `inchUnit`, `pointUnit`, `picaUnit`, `agateUnit`) plus the `defaultMeasurementUnits` and `allMeasurementUnits` arrays. |
| `@printwithsynergy/loupe-pdf/types` | Shared type primitives (`PageInfo`, `PageBox`, `LayerInfo`, `ColorSample`, `ColorSampleInk`, `DensitometerSample`, `DensitometerChannel`, `DielineResult`, `ViewerConfig`, `ViewerCapabilityKey`, `FindingsSourceMode`, `DEFAULT_VIEWER_CONFIG`, `SEVERITY_COLORS`, `DEFAULT_DPI`, `THUMBNAIL_DPI`, **`pageInfoFromDimensions()`**). |
| `@printwithsynergy/loupe-pdf` | Convenience barrel re-exporting `/plugin`, every component, every unit, plus the `/host` utilities, the drop-in `LoupePDF` and `LoupePDFDemo`, and the browser factory (`createBrowserViewerServices`, `defaultBrowserWorkerSrc`, `detectSpotInksFromPdfBytes`, `rgbToCmyk`, `useBrowserViewerServicesVersion`, `PROCESS_CHANNELS`). |

## What lives where

- Page-tile rendering, sampling tools, layer / separation modes, annotations,
  and mobile chrome are **components** — see
  [components.md](./components.md).
- The data-source surface those components depend on (URL builders, async
  fetchers, RGB samples, Fabric JSON storage) is **`ViewerServices`** — see
  [services.md](./services.md).
- Anything custom you bolt on (overlays, panels, toolbars, modal dialogs,
  annotation sources) is a **plugin** — see [plugins.md](./plugins.md).

## Coordinate space

LoupePDF uses PDF points (1 pt = 1/72 inch) as the canonical coordinate
space:

- `PageInfo.width_pts` / `height_pts` describe the page in PDF points.
- `PageInfo.media_box` / `crop_box` / `trim_box` / `bleed_box` are
  lower-left + upper-right corners in PDF points.
- `OverlayItem.bbox` is `[x0, y0, x1, y1]` in PDF points.
- Sampling services (`colorSample.sampleAt`, `densitometer.sampleAt`)
  receive `pdfX` / `pdfY` in PDF points with origin at the lower-left of
  the page — the components handle the canvas-pixel-to-PDF-point flip
  for you.
- The TAC heatmap is the one exception — its `listRuns` coordinates use a
  top-left origin to match poppler's `pdftotext -bbox` output. The overlay
  knows this and translates internally.
