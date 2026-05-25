# Changelog

All notable changes to LensPDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0-beta.98] — 2026-05-25

### Changed
- **`topBarActions` → `menuActions` (renamed + relocated).** The
  declarative host action buttons now render inside the tools menu
  (hamburger drawer on mobile / persistent left sidebar on desktop),
  pinned above the plugin panels. Top-bar real estate was getting
  crowded on narrow viewports — moving these into the menu keeps the
  top bar compact (just brand + hamburger). The `LensTopBarAction`
  type is now `LensMenuAction`. Hosts that adopted b97 should rename
  the prop + import; behaviour is otherwise identical (same fields:
  `{ id, label, href?/onClick?, download?, external?, order? }`).
- `hasAnyTool` (which drives sidebar / drawer rendering) now also
  considers `menuActions.length > 0`, so a host can ship a menu with
  actions even before any plugins become available.

## [0.3.0-beta.97] — 2026-05-25

### Added
- **`LensTopBar` — persistent customizable top bar** inside `<LensPDF>`.
  Layout left to right: mobile hamburger, brand logo + label, `"topbar"`
  shell-plugin slot nodes, host-injected action buttons. Hosts whose own
  page chrome currently wraps `<LensPDF>` (LintPDF logo + back-button
  pattern) can now drop the wrapper — LensPDF owns the chrome.
- **`topBarActions: LensTopBarAction[]`** prop on `<LensPDF>` for
  declarative top-bar buttons. Each action is `{ id, label, href?,
  onClick?, download?, external?, order? }`. The library renders
  anchors when `href` is set and buttons otherwise. Hosts construct
  the array conditionally, so any action they can't satisfy is
  simply omitted — no built-in "Download / Report / Back" assumption.
- **`"topbar"`** added to the `LensPDFShellSlot` union for full
  React-control insertion into the top bar (save-status, search,
  etc.). The declarative `topBarActions` route still covers the
  90% case.
- **`showTopBar?: boolean`** prop on `<LensPDF>` (default `true`).
  Hosts that already render their own chrome can opt out.
- `LensTopBarAction` is re-exported from the package root for type
  consumption by hosts.

### Changed
- **Mobile drawer hamburger moved into `LensTopBar`** (was the
  floating FAB at the canvas corner introduced in b95/b96). The new
  hamburger has no `hasAnyTool` dependency — it stays visible while
  `isMobile === true`, so the menu can no longer "disappear" during
  the async window between page paint and findings load. The
  `position: absolute` FAB block is removed.

## [0.3.0-beta.96] — 2026-05-25

### Added
- **Finding-badge tooltip "Leave a note" action** — tapping (mobile)
  or hovering (desktop) an F-number badge surfaces a tooltip with
  the finding title + description + a Leave-a-note button. Tapping
  the button auto-creates a blank annotation pre-tagged to that
  finding and focuses its textarea. On mobile the tools drawer
  auto-opens so the focus event is visible.
- **Page-view overlay toggles** — new `showDieline` / `showFindings`
  shell-context state with matching checkboxes in the Page / Sep /
  Layer tabs of the Tools panel. Independent of Inspection-mode
  auto-render.

### Changed
- **Inspection overlays now gate on Inspection mode by default.**
  Fresh load on the Page tab shows only the PDF artwork — no
  dieline outline, no finding bbox highlights, no F-number badges,
  no TAC heatmap. Overlays auto-render when `viewerMode ===
  "findings"` (Inspection tab) or when the host/user flips the
  matching toggle.

## [0.3.0-beta.93] — 2026-05-23

### Fixed
- Clicking a preflight finding whose `page` lands past the document
  end no longer surfaces the red `Invalid page request.` banner from
  pdfjs. The selection→currentPage effect in `<LensPDF>` now clamps
  the target page to `[1, pageCount]` before driving `setCurrentPage`,
  so a drifted adapter (e.g. a lint engine that emits `page_num >
  total - 1`) cannot push the viewer into an out-of-range
  `doc.getPage(n)` call. Reproduced via lintpdf.com/demo against a
  single-page label PDF.
