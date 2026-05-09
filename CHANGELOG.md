# Changelog

All notable changes to LoupePDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0-beta.52] — 2026-05-09

### Changed
- **Pre-Codex runtime restore** — package contents are restored to the
  pdf.js fallback/runtime state immediately before the Codex-backed workflow.

### Fixed
- **Dependency audit cleanup** — `fabric` peer/dev dependency ranges now
  target 7.3.1, clearing the vulnerabilities reported by npm audit.

## [0.3.0-beta.30] — 2026-05-05

### Fixed
- **Move / Pan isolation** — selecting `Move / Pan` now forces annotation
  mode back to pointer so it never leaves pen/drawing armed while users
  are navigating.
- **Sticky mobile close control** — tools drawer header on mobile is now
  sticky with its own background/border so the close button remains
  visible while scrolling long tool panels.

## [0.3.0-beta.29] — 2026-05-05

### Fixed
- **Mobile tools drawer stacking** — tools drawer/backdrop now render above
  top chrome on mobile so the close button is always reachable and the
  panel no longer appears behind the header.

## [0.3.0-beta.28] — 2026-05-05

### Added
- **On-canvas annotation numbers** — each annotation now gets a visible
  numbered badge in the PDF viewer so users can map panel items to page
  elements instantly.
- **Bidirectional selection sync** — selecting an annotation on-canvas
  now syncs the notes panel target, and selecting a target in the notes
  panel focuses that annotation on the canvas.

### Changed
- **Annotation-linked notes support multiple entries** — each numbered
  annotation can now hold multiple linked notes (add/remove/edit), not
  just one note string.

## [0.3.0-beta.27] — 2026-05-05

### Changed
- **Optional backend wiring in demo shell** — `LoupePDFDemo` now treats
  host-provided `services` as a hybrid override: wired backend services
  are used where available, and any unwired capability automatically
  falls back to in-browser pdf.js RGB simulation.
- **No hard backend dependency for viewer tools** — passing partial
  backend services no longer disables browser-side tooling for missing
  capabilities, keeping install/integration of backend stacks optional.

## [0.3.0-beta.26] — 2026-05-05

### Added
- **Explicit Move / Pan tool** — tool panel now includes a dedicated
  neutral pointer mode so users can intentionally return to navigation
  without sampling/measuring/annotating.

### Changed
- **Tool-load UX** — sidebar now shows a deterministic `Loading tools…`
  indicator while service-driven tool availability is being resolved,
  preventing controls from appearing progressively.

## [0.3.0-beta.25] — 2026-05-05

### Fixed
- **Tool-click viewer crash regression** — `AnnotationCanvas` was being
  re-initialized on parent re-renders after the shell-plugin refactor,
  which could tear down Fabric during tool toggles. Canvas init is now
  page-scoped again, and annotation-history callbacks are stabilized.

## [0.3.0-beta.24] — 2026-05-05

### Added
- **Plugin-first viewer shell primitives** — new reusable shell plugin
  API (`LoupePDFShellPlugin`, `resolveShellPlugins`, `pluginsForSlot`,
  `computeFeatureAvailability`) and first-party defaults
  (`createDefaultShellPlugins`) for panel + toolbar composition.
- **Preset-based composition** — `LoupePDFDemo` now accepts a
  `preset` (`demo` / `minimal`) and `plugins` overrides so hosts can
  replace built-in sidebar/menu blocks without forking component code.

### Changed
- **LoupePDF / LoupePDFDemo composition** — sidebar + annotation toolbar
  rendering now goes through slot plugins instead of hardcoded branches,
  making built-ins modular and reusable for custom viewers.
- **Capability gating defaults** — feature visibility now centralises in
  `computeFeatureAvailability` (default-on, auto-hide when services are
  unwired or data is absent).

### Docs
- Updated component + plugin docs with shell-plugin usage and override
  examples for custom viewer assembly.

## [0.3.0-beta.23] — 2026-05-05

