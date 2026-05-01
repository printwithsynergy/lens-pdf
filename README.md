# LoupePDF

OSS PDF viewer core. Plugin-driven canvas viewer with overlay / panel / toolbar
slots. Extracted from `thinkneverland/lint-pdf:packages/viewer-shared/src/core/`
(Phase 4 — Q1 2026).

## Install

This repo is currently **private** during the OSS pre-flip period. After the
visibility flip:

```sh
pnpm add @printwithsynergy/loupe-pdf
# or, while private (works as a private GitHub-Packages or git-ref dep):
pnpm add github:thinkneverland/loupe-pdf#main
```

## Plugin model

LoupePDF mounts plugins into nine slots:

- `overlay.canvas`, `panel.{right,left,bottom}`,
- `toolbar.{top,left,bottom}`,
- `annotation.source`, `dialog.modal`.

Plugins satisfy a TypeScript Protocol (`OverlayPlugin`, `PanelPlugin`,
`ToolbarPlugin`, `AnnotationSourceProvider`, `MeasurementUnit`) and are
registered via `registry.register(plugin)`. Theme / page-image / annotation
services live behind `ViewerServices` Protocols with no-op defaults so an
OSS host can run with zero SaaS coupling.

## Boundary rule

The viewer core MUST NOT import:

- `@lintpdf/*` packages or any `**/lintpdf/**` paths,
- the literal string `"/api/lintpdf/"` (route-through `ViewerServices`).

This is enforced upstream in lint-pdf's `eslint.config.mjs` and re-checked
in this repo's CI typecheck pass.

## Phase 4 status

This package was extracted from the lint-pdf monorepo via
`git subtree split --prefix=packages/viewer-shared/src/core/`. History is
file-scoped; the synthetic root commit (`c77ccc51`) is the start of this
repo's history.

The lint-pdf SaaS continues to ship the `@thinkneverland/loupe-plugin-lintpdf`
plugin pack (proprietary findings + branding overlays); LoupePDF itself
ships unbranded.

## License

LoupePDF is licensed under the GNU Affero General Public License v3.0 or
later (AGPL-3.0-or-later). See [`LICENSE`](./LICENSE) for the full text.

Copyright (C) 2026 Think Neverland LLC.