- The "prepare page" effect now swallows pdfjs failures instead of
  surfacing the raw error string in a banner. With the new clamp
  ahead of it, a failure here means a transient pdfjs error or a
  mid-prepare document swap — both recover on the next page change,
  and the bare `Invalid page request.` string was poor UX either way.
- `fromLintFindings` rejects non-finite, non-integer, and negative
  `page_num` values (NaN / floats / `-1` / `"3"`) and falls back to
  page 1 instead of silently producing `page: NaN + 1` / `page: 0`
  overlay items.

### Internal
- Added `adapters/index.test.ts` covering the `fromLintFindings`
  page-handling contract and pinning the host-side clamp math
  (`min(max(1, pageCount), max(1, item.page))`) so a future
  refactor of the inline expression in `LensPDF.tsx` can't drift
  silently.

## [0.3.0-beta.92] — 2026-05-23

### Fixed
- Inspection panel rows now reflect the active selection in uncontrolled
  mode. `shellPluginContext.selectedItem` was forwarding the raw
  `selectedItem` prop, so hosts that let the library own selection state
  (`<LensPDF items={...} />` without `onItemSelect`) saw the row stay
  unhighlighted after a click. The context now exposes the effective
  selection.
- Clearing the selection from a shell plugin now works in uncontrolled
  mode. `handleItemClick` and `LensPDFShellPluginContext.onSelectItem`
  accept `OverlayItem | null`; the default FindingsPanel toggle-off path
  routes through `ctx.onSelectItem(null)` instead of the host-only
  `ctx.onItemSelect(null)`.
- Page-level indicator for findings without a bbox is now a static
  border + glow instead of `animate-pulse`. On mobile, the sidebar
  drawer partially covers the canvas; the pulse on the visible corner
  read as a stray "bottom-left blink" on every selection.
- Removed the redundant `ctx.setCurrentPage(it.page)` call from the
  FindingsPanel row handler; LensPDF's existing `effectiveSelected`
  effect already syncs the current page when selection changes.

## [0.3.0-beta.88] — 2026-05-21

### Changed
- **`<LensPDF>` is now the complete viewer; `<LensPDFDemo>` is a thin
  wrapper.** Previously `<LensPDF>` was a facade that delegated to
  `<LensPDFDemo embedded>`, which read backwards — the production
  component appeared to depend on the demo. All viewer state, services
  wiring, plugin slots, and rendering now live in `LensPDF.tsx`.
  `<LensPDFDemo>` is a small layer that owns the upload chrome (URL
  bar, drag-and-drop, file picker, empty state) and feeds the resolved
  PDF URL into `<LensPDF>`.
- `LensPDFProps` is now a standalone interface with a required `pdfUrl`.
  `LensPDFDemoProps` is `Omit<LensPDFProps, "pdfUrl">` plus
  `maxFileSize` and `initialPdfUrl`. The public prop surface of both
  components is unchanged — this is an internal restructure.

### Added
- `LensPDFTool` type exported from the package root and `./components`.
  `LensPDFDemoTool` remains as a deprecated alias.

## [0.3.0-beta.82] — 2026-05-14

### Added
- **Numbered findings (F1…FN) in Inspection panel and on canvas.** Every
  finding gets a stable number in input order. The number appears as a
  labelled pill badge (`F1`, `F2`, …) drawn on the canvas (located
  findings only — whole-document findings get no canvas badge) and as a
  small chip in each Inspection panel row.
- **Click-to-note via F# badge.** Clicking the `F{n}` chip in the
  Inspection panel selects the finding, switches the Notes panel to it,
  and auto-creates a blank linked note focused for immediate typing.
- **`buildFindingNumberMap(items)` helper exported from `./plugin`.**
  Stable `Map<id, number>` useful for adapter authors mapping their own
  findings into the viewer without duplicating the numbering logic.