### Fixed
- **Sticky-note text editing** — sticky notes were being created as a
  grouped paper-rect + textbox object, which made text-edit entry
  unreliable in Fabric 6 interaction paths. Notes now instantiate as a
  single editable `fabric.Textbox` with opaque pastel background,
  padding, and shadow, then immediately enter editing mode.
- **Mobile tools toggle overlap** — menu toggles now use a clear open/
  close pattern that avoids overlaying the first drawer controls:
  mobile top-bar toggle remains a hamburger, embedded FAB hides while
  drawer is open, and the drawer itself includes an in-panel close
  button.

## [0.3.0-beta.22] — 2026-05-05

### Added
- **Flat-PDF layer fallback row** — when a PDF has no OCGs, the
  Layers panel now shows a synthetic `Artwork (flattened PDF)` row
  instead of an empty state. This is UI-only metadata (`synthetic`,
  `kind: "flattened-artwork"`) and does not alter real layer data.
- **Color picker ink swatches** — process and spot rows in
  `ColorPickerTool` now render swatch chips next to each ink name,
  matching densitometer readability and using stable spot-color
  hashing.

### Changed
- **Layers mode fallback rendering** — for synthetic-only layer sets
  (flat PDFs), `LoupePDFDemo` renders `PageCanvas` in Layers mode so
  users still see artwork while toggling the fallback row.
- **LayerInfo typing** — added optional provenance metadata:
  `synthetic?: boolean` and `kind?: "ocg" | "flattened-artwork"`.

## [0.3.0-beta.21] — 2026-05-04

### Fixed
- **Mobile tools drawer** — the floating hamburger sat in the
  top-left of the stage at `z-index: 60`, so it covered the
  annotation toolbar and, when the drawer was open, overlapped the
  first rows of the sidebar (e.g. the "Mode" heading). The tools
  toggle now lives in the **stacked marketing header** on narrow
  viewports (44px touch target). **Embedded** mode (no URL bar)
  still uses a corner FAB, moved to the **top-right** so it
  doesn’t cover the left-aligned pen tool.
- **Drawer vs header** — the dimmer and slide-in `aside` start
  **below** the measured header height (`ResizeObserver` on the
  `<header>`) so the URL row and ☰ stay interactive; header uses
  `z-index: 100` above the drawer (`56`).
- **See-through drawer** — `sidebarStyle` now sets an opaque
  `background: tokens.bg`. The dimmer is a heavier `rgba(0,0,0,.72)`
  with **no** backdrop blur so the stage doesn’t show through the
  panel.
- **Mobile URL bar** — header is a column on small screens: full-
  width field, `minHeight: 44` / `fontSize: 16` (iOS won’t
  auto-zoom), `Load` and `Upload PDF` as two equal full-width
  buttons.
- **Annotation list in the drawer** — new `comfortable` prop on
  `<AnnotationThread>` (on when `useIsMobile`) increases padding
  and delete / jump control sizes. Stage padding is tighter on
  mobile; the annotation toolbar row can scroll horizontally
  if needed.

## [0.3.0-beta.20] — 2026-05-04

### Added
- **Visible annotation tooltips** — hover / keyboard focus on every
  toolbar control opens a fixed-position tooltip chip (`role="tooltip"`)
  near the control, not only the delayed native `title` attribute.
  Applies to tools, colour swatches, custom-colour input, undo/redo,
  hide-notes, and the Saved label.

### Changed
- **Toolbar tool order** — Pen is now the leftmost tool so drawing
  works immediately; Select ("pointer") is second with a mouse-pointer
  SVG icon and explicit copy that it only grabs annotations you've
  already placed (empty canvas = nothing to select — not broken).
- **Default annotation mode** — `<LoupePDFDemo>` starts with the pen
  tool active instead of select, matching the new order.

## [0.3.0-beta.19] — 2026-05-04

### Changed
- **Layers empty-state copy** — clarified that zero optional content
  groups (OCGs) is normal for flat PDFs: artwork still appears on
  the page composite in Page mode; OCG “layers” only exist when the
  file was authored with that structure (Acrobat / InDesign).

