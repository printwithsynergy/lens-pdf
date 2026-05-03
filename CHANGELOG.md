# Changelog

All notable changes to LoupePDF are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Capability detection**: `markUnwired` / `isUnwired` helpers on every
  no-op default service, plus a `useFallbackMode(service)` hook returning
  `"wired" | "fallback" | "hidden"`. Components self-hide when their
  backing service is unwired (#3, #4).
- **In-browser PDF fallback**: `createPdfJsFallback({ pdfUrl })` returns a
  `PdfFallbackAdapter` that lets `PageCanvas`, `PageNavigator`,
  `MeasureTool`, `LayerPanel`, and `ColorPickerTool` work without a
  server backend. `pdfjs-dist` is an optional peer dep loaded via dynamic
  import (#3).
- **Debug logging**: `host.debug` flag emits a one-shot `console.info`
  per self-hidden component (#3).
- **Demo app**: `demo/` is a small Vite app that flips between empty,
  fallback, and fully-mocked host contexts for hands-on smoke testing
  (#7).
- **Tests**: first vitest suite covering `isUnwired` / `markUnwired`
  (#5).
- **Docs**: `docs/fallback.md` covering capability detection, the pdf.js
  fallback, the host service contract for non-JS backends, and security
  notes (#3).

### Changed
- **Breaking — type rename**: `PreflightSourceMode` → `FindingsSourceMode`,
  `ViewerConfig.preflight_source` → `findings_source` (#8).
- **Breaking — neutral defaults**: `MobileDrawer` brand fallback is now
  `"PDF Viewer"` (was `"Preflight"`); anonymous-mode report title is
  `"PDF Report"` (was `"Preflight Report"`) (#8).
- **`AnnotationCanvas`, `AnnotationThread`, `MobileDrawer`** drop their
  inert / empty surfaces when the backing service is unwired, matching
  the pattern the other components already used (#4).
- **JSDoc + docs scrub**: every "LintPDF as canonical host" reference
  replaced with generic phrasing. The viewer is now host-agnostic in
  both runtime and prose (#9, #10).
- **Tooling**: standardised on `npm`. CI runs `npm install / npm test /
  npm run build` (was `pnpm`).

### Removed
- All product-specific terminology from the public surface — `grep -rni
  "preflight|lintpdf|lint-pdf|thinkneverland"` returns nothing in source
  or docs.

## [0.1.0] — initial extraction

First version of LoupePDF, extracted from an upstream SaaS monorepo as
the host-agnostic OSS viewer core. Re-exported from
`@printwithsynergy/loupe-pdf`.
