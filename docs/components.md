---
title: "Component reference"
description: "Per-component props, slots, and usage for every React component the package exports — page canvas, navigator, separations, layers, annotations, mobile chrome."
group: "Reference"
order: 5
---

# Component reference

Every component is imported from `@printwithsynergy/loupe-pdf/components`
and reads its data through the contexts described in
[architecture.md](./architecture.md). Required `ViewerServices` fields are
called out per component.

- [Drop-in demo](#drop-in-demo)
- [Page rendering](#page-rendering)
- [Print-production overlays](#print-production-overlays)
- [Sampling tools](#sampling-tools)
- [Layer & separation modes](#layer--separation-modes)
- [Annotations](#annotations)
- [Mobile chrome](#mobile-chrome)

## Drop-in demo

### `LoupePDFDemo`

Complete interactive demo — file upload, URL paste, drag-and-drop,
client-side PDF validation, sidebar controls, theming, and optional
fullscreen mode. Zero boilerplate: provide config + branding and you're
done.

```tsx
import { LoupePDFDemo } from "@printwithsynergy/loupe-pdf/components";

export function DemoPage() {
  return <LoupePDFDemo brand="MyApp" brandLogoUrl="/logo.svg" />;
}
```

#### Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `brand` | `string` | `"LoupePDF"` | Label in the top bar. |
| `brandLogoUrl` | `string` | _(none)_ | Logo image URL. |
| `tokens` | `Partial<ThemeTokens>` | `darkThemeTokens` | Merged onto the dark palette. |
| `maxFileSize` | `number` | `50 * 1024 * 1024` (50 MB) | Max upload size in bytes. |
| `services` | `ViewerServices` | `defaultUnwiredServices` | Optional wired services for hosts with a backend. |
| `initialZoom` | `number` | `80` | Starting zoom percentage. |
| `fullscreen` | `boolean` | `false` | Fixed-position full-viewport mode. |
| `initialPdfUrl` | `string` | _(none)_ | Pre-loaded PDF URL (e.g. from [share-link params](./share-links.md)). |
| `initialPage` | `number` | `1` | Starting page (1-indexed). |
| `footer` | `ReactNode` | _(none)_ | Extra content in the footer bar. |
| `className` | `string` | _(none)_ | Class on the outermost div. |
| `tools` | `ReadonlyArray<LoupePDFViewerTool>` | all | Subset of tools to show. |
| `mode` | `"scroll" \| "single"` | `"scroll"` | Page mode. |

#### Built-in features

- **File upload** — opens a native file picker (`application/pdf`).
- **URL paste** — form input validates via `validatePdfUrl()`.
- **Drag-and-drop** — drop anywhere on the component.
- **Validation** — checks PDF magic bytes (`%PDF-`), MIME type, and
  size. See [validation.md](./validation.md).
- **Sidebar** — zoom slider, tool toggles, layer panel.
- **Fullscreen** — `fullscreen` prop renders with `position: fixed; inset: 0`.
  Combine with [shareable links](./share-links.md) for fullscreen share URLs.
- **Blob lifecycle** — created blob URLs are revoked on PDF change and
  on unmount.

## Page rendering

### `PageCanvas`

The main page tile. Renders the page image from `services.pageImages`, draws
bounding boxes for every `OverlayItem`, and fires `onItemClick` when one is
clicked. Optional `cropToTrim` clips the canvas to the page's trim box
(falls back to bleed, then crop).

```tsx
<PageCanvas
  jobId="demo"
  page={page}                  // PageInfo
  zoom={1}                     // multiplier; 1.0 = 100%
  items={overlayItems}         // readonly OverlayItem[]
  selectedItem={selected}      // OverlayItem | null
  onItemClick={setSelected}
  onZoomChange={(z) => setZoom(z * 100)}
  onPageChange={(delta) => setCurrentPage((p) => p + delta)}
  tileDpi={150}
  tileCdnBase={null}
  cropToTrim={false}
/>
```

Service deps: `pageImages.getPageImageUrl`.

### `PageNavigator`

Vertical or horizontal thumbnail strip with per-page overlay-item badges.
`items` accepts the same `OverlayItem[]` you pass to `PageCanvas`; the
navigator counts `tier === "error"` and `tier === "warning"` per page and
draws the appropriate badge.

```tsx
<PageNavigator
  pages={pages}                // PageInfo[]
  currentPage={currentPage}
  items={overlayItems}
  onPageChange={setCurrentPage}
  horizontal={false}           // true → strip, false → vertical sidebar
/>
```

Service deps: `pageImages.getPageImageUrl` (rendered at `THUMBNAIL_DPI = 72`).

### `ZoomControls`

`+` / `−` buttons plus a percentage select. `zoom` is a percentage; the
steps are `[25, 50, 75, 100, 125, 150, 200, 300, 400]`.

```tsx
<ZoomControls
  zoom={zoom}                  // number, percent
  onZoomChange={setZoom}
  compact={false}              // smaller buttons, no border
  dark={false}                 // light text on dark bg
/>
```

## Print-production overlays

### `BoxOverlay`

Trim, Bleed, and Crop box outlines with a clickable info icon per box that
reveals the dimensions in mm + inches. Pass an optional `dieline` payload
(`DielineResult`) to also drop a per-region info chip at the centroid of
each artwork cut area.

```tsx
<BoxOverlay
  page={page}
  canvasWidth={renderedWidth}
  canvasHeight={renderedHeight}
  dieline={dielineResult}      // optional DielineResult | null
/>
```

### `DielineOverlay`

Standalone dieline-region chips. Renders independently of `BoxOverlay` so
users can see dieline sizes without enabling the trim/bleed boxes UI.

```tsx
<DielineOverlay
  page={page}
  canvasWidth={renderedWidth}
  canvasHeight={renderedHeight}
  dieline={dielineResult}
/>
```

## Sampling tools

### `ColorPickerTool`

Click anywhere on the page to read the rendered RGB + hex + TAC at that
PDF point. Calls `services.colorSample.sampleAt`. Returns `null` on
failure; the tool simply displays nothing rather than throwing.

```tsx
<ColorPickerTool
  jobId="demo"
  pageNum={1}
  pageWidthPts={page.width_pts}
  pageHeightPts={page.height_pts}
  canvasWidth={renderedWidth}
  canvasHeight={renderedHeight}
/>
```

Service deps: `colorSample.sampleAt`.

### `DensitometerTool`

Same shape as `ColorPickerTool`, but reads CMYK + spot-channel percentages
and Total Area Coverage via `services.densitometer.sampleAt`. Optional
`tacLimit` (defaults to `300`).

```tsx
<DensitometerTool
  jobId="demo"
  pageNum={1}
  pageWidthPts={page.width_pts}
  pageHeightPts={page.height_pts}
  canvasWidth={renderedWidth}
  canvasHeight={renderedHeight}
  tacLimit={300}
/>
```

Service deps: `densitometer.sampleAt`. See
[services.md](./services.md#densitometer) for the error-message contract.

### `MeasureTool`

Click-and-drag a ruler. Reports the distance in PDF points and through each
unit you supply (defaults to `[mm, in, pt]`).

```tsx
<MeasureTool
  pageWidthPts={page.width_pts}
  pageHeightPts={page.height_pts}
  canvasWidth={renderedWidth}
  canvasHeight={renderedHeight}
  units={defaultMeasurementUnits}
/>
```

See [measurement-units.md](./measurement-units.md) for the unit Protocol
and built-ins.

### `TACHeatmapOverlay`

An SVG hover layer over the page tile that places a hit rectangle at each
text run and shows its mean TAC on hover. Reads both an image URL and the
per-run list from `services.tacHeatmap`.

```tsx
<TACHeatmapOverlay
  jobId="demo"
  pageNum={1}
  width={renderedWidth}
  height={renderedHeight}
  pageWidthPts={page.width_pts}
  pageHeightPts={page.height_pts}
  opacity={0.5}
  dpi={150}
  tacLimit={300}
/>
```

Service deps: `tacHeatmap.getHeatmapImageUrl`, `tacHeatmap.listRuns`.

## Layer & separation modes

### `LayerCanvas`

Instant layer toggling via per-OCG isolated tiles. The host renders one
PNG per layer with a transparent background; the browser composites the
active subset locally with `source-over` blending. Toggling a layer is a
redraw, not a network round-trip. The first paint of an unseen layer
takes 1–3 s (engine + cache write); subsequent toggles hit the cache
and complete in well under 100 ms.

```tsx
<LayerCanvas
  jobId="demo"
  pageNum={1}
  enabledLayers={enabled}      // Set<number> of OCG indices
  allLayers={allOcgIndices}    // number[] in drawing order
  width={renderedWidth}
  height={renderedHeight}
  dpi={DEFAULT_DPI}
/>
```

Service deps: `layers.getLayerImageUrl`.

### `LayerPanel`

Companion UI: a checklist of OCGs with toggle / show-all / hide-all
controls. Pulls the OCG list from `services.layers.listLayers`.

```tsx
<LayerPanel
  jobId="demo"
  enabledLayers={enabled}
  onToggleLayer={(idx) => /* … */}
  onSetAllLayers={(on) => /* … */}
/>
```

Service deps: `layers.listLayers`.

### `SeparationCanvas`

Same instant-toggle pattern, but per ink channel (Cyan, Magenta, Yellow,
Black, plus any spot inks). Uses subtractive multiply blending against a
white background. Spot inks get a deterministic HSL hue derived from the
channel name when no engine-provided RGB is available.

```tsx
<SeparationCanvas
  jobId="demo"
  pageNum={1}
  enabledChannels={enabledChannels}   // Set<string>
  allChannels={["Cyan", "Magenta", "Yellow", "Black", "Pantone 185 C"]}
  width={renderedWidth}
  height={renderedHeight}
  dpi={DEFAULT_DPI}
/>
```

Service deps: `separations.getChannelImageUrl`.

## Annotations

The annotation suite needs the optional `fabric@^6` peer dep installed in
your host app, and respects `ViewerHostContext.readOnly` to suppress
saves in share-link / public-token modes.

### `AnnotationToolbar`

A tool-and-color toolbar. Supported tools are `pointer`, `pen`, `arrow`,
`rectangle`, `ellipse`, `text`, `highlight`. The host owns the active-tool
state and undo/redo stack.

```tsx
<AnnotationToolbar
  activeTool={tool}             // AnnotationTool
  onToolChange={setTool}
  strokeColor={color}
  onStrokeColorChange={setColor}
  onUndo={undo}
  onRedo={redo}
  canUndo={canUndo}
  canRedo={canRedo}
  saving={saving}
/>
```

### `AnnotationCanvas`

Fabric.js canvas overlay. Autosaves the current page's drawing through
`services.annotations.saveForPage`. Skips saves when
`ViewerHostContext.readOnly` is true. Calls `onSavingChange` and
`onHistoryChange` so a parent toolbar can show a saving spinner and
disable undo/redo correctly.

```tsx
<AnnotationCanvas
  jobId="demo"
  pageNum={1}
  width={renderedWidth}
  height={renderedHeight}
  activeTool={tool}
  strokeColor={color}
  onSavingChange={setSaving}
  onHistoryChange={(canUndo, canRedo) => /* … */}
/>
```

Service deps: `annotations.getForPage`, `annotations.saveForPage`. Renders
nothing when `services.annotations` is unwired (see
[fallback.md](./fallback.md)).

### `AnnotationThread`

Sidebar list of annotations across every page, loaded from
`services.annotations.list`. Calls `onJumpToPage` when the user clicks a
row.

```tsx
<AnnotationThread
  jobId="demo"
  currentUserEmail="ops@example.com"
  onJumpToPage={setCurrentPage}
/>
```

Service deps: `annotations.list`, `annotations.remove`. Renders nothing
when `services.annotations` is unwired (see [fallback.md](./fallback.md)).

## Mobile chrome

### `MobileDrawer`

A slide-out config drawer for phones, mirroring the desktop sidebar.
Driven by a `ViewerConfig` (`enable_*` capability flags + plan-gate
booleans), with section toggles for separation / layer / annotation /
heatmap / box-overlay modes and external links to the HTML report and
PDF download.

`ViewerConfig` is a fairly large shape — see `types/index.ts` for the full
field list, and `DEFAULT_VIEWER_CONFIG` for sensible defaults.

```tsx
<MobileDrawer
  isOpen={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  config={config}
  viewerMode={viewerMode}        // "normal" | "separation" | "layers" | …
  onToggleMode={setViewerMode}
  measureMode={measureMode}      // "none" | "color_picker" | "densitometer" | "ruler"
  onToggleMeasure={setMeasureMode}
  showTacHeatmap={tac}
  onToggleTacHeatmap={() => setTac((v) => !v)}
  showBoxOverlay={boxes}
  onToggleBoxOverlay={() => setBoxes((v) => !v)}
  fileName="design.pdf"
  findingSummary={{ error: 0, warning: 2, advisory: 5 }}
  zoom={zoom}
  onZoomChange={setZoom}
  jobId="demo"
  onExpandSheet={() => sheetRef.current?.expand()}
  onOpenShare={() => /* … */}
/>
```

Service deps: `reports.getHtmlReportUrl`, `reports.getPdfDownloadUrl`. The
"View HTML Report" and "Download PDF" items are dropped when
`services.reports` is unwired even if the matching `config.enable_*` flag
is on (see [fallback.md](./fallback.md)).

### `MobileBottomSheet`

A drag-snap bottom sheet with `collapsed`, `half`, and `full` positions.
Auto-sizes the `half` position to its content. Accepts `summary` (always
visible) and `children` (revealed at `half` / `full`). Snap can be
controlled or uncontrolled.

```tsx
<MobileBottomSheet
  summary={<FindingSummaryRow />}
  snap={snap}
  onSnapChange={setSnap}
>
  <FindingDetailList />
</MobileBottomSheet>
```