- **Separate numbering sequences.** Findings use F1…FN; hand-drawn
  annotations keep their own #1, #2, … counter. The two sequences never
  collide.
- **Finding targets in the Notes panel dropdown.** All findings appear at
  the top of the linked-note target selector so reviewers can attach
  prose notes to any finding without switching modes.



## [0.3.0-beta.78] — 2026-05-13

### Added
- **New ``./swatch`` subpath export** for the Pantone Gold + process
  plate helpers (``resolveSpotSwatch``, ``processPlateLookup``,
  ``pantoneGoldLookup``, ``rgbToHex``). Lets non-viewer hosts
  (marketing Codex extract panels, server-side renderers, doc
  generators) reuse the swatch chain WITHOUT pulling in the full
  ``./browser`` bundle (which transitively imports pdfjs-dist and
  bloats consumers that only need the lookup table). Same helpers
  are still exported from ``./browser`` for viewer consumers.

## [0.3.0-beta.77] — 2026-05-13

### Added
- **Process-plate lookup added to ``resolveSpotSwatch``.** Cyan,
  Magenta, Yellow, Black, and their synonyms (process-cyan,
  cmyk-letter shorthand, RGB plate names) now resolve to canonical
  primaries instead of falling through to host-provided
  hash-derived random colours. Lives in ``browser/pantone-gold.ts``
  and is the new top of the resolution chain.
- **Public exports for the swatch helpers.**
  ``@printwithsynergy/lens-pdf/browser`` now exports
  ``resolveSpotSwatch``, ``processPlateLookup``,
  ``pantoneGoldLookup``, and ``rgbToHex`` so marketing panels can
  reuse the same chain in their Codex extract views (where every
  spot rendered "Cyan" as orange because codex hash-derives swatches
  for process plates).

### Fixed
- Lint + codex marketing demo Codex extract panels rendered Black /
  Cyan / Magenta / Yellow with random hash colours (orange / blue /
  green / wine etc.) because they trusted codex's
  ``swatch_hex``. The new resolution chain forces canonical CMYK
  primaries for known process plates and falls back to Pantone Gold
  + altRgb for anything else.

## [0.3.0-beta.76] — 2026-05-13

### Added
- **``forceInspectionPanel`` prop on ``<LensPDFDemo>`` / ``<LensPDF>``.**
  When true, the Inspection / Findings side panel stays mounted even
  with no ``items`` and renders a "no findings yet" empty state.
  Useful for hosts that have an in-flight preflight call (stable
  layout while it loads) or for demos that always advertise the panel
  slot. Default ``false`` — OSS hosts without preflight data don't
  see an empty section.

### Docs
- `docs/components.md` now documents the auto-on/force-on Inspection
  panel behaviour, the new ``forceInspectionPanel`` prop, and the
  spot-colour resolution chain (``spotPalette`` → Pantone Gold → PDF
  ``altRgb``).

## [0.3.0-beta.75] — 2026-05-13

### Changed
- **Mobile hamburger menu moved from header-right to header-left,
  beside the brand/logo.** Primary menu triggers belong top-left on
  mobile (iOS / Material convention). The zoom controls keep the
  right cluster for one-tap zoom in/out. No desktop change — desktop
  retains the full toolbar on the right.
- **Separations panel now renders accurate spot-colour swatches.**
  Resolution chain: host-provided ``spotPalette[name]`` (typically
  codex's ``summary.spot_colors.colors[].swatch_hex`` or another
  preflight's swatch) → built-in Pantone Gold library (new
  ``browser/pantone-gold.ts``, ~85 of the most-common Coated codes)
  → the PDF tint transform's ``altRgb`` (parsed at extraction) →
  neutral grey fallback. Previously every spot rendered the same
  generic purple ``#7c3aed`` regardless of the actual ink, which
  made it impossible to distinguish (e.g.) ``PANTONE 225 C`` from
  ``PANTONE 236 C`` in the panel.