## [0.3.0-beta.18] — 2026-05-04

### Changed
- **Demo disclaimer relocated** — the long "LoupePDF supports full
  CMYK + spot inks…" footer in the sidebar was eating vertical
  space on every active session, even though the message is only
  useful before a PDF is loaded. Moved the entire paragraph onto
  the empty / upload screen so it greets new visitors once and
  the working sidebar stays compact.

## [0.3.0-beta.17] — 2026-05-04

### Fixed
- **Annotation list never updated after a drawing was saved** —
  `AnnotationThread` only loaded `annotationService.list()` once on
  mount, so even though `<AnnotationCanvas>` was correctly
  persisting fabric JSON via `saveForPage` and the browser service
  was firing `notify()`, the sidebar list stayed stuck on
  "No annotations yet." Added a `refreshKey?: number` prop on
  `<AnnotationThread>` (covered as a `useEffect` dependency) and
  wired it up in `<LoupePDFDemo>` to the version tick from
  `useBrowserViewerServicesVersion`. Hosts using a wired backend
  can pass any monotonic counter — when annotations land, bump it
  and the thread re-fetches.

## [0.3.0-beta.16] — 2026-05-04

### Fixed
- **`LayerPanel` rendered borked in non-Tailwind hosts** — the
  layer list was using shadcn-style classes (`flex`, `space-y-3`,
  `text-slate-200`, `hover:bg-slate-800`, `text-destructive`) which
  silently dropped in hosts whose Tailwind config doesn't scan the
  package. The "All On / All Off" buttons collapsed and checkbox
  rows lost their alignment so toggling individual layers felt
  broken even though the underlying OCG enumeration was correct.
  Rewrote with inline styles matching the rest of the sidebar
  (sticky-style header, padded toggle rows, scoped spinner
  keyframes, italic muted empty-state copy).

### Added
- **Sticky-note redesign** — sticky notes are now grouped paper
  cards: an opaque pastel rect derived from the active stroke
  colour (mixed 72 % toward white so the note never goes
  see-through), stroked in the active colour, with a 14 px inner
  padding, rounded corners, and a soft drop-shadow that lifts the
  card off the page. The body Textbox sits inside the rect and
  the whole thing moves / scales as one Fabric `Group`.
- **Show / hide sticky notes** — the annotation toolbar gained a
  toggle button (`Hide notes` ↔ `Show notes`) that flips the
  `visible` flag on every sticky-note group on the canvas.
  Notes are not deleted; toggling back restores them. New
  `showStickyNotes` prop on `<AnnotationCanvas>` and matching
  `stickyNotesVisible` / `onToggleStickyNotes` props on
  `<AnnotationToolbar>` expose the same control to custom
  compositions.

## [0.3.0-beta.15] — 2026-05-04

### Fixed
- **Pen tool drew nothing on fabric v6** — fabric v6 stopped
  auto-instantiating `canvas.freeDrawingBrush`, so toggling pen
  mode set `isDrawingMode = true` against an undefined brush and
  the `if (canvas.freeDrawingBrush)` colour / width branch silently
  no-opped. `AnnotationCanvas` now constructs a `PencilBrush` at
  init so the pen, free-hand strokes, and the existing
  colour-on-stroke-change effect all work.
- **Annotation toolbar scrolled away with the page** — the toolbar
  was a flow sibling of the canvas inside the stage scroll
  container, so zooming / scrolling pushed it out of reach.
  Wrapped it in a `position: sticky; top: 0; z-index: 30` div so
  it stays pinned while the canvas scrolls underneath.

### Changed
- **Descriptive tool tooltips** — every annotation toolbar control
  now carries a self-explanatory `title`: per-tool descriptions
  (e.g. "Free-hand pen — draw freely with the active colour",
  "Sticky note — click to drop an editable tinted note card"),
  per-swatch "Use #ef4444 as the active stroke / fill colour", a
  custom-colour-wheel hint, undo / redo verbs, and a saving-state
  status line.

