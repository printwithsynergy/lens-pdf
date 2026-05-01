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
  tokens. Every field has a no-op default, so you only implement what your
  host actually has.

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
| `@printwithsynergy/loupe-pdf/components` | Every React component (`PageCanvas`, `ZoomControls`, `PageNavigator`, `LayerCanvas`, `LayerPanel`, `SeparationCanvas`, `TACHeatmapOverlay`, `BoxOverlay`, `DielineOverlay`, `MeasureTool`, `ColorPickerTool`, `DensitometerTool`, `AnnotationCanvas`, `AnnotationThread`, `AnnotationToolbar`, `MobileDrawer`, `MobileBottomSheet`). |
| `@printwithsynergy/loupe-pdf/plugin` | Plugin protocol types (`OverlayPlugin`, `PanelPlugin`, `ToolbarPlugin`, `AnnotationSourceProvider`, `DialogPlugin`, `MeasurementUnit`, `OverlayItem`), `ViewerContext`, `ViewerServices`, the registry (`register`, `unregister`, `getPluginsForSlot`, `listAll`), and no-op defaults (`noopI18n`, `noopTelemetry`, `defaultThemeTokens`). |
| `@printwithsynergy/loupe-pdf/host` | `ViewerHostContext` + `ViewerServicesContext` and their `useViewerHost` / `useViewerServices` hooks. |
| `@printwithsynergy/loupe-pdf/units` | Built-in `MeasurementUnit`s (`mmUnit`, `inchUnit`, `pointUnit`, `picaUnit`, `agateUnit`) plus the `defaultMeasurementUnits` and `allMeasurementUnits` arrays. |
| `@printwithsynergy/loupe-pdf/types` | Shared type primitives (`PageInfo`, `PageBox`, `LayerInfo`, `ColorSample`, `DensitometerSample`, `DielineResult`, `ViewerConfig`, `DEFAULT_VIEWER_CONFIG`, `SEVERITY_COLORS`, `DEFAULT_DPI`, `THUMBNAIL_DPI`). |
| `@printwithsynergy/loupe-pdf` | Convenience barrel re-exporting `/plugin`, every component, and every unit. |

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