### Added
- **New ``spotPalette`` prop on ``<LensPDFDemo>`` / ``<LensPDF>``.**
  Hosts with codex / external-preflight data pass the spot → hex map
  in here; the separations panel picks it up automatically.
- **Inspection / Findings panel baked into the default shell
  plugins.** When the host passes ``items`` to LensPDF, a new
  ``Inspection (N)`` section appears at the top of the side drawer
  with tier filter chips (errors / warnings / advisories / info)
  and a clickable list that drives ``onItemSelect`` for canvas
  highlight + page jump. Renders nothing when ``items`` is empty so
  OSS hosts without preflight don't see an empty section.

## [0.3.0-beta.74] — 2026-05-13

### Changed
- **Annotation toolbar now lays out as three explicit rows on
  mobile** — previously the toolbar used `flex-wrap: wrap` and
  whatever organic wrap fell out of the available width, which on a
  typical phone broke as `[tools + one swatch] / [rest of swatches +
  undo / redo / saved]`. Wrapped the existing children in three
  groups (Tools / Colours / Actions), each with `flex-basis: 100%`
  when the `compact` prop is true so the three groups always take
  one row each. Desktop layout is unchanged — without `compact` the
  groups stay inline and the outer wrapper's `flex-wrap` still
  handles narrow desktop viewports.

## [0.3.0-beta.67] — 2026-05-11

### Fixed
- **Annotation toolbar no longer escapes into the host page's chrome
  on mobile** — the mobile container used `position: fixed; top:
  headerChromePx`, but in `embedded` mode `headerChromePx` is `0`, so
  the toolbar landed at viewport-top and covered the parent page's
  navigation when the viewer was mounted on a marketing site. Switched
  to `position: sticky; top: 0`, which keeps the toolbar pinned to the
  top of the stage scroll container without escaping upward. Desktop
  was already sticky; the two code paths are now unified.

## [0.3.0-beta.66] — 2026-05-11

### Fixed
- **Annotation toolbar no longer blocks navigation on mobile** — the
  fixed toolbar that sits just below the header was a single
  horizontally-scrolling strip with 28-px buttons. It now wraps onto
  two rows so every control is reachable without a scroll gesture,
  and every hit target is sized for fingers (tool buttons 28 → 40 px,
  swatches 18 → 26 px, undo/redo padding and font scaled up, custom
  colour input 22 → 32 px). Desktop layout is unchanged — the wider
  hits only kick in when `compact` is set, which `<LensPDFDemo>`
  passes from `ctx.isMobile`. The mobile container no longer needs
  `overflowX: auto` (wrap replaces scroll).

## [0.3.0-beta.65] — 2026-05-11

### Changed
- **`@printwithsynergy/codex-client` declared as optional peer dep at
  `^1.8.1`** — `browser/codexOverlay.ts` keeps its structural
  `MinimalCodexClient` interface (no runtime import), and `HttpClient`
  from 1.8.1 satisfies it. The peer dep is marked optional in
  `peerDependenciesMeta`, so hosts that don't pass a `codex` client
  to `<LensPDFDemo>` / `<LensPDF>` are unaffected.

### Docs
- **Shareable links** (`generateShareLink`, `parseShareParams`) and
  **PDF validation** (`validatePdfFile`, `validatePdfUrl`) pages are
  now wired into the Reference group of the rendered docs sidebar
  (previously only reachable via inbound links from README /
  components).
- **README + components.md** call out the optional codex-client peer
  dep alongside the existing `fabric` peer.

## [0.3.0-beta.64] — 2026-05-10

### Added
- **Custom logo + label via `ThemeTokens`** — `logoUrl`, `logoText`,
  `logoMaxHeight`, and `logoAlt` are now optional fields on
  `ThemeTokens`, letting a host bundle its full visual identity
  (colours + logo + label) into one tokens object instead of passing
  separate `brandLogoUrl` / `brand` props. Resolution order in
  `<LensPDFDemo>` / `<LensPDF>`: explicit prop > tokens > built-in
  default. Top-bar and welcome-screen logo `<img>` tags now use
  `height` + `width: auto` so non-square logos keep their aspect ratio.