## [0.3.0-beta.14] — 2026-05-04

### Fixed
- **`AnnotationThread` rendered as a malformed pill** in hosts
  without the package's Tailwind classes — empty state collapsed
  into an oddly-shaped capsule because every layout class
  (`flex`, `gap-2`, `p-4`, `text-slate-400`, `text-primary`,
  `text-destructive`) silently dropped. Replaced with inline
  styling that matches the rest of the sidebar (border, dark
  fill, italic muted empty-state copy, scoped spinner keyframes).
- **Nested scroll in the demo sidebar** — the annotations panel
  wrapped `AnnotationThread` in its own `maxHeight: 200;
  overflow-y: auto`, while the sidebar itself already scrolled.
  Removed the inner scroll region so the thread expands inline
  and the sidebar handles all scrolling.

### Changed
- **Tool labels** — sidebar entries renamed from "Color picker (RGB
  + TAC)" / "Densitometer (CMYK)" to "Color picker" / "Densitometer".
  Both tools work on every detected ink (CMYK + spots) so the
  parenthetical limitation was misleading.
- **Tool swatches** — added inline colour swatches next to each
  tool name. Color picker shows a rainbow conic ring (samples any
  colour); densitometer shows a CMYK quadrant chip (process + spot
  density readout).

## [0.3.0-beta.12] — 2026-05-04

### Changed
- **Documentation refresh** — README, component reference, and
  CHANGELOG brought current with the 0.3.0 series. `<LoupePDF>` is
  now the headline integration tier; the demo wrapper is positioned
  as a marketing-page convenience.

## [0.3.0-beta.11] — 2026-05-04

### Added
- **Mobile responsive layout** — new `useIsMobile()` hook drives a
  shared breakpoint (`max-width: 767px`). On mobile the persistent
  tools sidebar collapses into a slide-in drawer anchored to the
  left edge (`~85vw`, max `320 px`, `transform`-animated) with a
  floating `☰` toggle and tap-outside backdrop. Color picker /
  densitometer readouts switch from floating tooltip to full-width
  bottom sheets so the readout is always legible regardless of where
  the user taps.

### Fixed
- **`MeasureTool` readout legibility** — replaced the Tailwind-only
  `bg-green-900/90` chip with an opaque inline-styled card (dark
  slate background, green border, mint mono-font readout, drop
  shadow) so measurements stay readable over light artwork, photos,
  and ruler ticks. The drag-hint banner got the same treatment.
- **Tailwind dependency removed** from `ColorPickerTool`,
  `DensitometerTool`, and `MeasureTool` overlays — they now render
  correctly in any host regardless of whether the host's Tailwind
  config scans the package.

## [0.3.0-beta.10] — 2026-05-04

### Changed
- **Demo disclaimer copy** — both sidebar disclaimers now lead with
  "LoupePDF supports full CMYK + spot inks with no approximation
  when a backend (Ghostscript / MuPDF + ICC profiles) is wired
  through the `services` prop". The RGB-derived path is presented
  as the fallback the demo runs in, not the only mode the package
  supports.

## [0.3.0-beta.9] — 2026-05-04

### Changed
- **`LoupePDFDemo` source split** — every CSS-in-JS helper
  (`shellStyle`, `topbarStyle`, `sidebarStyle`, `stageStyle`, …)
  moved out into a sibling `LoupePDFDemo.styles.ts` (270 lines).
  The main component file dropped from 1620 → 1373 lines so the
  React tree is visible without scrolling past inline style objects.
- **Top-of-file JSDoc** rewritten to lead with "Most consumers
  should not import this directly. Use `<LoupePDF>` instead — it's
  a one-liner production drop-in." Documents the file's internal
  organisation (styles file + per-feature canvas / overlay / panel
  components).

## [0.3.0-beta.8] — 2026-05-04

