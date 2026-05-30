# lens-pdf — agent notes

## Scope

Lens-pdf is the **host-agnostic OSS PDF viewer core** for the Print
With Synergy stack. A plugin-driven canvas viewer with overlay, panel,
and toolbar slots that:

- **Never imports a SaaS.** No `synergy-*`, `platform-*`, or `lint-*`
  imports anywhere under `components/`, `plugin/`, `host/`, or
  `browser/`. The viewer is published as an npm library and runs
  outside any tenant/billing context.
- **Never hardcodes a backend route.** Every tool that needs a backing
  service receives it through `ViewerServices` (`plugin/services.ts`).
  Hosts inject; the library doesn't `fetch("/api/...")` on its own.
- **Self-hides any tool whose backing service the host hasn't wired.**
  See "Capability registry" below.

License: **AGPL-3.0-or-later** (`package.json`). Network-served use
triggers AGPL §13 — if the host runs lens-pdf to render PDFs over a
public network, they must offer source for their entire combined work
unless they hold a commercial license.

## Public contracts

Single published artifact: **`@printwithsynergy/lens-pdf`** on npm.
Entry points (`package.json` `exports`):

- `.` — root barrel (protocols + components).
- `./components` — canvas, layers, color picker, densitometer,
  annotation toolbar, dieline overlay, separation canvas, measure
  tool, mobile drawer/sheet, zoom controls, FindingsSidebar,
  DielinePanel.
- `./plugin` — plugin protocol (slots, registry, types), finding-
  location helpers, services interfaces.
- `./host` — contexts (`ViewerHostContext`, `ViewerServicesContext`),
  hooks (`useLensPDF`, `useViewerServices`), factories
  (`createPdfJsFallback`), utilities (`validatePdfFile`,
  `generateShareLink`).
- `./browser` — `createBrowserViewerServices` factory, ink detection,
  CMYK approximation.
- `./fallback-pdfjs` — pdf.js fallback adapter.
- `./adapters` — finding mappers (see "Adapter ABI" below).
- `./units` — measurement units (mm, inch, point, pica, agate;
  extensible).
- `./types` — `PageInfo`, `PageBox`, `DielineResult`, `ColorSample`,
  `DensitometerSample`, `LayerInfo`.
- `./swatch` — Pantone Gold palette.

## Plugin protocol

A `ViewerPlugin` is a discriminated union of `OverlayPlugin |
PanelPlugin | ToolbarPlugin | AnnotationSourceProvider | DialogPlugin`
(`plugin/types.ts`). Each plugin declares:

- `id` — stable identifier; used by `replaces` to shadow another
  plugin in the same slot.
- `manifest.version` — SemVer. **Bump on protocol-affecting changes**
  (slot signature, capability requirement). Patch bumps for impl-only
  changes.
- `slot` — one of:
  - `overlay.canvas` — draws on the rendered page.
  - `panel.{right,left,bottom}` — side or bottom panels.
  - `toolbar.{top,left,bottom}` — toolbar regions.
  - `annotation.source` — provides annotations.
  - `dialog.modal` — top-level modal.
- `replaces?: string` — shadow another plugin in the same slot. Used
  for host-specific overrides without forking lens-pdf.

The registry (`plugin/registry.ts`) exposes `register()`,
`unregister()`, `getPluginsForSlot()`, `listAll()`. **Don't** add new
slots without bumping the plugin manifest's protocol version field.

## Capability registry + service-skip pattern

`ViewerServices` (`plugin/services.ts`) is a protocol family of
optional services: `PageImageService`, `LayerService`,
`SeparationService`, `TACHeatmapService`, `ColorSampleService`,
`DensitometerService`, `AnnotationService`, `ReportsService`,
`TelemetryService`, `I18nService`, `ThemeTokens`.

A service the host hasn't wired is marked via `markUnwired()` and
detected by `isUnwired()`. Components reading services choose a mode
via `useFallbackMode()`:

- `wired` — real service available, use it.
- `fallback` — synthetic / local-only behavior (e.g. pdf.js
  separations approximation when no real `SeparationService`).