### Changed
- **"Rasterising page & computing CMYK…" loader is now a bottom pill** —
  was a full-viewer dim overlay that covered the artwork while
  separations / TAC were warming up. Replaced with a compact pill at
  the bottom-centre of the viewer (rounded, subtle shadow,
  `pointer-events: none`) so users can keep reviewing the page
  underneath while the analysis raster builds.

### Docs
- **Security policy and Licensing pages** added to the docs site
  Project group, sitting next to Contributing. Security policy is
  promoted from the root `SECURITY.md` into a proper docs page;
  Licensing covers the AGPL-3.0-or-later terms, third-party licences,
  and how to request commercial alternatives.

## [0.3.0-beta.63] — 2026-05-10

### Added
- **Show all / hide all on the Separations panel** — the inks panel
  now has the same `All on` / `All off` header buttons that the layers
  panel ships, plus the `Inks (n)` count next to the title. Toggle the
  whole CMYK + spot stack in one click instead of clicking each ink
  individually.

## [0.3.0-beta.62] — 2026-05-10

### Fixed
- **Mobile separations / TAC: `[lens-pdf] toBlob returned null`** — iOS
  Safari intermittently returns `null` from `canvas.toBlob` for large or
  memory-pressured canvases (the analysis raster + each CMYK plate +
  spots + TAC heatmap all share one process-wide canvas budget).
  `rasterizeBlobUrl`, `buildPageUrl`, and `buildLayerUrl` now route
  through a single `canvasToPngBlob` helper that falls back to
  `toDataURL → fetch → blob` when `toBlob` returns null, and the
  analysis raster scales itself down to a 12 MP budget so large-format
  pages (poster / packaging dielines) still render. Hosts using
  `buildPageUrl` directly with a custom DPI are unaffected by the
  clamp.

## [0.3.0-beta.61] — 2026-05-10

### Fixed
- **SSR crash on `/demo` (`Cannot access '_CHANNELS' before initialization`)** —
  `browser/codexOverlay.ts` imported `PROCESS_CHANNELS` back from
  `browser/index.ts`, which already re-exports `codexOverlay`. Under Astro /
  Node ESM the cycle hit a temporal-dead-zone read at request time and broke
  every render of routes that load the codex overlay. `PROCESS_CHANNELS` now
  lives in `browser/constants.ts`, a leaf module both files import from, so
  the cycle is gone. No public API change.

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
- **Optional backend wiring in demo shell** — `LensPDFDemo` now treats
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
  API (`LensPDFShellPlugin`, `resolveShellPlugins`, `pluginsForSlot`,
  `computeFeatureAvailability`) and first-party defaults
  (`createDefaultShellPlugins`) for panel + toolbar composition.
- **Preset-based composition** — `LensPDFDemo` now accepts a
  `preset` (`demo` / `minimal`) and `plugins` overrides so hosts can
  replace built-in sidebar/menu blocks without forking component code.

### Changed
- **LensPDF / LensPDFDemo composition** — sidebar + annotation toolbar
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
  (flat PDFs), `LensPDFDemo` renders `PageCanvas` in Layers mode so
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
- **Default annotation mode** — `<LensPDFDemo>` starts with the pen
  tool active instead of select, matching the new order.

## [0.3.0-beta.19] — 2026-05-04

### Changed
- **Layers empty-state copy** — clarified that zero optional content
  groups (OCGs) is normal for flat PDFs: artwork still appears on
  the page composite in Page mode; OCG “layers” only exist when the
  file was authored with that structure (Acrobat / InDesign).

## [0.3.0-beta.18] — 2026-05-04

### Changed
- **Demo disclaimer relocated** — the long "LensPDF supports full
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
  wired it up in `<LensPDFDemo>` to the version tick from
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
  CHANGELOG brought current with the 0.3.0 series. `<LensPDF>` is
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
  "LensPDF supports full CMYK + spot inks with no approximation
  when a backend (Ghostscript / MuPDF + ICC profiles) is wired
  through the `services` prop". The RGB-derived path is presented
  as the fallback the demo runs in, not the only mode the package
  supports.