### Fixed
- **TAC heatmap missed spot inks** — `buildHeatmapUrl` previously
  coloured every pixel from `rgbToCmyk` only, while the densitometer
  and color picker added each detected spot ink's coverage estimate
  to the same pixel's TAC. PDFs declaring spot inks now get a
  heatmap that matches the readout: process CMYK + every detected
  spot ink, summed via `estimateInkCoverage` with the same
  cosine-similarity heuristic. Pure CMYK files behave identically
  to before.

## [0.3.0-beta.7] — 2026-05-04

### Fixed
- **Demo overlays misaligned with the page** — `LoupePDFDemo` was
  computing its outer canvas-area div from `PTS_TO_PX = 96/72` while
  `PageCanvas` rendered using `DEFAULT_DPI/72 = 150/72`. The parent
  div was ~36% smaller than the rendered page so every absolute-
  positioned overlay (TAC heatmap, separation canvas, layer canvas,
  annotation canvas, dieline / box overlays) landed on the top-left
  ~64% of the page and shifted relative to the actual content.
  Switching `PTS_TO_PX` to `DEFAULT_DPI / 72` makes the parent agree
  with what `PageCanvas` renders so all overlays now register
  pixel-perfect.

## [0.3.0-beta.6] — 2026-05-04

### Changed
- **Demo footer copy** — dropped the marketing "Everything runs in
  your browser via pdf.js" line from the sidebar footer and the
  empty-state upload prompt. CMYK / TAC approximation disclaimer
  and max-upload hint stay because they're useful technical
  caveats.

## [0.3.0-beta.5] — 2026-05-04

### Added
- **Sticky note tool** in the annotation toolbar — drops a fabric
  `Textbox` styled as a sticky-note card (180 px wide, tinted
  background derived from the active stroke colour, matching
  border, dark ink) at the click point and immediately enters edit
  mode with the placeholder pre-selected. Participates in undo /
  redo, auto-save, and the existing JSON serialisation.

## [0.3.0-beta.4] — 2026-05-04

### Fixed
- **Tools / overlays collapsed in hosts without Tailwind** — every
  overlay component (annotation, color picker, densitometer,
  measure, TAC heatmap, separation, layer, box, dieline) was
  relying on Tailwind utility classes (`absolute`, `inset-0`,
  `cursor-crosshair`) for positioning. In hosts whose Tailwind
  config didn't pick up the package's compiled JS, those overlays
  collapsed to 0×0 and pointer events fell through to the page
  canvas — so annotation tools, color picker, etc. appeared
  non-functional. Replaced positioning classes with inline `style`
  props throughout.
- **`AnnotationCanvas` upper-canvas sizing** — explicit `width` /
  `height` attributes on the underlying `<canvas>` element so
  fabric.js sizes its event-receiving upper-canvas correctly.
- **OCG layer enumeration** hardened — handles both `Map` and
  `Object` literal shapes returned by pdf.js's
  `getOptionalContentConfig().getGroups()`, falls back to walking
  the `/OCProperties /D /Order` tree, queries names through both
  `getGroup(id)` and `getGroups()[id]`, and passes the proper
  `{ type: "OCG", id }` shape to `isVisible()`. Caches the OCG list
  against every page (OCGs are document-level) and emits a console
  warning when `listLayers` fails so reviewers can diagnose PDFs
  without optional content groups.

## [0.3.0-beta.3] — 2026-05-04

### Added
- **`<LoupePDF>` component** — drop-in production viewer. Thin
  wrapper around `<LoupePDFDemo>` with `embedded=true` and a clean
  prop surface: `pdfUrl` is the single required prop, no upload
  chrome, plus full preflight integration (`items`, `selectedItem`,
  `onItemSelect`, `dieline`, `showBoxOverlays`, `cropToTrim`,
  `onPageChange`, `onZoomChange`, `onError`).