- `hidden` — no useful fallback; the tool's UI hides itself.

`logUnwiredHide()` emits a single console warning per unwired service
so contributors notice when a feature self-hid during development
rather than silently disappearing.

**Rule:** when adding a component that consumes a service, decide its
fallback mode at definition time. Don't `throw` for missing services —
that breaks the OSS host story.

## Adapter ABI

`./adapters` is the public mapper layer between engine outputs and
`OverlayItem[]` for the canvas:

- `fromCodexSummary(codexSummary)` — codex's `summary.*` extras.
- `fromCodexFindings(codexFindings)` — codex's emitted findings.
- `fromLintFindings(lintFindings)` — lint-pdf finding shape.
- `fromCallasFindings`, `fromPitstopFindings`,
  `fromArtworkFindings` — third-party preflight imports.

`LensPDFDataConfig` is the host-facing union; one adapter consumes
each input source. Tier remapping (`error` / `warning` / `advisory` /
`info` / `neutral`) is centralized here so engines can keep their own
nomenclature.

**Rule:** when an upstream engine adds a new finding shape, add an
adapter — don't ask the engine to translate to lens-pdf's `OverlayItem`
shape directly. Engines stay engine-shaped; lens-pdf owns the
canvas-shaped mapping.

## Codex client — structural typing

`browser/codexOverlay.ts:29-52` defines `MinimalCodexClient` as a
**structural interface**: any object matching the shape
(`extractStream`, `renderSeparations`, `renderHeatmap`, `renderLayer`)
is accepted. There is no hard import of
`@printwithsynergy/codex-client`; the peer dep is declared
(`package.json:128`, `^1.15.0`) but consumers can supply any
matching shape.

**Implication:** `@printwithsynergy/codex-client` is the **org-aligned
source of truth** for codex TS types. When codex bumps its TS client,
lens-pdf's structural shape stays loose — but host adapters that pass
codex's `HttpClient` directly get type-checked against the new shape.

## Cross-repo dependencies

- **`@printwithsynergy/codex-client`** — optional peer, `^1.15.0`.
  Used structurally; no hard import.
- **lint-pdf**, **compile-pdf**, **synergy**, **platform** — no
  imports anywhere.
- **Marketing repos** (lens-pdf-marketing, lint-pdf-marketing,
  codex-pdf-marketing, compile-pdf-marketing) — consume lens-pdf as
  a dep; coordinated beta-version bumps land via the standard
  marketing-repo PR flow.

## Behavior-locking discipline

When refactoring an adapter or a plugin, **snapshot the current
output first**:

- Write a test that captures `adapter(input)` and pins the expected
  shape.
- Commit the test in its own commit before the refactor.
- The refactor commit's CI must pass that snapshot.

This is the only mechanical guarantee for host adapters that map
engine outputs through lens-pdf — engines bump, lens-pdf bumps,
hosts upgrade; the snapshot is the contract.

## Version discipline

- SemVer on the package + on every plugin manifest.
- `CHANGELOG.md` in Keep-a-Changelog format. Every release entry
  explains *why* a consumer would adopt the bump (what's new + what's
  fixed), not just *what* changed.
- Beta tags (`0.4.0-beta.NN`) are the pre-release channel for
  marketing repos and pilot hosts. Floor pins in consumer
  `package.json` files use exact versions during beta.

## Local dev

```bash
pnpm install                          # install
pnpm typecheck                        # tsc, no emit
pnpm test                             # vitest run
pnpm test:watch                       # vitest --watch
pnpm build                            # tsc + fix-import-extensions
```

The browser preview demo lives under `demo/`. Vite dev server +
Playwright harness for showcase verification.

## Code review & blast-radius protocol

- Run code-review-graph impact tools on changed symbols before edits.
- Run `pnpm test` + `pnpm typecheck` before commit.
- CodeRabbit reviews PRs automatically; Cursor BugBot is the second
  opinion.
- Never disable the code-review-graph Launch Agent.
