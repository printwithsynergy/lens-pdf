# Changelog

All notable changes to LoupePDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_Nothing yet._

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