- **Spot-ink detection** in `createBrowserViewerServices` —
  regex-scans raw PDF bytes for `/Separation` and `/DeviceN` colour
  spaces, decodes PDF name encoding, maps known spot families
  (Pantone, Reflex Blue, Warm Red, etc.) to sRGB and falls back to
  a hash-derived hue otherwise. `estimateInkCoverage()` projects
  each pixel onto the spot's subtractive direction so densitometer,
  color picker, and the inks panel report values for every detected
  CMYK + spot.
- **Per-spot separation plates** — `getChannelImageUrl` now builds
  grayscale rasters for every detected ink (process and spot) so
  the separations canvas can isolate any plate.
- **`AnnotationToolbar` portability** — every shadcn-style class
  replaced with inline styling so the toolbar renders identically
  in any host regardless of Tailwind / CSS framework.

### Changed
- **Demo viewer mode UX** — three mutually-exclusive primary
  canvases (Page / Separations / Layers) replace the previous
  overlay-stack. Inks default ON; untick a plate to preview without
  it (matches Acrobat's Output Preview).

## [0.3.0-beta.2] — 2026-05-04

### Added
- **Client-side `createBrowserViewerServices`** — full
  `ViewerServices` implementation backed by pdf.js. Every viewer-
  only feature (page tiles at multiple DPIs, channel rasters, TAC
  heatmap, color sample, densitometer, layer rendering, in-memory
  annotations) works on any PDF the browser can fetch with no
  backend required.
- **`prepare(pageNum)` lifecycle method** — eagerly pre-builds
  every channel + heatmap + layer for a page so non-reactive
  canvases (separations, layers) don't latch onto an empty URL
  before the analysis raster lands.
- **Multi-DPI tile cache** — `PageCanvas` requests an effective
  DPI bucketed off the current zoom; the browser services build
  and cache rasters per `(pageNum, dpi)` so zoom doesn't degrade
  the page tile.
- **OCG-aware `LayerCanvas`** — uses pdf.js's
  `OptionalContentConfig` to render a single OCG with transparent
  background.

### Changed
- **CMYK approximation** — `rgbToCmyk` switched from a basic
  closed-form to a "rich-black" formula (additive CMY + K based on
  `min(C,M,Y) * 0.8`) so the densitometer / TAC heatmap actually
  trip on solid black instead of reporting K=0% for pure black.

## [0.3.0-beta.1] — 2026-05-04

### Changed
- **Publish target** — moved package consumption away from GitHub
  source and onto the public npm registry under the
  `@printwithsynergy` scope. Marketing site now installs from npm.

## [0.2.0-beta.3] — 2026-05-04

### Changed
- **Publish target** — moved from GitHub Packages to public npm registry.

## [0.2.0-beta.2] — 2026-05-04

### Fixed
- **ESM compatibility** — added post-build script to rename `.jsx` files to `.js`
  for Node.js ESM compatibility. Component files are now resolvable without
  explicit extensions in imports.

## [0.2.0-beta.1] — 2026-05-04

### Fixed
- **Build output** — package was not built before publishing. Added `dist/` to
  published artifacts. All component files now included in
  `dist/components/` (`.jsx` + `.d.ts`).

## [0.2.0] — 2026-05-04

### Added
- **`<LoupePDFDemo>` component** — drop-in interactive demo with file
  upload, URL paste, drag-and-drop, client-side validation, sidebar
  controls, theming, and fullscreen mode. Zero boilerplate — config and
  data only. See [docs/components.md](./docs/components.md#drop-in-demo).
- **`useLoupePDF()` hook** — manages all viewer state (pages, zoom,
  layers, tools, fallback adapter, context values). Pair with
  `<LoupePDFProvider>` for the "hook + provider" integration tier.
- **`<LoupePDFProvider>` component** — thin wrapper that mounts both
  `ViewerHostContext` and `ViewerServicesContext` from a `useLoupePDF()`
  return value.
- **Slot props on `<LoupePDFViewer>`** — `header`, `sidebar`, and
  `footer` render props let hosts replace default regions without losing
  the rest of the viewer chrome. `LoupePDFViewerState` type exposes the
  viewer state to slot callbacks.
- **`defaultUnwiredServices`** — exported from `/host` so consumers
  don't need to recreate the 30-line `markUnwired` stub object.
- **`pageInfoFromDimensions()`** — helper in `/types` that builds a
  complete `PageInfo` from just page number, width, and height.
- **`darkThemeTokens`** — dark palette preset exported from `/plugin`
  alongside the existing `defaultThemeTokens`.
- **`validatePdfFile()` / `validatePdfUrl()`** — client-side PDF
  validation (magic bytes, MIME type, file size) exported from `/host`.
  See [docs/validation.md](./docs/validation.md).
- **`generateShareLink()` / `parseShareParams()`** — build and parse
  shareable viewer URLs with query params for PDF URL, fullscreen, zoom,
  page, mode, tools, and theme. See
  [docs/share-links.md](./docs/share-links.md).
- **`typesVersions`** in `package.json` — consumers using
  `moduleResolution: "node"` can now resolve sub-path type declarations
  without switching to `"bundler"`.

### Changed
- **Version bump** to `0.2.0`.
- **README** rewritten with a 4-tier decision tree (Demo → Viewer →
  Hook+Provider → Full Custom) plus shareable-link and validation
  sections.

## [0.1.0-beta.3] — 2026-05-04

### Fixed
- **`<LoupePDFViewer>` mobile chrome**: at viewports under 768 px the
  toolbar overflowed and the tools clipped off-screen, leaving no way
  to reach color picker / measure / layers. Replaced with a hamburger
  that opens a left-sliding drawer (matching the existing
  `MobileDrawer`'s design language: `bg-slate-900`,
  `border-white/[0.06]`, `DrawerSection` / `DrawerItem` styling).
  Layers gets its own separate slide-in drawer so toggling layers
  doesn't dismiss the tools menu.
- **Toolbar look** brought into agreement with the rest of the
  package — Tailwind `bg-slate-900` / `text-slate-300` /
  `hover:bg-slate-800` instead of the inline-styled neutral chrome
  that `0.1.0-beta.2` shipped. Active tool buttons honour
  `tokens.accent` for brand colour.
- **`LoupePDFViewer` `brand` prop** added — optional label rendered
  in the top-left of the toolbar and as the mobile drawer header.
- **Layers control hides** when the PDF has no OCGs (was rendering
  the toggle button anyway, then showing an empty layer list).

## [0.1.0-beta.2] — 2026-05-04

The first published version. Public API may still change before
`0.1.0` proper based on early-adopter feedback.

### Added
- **`<LoupePDFViewer>` composition** — one-line drop-in viewer:
  `<LoupePDFViewer pdfUrl="…" />` auto-discovers page count, page
  dimensions, and OCG layers from the PDF; renders all pages in a
  scrollable list (or one at a time with `mode="single"`); ships a
  responsive default toolbar with zoom, layers, color picker, and
  measure tool; reflows to a bottom-drawer layout under 768 px. Keeps
  every existing lower-level component export public and unchanged
  for hosts with bespoke layouts.
- **`@printwithsynergy/loupe-pdf/fallback-pdfjs` subpath** — new entry
  point with a **static** `import "pdfjs-dist"` so bundlers (Vite,
  webpack, esbuild) trace the dep correctly without consumers having
  to side-effect-import it. Exports `createPdfJsFallback` and
  `defaultPdfWorkerSrc`. Hosts that need the fallback should import
  from here.
- **`pdfjs-dist` is now a regular `dependencies` entry** (was an
  optional peer). Hosts that use the new subpath get it transitively;
  the bundle cost is paid only by code paths that actually touch the
  fallback.
- **`defaultPdfWorkerSrc`** — exported pdf.js worker URL, pinned to
  the bundled `pdfjs-dist` version via unpkg. `<LoupePDFViewer>` uses
  it by default; hosts override via the `workerSrc` prop.
- **Reference server** — optional Node + Ghostscript backend under
  `server/`. Exposes the HTTP contract that `services.separations`,
  `services.densitometer`, `services.tacHeatmap`,
  `services.colorSample`, and `services.pageImages` map onto. Driven
  by Ghostscript's `tiffsep` device for real CMYK + spot-ink
  rendering. Dockerfile + Cloudflare-friendly cache headers
  (`immutable, max-age=31536000`, `Cache-Tag: job-{id}`) included.
- **Capability detection** — `markUnwired` / `isUnwired` helpers on
  every no-op default service, plus a `useFallbackMode(service)` hook
  returning `"wired" | "fallback" | "hidden"`. Components self-hide
  when their backing service is unwired.
- **In-browser PDF fallback adapter** — covers `PageCanvas`,
  `PageNavigator`, `MeasureTool`, `LayerPanel`, and `ColorPickerTool`
  directly from a PDF blob. Components that need real ink data
  (`SeparationCanvas`, `DensitometerTool`, `TACHeatmapOverlay`) stay
  hidden — pdf.js can't reconstruct CMYK from rendered RGB.
- **Debug logging** — `host.debug` flag emits a one-shot
  `console.info` per self-hidden component, deduped per component
  name.
- **Demo app** — `demo/` is a small Vite app that flips between
  empty, pdf.js-fallback, and fully-mocked host contexts for
  hands-on smoke testing.
- **Tests** — first vitest suite covering `isUnwired` /
  `markUnwired`.
- **Public-repo readiness** — `CHANGELOG`, `SECURITY`,
  `CODE_OF_CONDUCT`, root `CONTRIBUTING`, GitHub issue + PR
  templates, README badges (CI / license / React).
- **Docs** — `docs/architecture.md`, `docs/services.md`,
  `docs/fallback.md`, `docs/server.md`, `docs/components.md`,
  `docs/plugins.md`, `docs/measurement-units.md`, `docs/theming.md`,
  `docs/contributing.md`. `docs.json` sidebar config + YAML
  frontmatter on every page driving `loupepdf.com`.
- **GitHub Packages publish workflow** — pushing a `v*` tag triggers
  the workflow, which builds, tests, and publishes to
  `npm.pkg.github.com`. Pre-release tags publish under the `beta`
  dist-tag.

### Changed
- The `createPdfJsFallback` re-export from
  `@printwithsynergy/loupe-pdf/host` is now `@deprecated` — it still
  works (dynamic import) for back-compat, but new code should use
  the `/fallback-pdfjs` subpath.
- **Breaking — type rename**: `PreflightSourceMode` →
  `FindingsSourceMode`, `ViewerConfig.preflight_source` →
  `findings_source`.
- **Breaking — neutral defaults**: `MobileDrawer` brand fallback is
  now `"PDF Viewer"` (was `"Preflight"`); anonymous-mode report
  title is `"PDF Report"` (was `"Preflight Report"`).
- **JSDoc + docs scrub** — every "LintPDF as canonical host"
  reference replaced with generic phrasing. The viewer is now
  host-agnostic in both runtime and prose.
- **Tooling** — standardised on `npm`. CI runs `npm install / npm
  test / npm run build`.

### Fixed
- **Production "createPdfJsFallback requires pdfjs-dist to be
  installed" error** in apps that imported the fallback through
  `/host`. The dynamic import wasn't traced by bundlers, so consumers
  had to add a side-effect `import "pdfjs-dist"` to make it
  resolvable. The new `/fallback-pdfjs` subpath fixes this for all
  bundlers without consumer changes. Surface that hit it:
  `demo.loupepdf.com`.

### Removed
- All product-specific terminology from the public surface — `grep
  -rni "preflight|lintpdf|lint-pdf|thinkneverland"` returns nothing
  in source or docs.

## [0.1.0] — internal extraction

First internal version of LoupePDF, extracted from an upstream SaaS
monorepo as the host-agnostic OSS viewer core. Never published.
Superseded by `0.1.0-beta.2`.