## [0.3.0-beta.9] — 2026-05-04

### Changed
- **`LensPDFDemo` source split** — every CSS-in-JS helper
  (`shellStyle`, `topbarStyle`, `sidebarStyle`, `stageStyle`, …)
  moved out into a sibling `LensPDFDemo.styles.ts` (270 lines).
  The main component file dropped from 1620 → 1373 lines so the
  React tree is visible without scrolling past inline style objects.
- **Top-of-file JSDoc** rewritten to lead with "Most consumers
  should not import this directly. Use `<LensPDF>` instead — it's
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
- **Demo overlays misaligned with the page** — `LensPDFDemo` was
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
- **`<LensPDF>` component** — drop-in production viewer. Thin
  wrapper around `<LensPDFDemo>` with `embedded=true` and a clean
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
- **`<LensPDFDemo>` component** — drop-in interactive demo with file
  upload, URL paste, drag-and-drop, client-side validation, sidebar
  controls, theming, and fullscreen mode. Zero boilerplate — config and
  data only. See [docs/components.md](./docs/components.md#drop-in-demo).
- **`useLensPDF()` hook** — manages all viewer state (pages, zoom,
  layers, tools, fallback adapter, context values). Pair with
  `<LensPDFProvider>` for the "hook + provider" integration tier.
- **`<LensPDFProvider>` component** — thin wrapper that mounts both
  `ViewerHostContext` and `ViewerServicesContext` from a `useLensPDF()`
  return value.
- **Slot props on `<LensPDFViewer>`** — `header`, `sidebar`, and
  `footer` render props let hosts replace default regions without losing
  the rest of the viewer chrome. `LensPDFViewerState` type exposes the
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
- **`<LensPDFViewer>` mobile chrome**: at viewports under 768 px the
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
- **`LensPDFViewer` `brand` prop** added — optional label rendered
  in the top-left of the toolbar and as the mobile drawer header.
- **Layers control hides** when the PDF has no OCGs (was rendering
  the toggle button anyway, then showing an empty layer list).

## [0.1.0-beta.2] — 2026-05-04

The first published version. Public API may still change before
`0.1.0` proper based on early-adopter feedback.

### Added
- **`<LensPDFViewer>` composition** — one-line drop-in viewer:
  `<LensPDFViewer pdfUrl="…" />` auto-discovers page count, page
  dimensions, and OCG layers from the PDF; renders all pages in a
  scrollable list (or one at a time with `mode="single"`); ships a
  responsive default toolbar with zoom, layers, color picker, and
  measure tool; reflows to a bottom-drawer layout under 768 px. Keeps
  every existing lower-level component export public and unchanged
  for hosts with bespoke layouts.
- **`@printwithsynergy/lens-pdf/fallback-pdfjs` subpath** — new entry
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
  the bundled `pdfjs-dist` version via unpkg. `<LensPDFViewer>` uses
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
  frontmatter on every page driving `lenspdf.com`.
- **GitHub Packages publish workflow** — pushing a `v*` tag triggers
  the workflow, which builds, tests, and publishes to
  `npm.pkg.github.com`. Pre-release tags publish under the `beta`
  dist-tag.

### Changed
- The `createPdfJsFallback` re-export from
  `@printwithsynergy/lens-pdf/host` is now `@deprecated` — it still
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
  `demo.lenspdf.com`.

### Removed
- All product-specific terminology from the public surface — `grep
  -rni "preflight|lintpdf|lint-pdf|thinkneverland"` returns nothing
  in source or docs.

## [0.1.0] — internal extraction

First internal version of LensPDF, extracted from an upstream SaaS
monorepo as the host-agnostic OSS viewer core. Never published.
Superseded by `0.1.0-beta.2`.
