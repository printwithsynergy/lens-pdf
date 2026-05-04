---
title: "Overview"
description: "Host-agnostic OSS PDF viewer core for React 19. A plugin-driven canvas viewer with overlay, panel, and toolbar slots. AGPL-3.0-or-later."
group: "Getting started"
order: 1
slug: "overview"
---

# LoupePDF

[![ci](https://github.com/Printwithsynergy/loupe-pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/Printwithsynergy/loupe-pdf/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](./LICENSE)
[![react](https://img.shields.io/badge/react-19-61dafb.svg?logo=react&logoColor=white)](https://react.dev/)

OSS PDF viewer core. A plugin-driven canvas viewer with overlay, panel, and
toolbar slots, built around React 19. Host-agnostic: the viewer never
imports a SaaS, never hardcodes a backend route, and self-hides any tool
whose backing service the host hasn't wired. AGPL-3.0-or-later.

## Install

LoupePDF is published to **GitHub Packages**. Add a `.npmrc` to your
host project pointing the `@printwithsynergy` scope at the GitHub
registry, then install:

```ini
# .npmrc
@printwithsynergy:registry=https://npm.pkg.github.com
```

```sh
# stable
npm install @printwithsynergy/loupe-pdf

# pre-release (current)
npm install @printwithsynergy/loupe-pdf@beta
```

GitHub Packages requires an auth token to read public packages from
some clients — see [the GitHub docs][gh-pkg-auth] for the one-line
`~/.npmrc` setup. CI environments can use the built-in `GITHUB_TOKEN`.

You can also use a git-ref dep against this repo (no auth required):

```sh
npm install github:Printwithsynergy/loupe-pdf#main
```

[gh-pkg-auth]: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-to-github-packages

Peer dependencies you provide in your host app:

```sh
npm install react react-dom
# Optional — only if you mount AnnotationCanvas / AnnotationThread:
npm install fabric
```

Requires `react@^19` and `react-dom@^19`. `fabric@^6` is an optional peer
used by the annotation components. `pdfjs-dist@^4` is now a regular
dependency — it comes along automatically and is loaded by the
in-browser fallback adapter at `/fallback-pdfjs`. The package ships ESM
only.

## Quick start

```tsx
import { LoupePDFViewer } from "@printwithsynergy/loupe-pdf";

export function MyViewer() {
  return <LoupePDFViewer pdfUrl="https://example.com/file.pdf" />;
}
```

That's the whole thing. `<LoupePDFViewer>` auto-discovers page count,
dimensions, and OCG layers from the PDF; renders all pages in a
scrollable list (or one at a time with `mode="single"`); ships a
responsive default toolbar with zoom, layers, color picker, and measure
tool; reflows to a bottom-drawer layout under 768 px wide.

For more control, swap `<LoupePDFViewer>` for the lower-level surface
(`PageCanvas`, `LayerPanel`, `MeasureTool`, etc.) and wire your own
`ViewerHostContext` + `ViewerServicesContext` providers — every
individual component remains exported and unchanged.

For preflight-grade tools (real ink separations, densitometer, TAC
heatmap), pass a `services` prop wired to your backend; the matching
components auto-mount when their service is wired. See
[docs/services.md](./docs/services.md) and the optional reference
server below.

## Demo

Want to see the hide-on-unwired contract in action without setting up your own
host? `demo/` is a tiny Vite app that flips between empty / pdf.js-fallback /
fully-mocked contexts:

```sh
cd demo && npm install && npm run dev
```

See [demo/README.md](./demo/README.md) for the smoke-check checklist.

## Optional reference server

For preflight-grade ink separations, densitometer readings, and TAC
heatmap, deploy the small Node + Ghostscript service in
[`server/`](./server). Wire its endpoints into your `ViewerServices`
and the corresponding components light up. The pdf.js fallback covers
everything else; the reference server covers what pdf.js can't.

```sh
cd server && docker build -t loupe-pdf-server .
docker run -p 3000:3000 -v loupe-jobs:/var/lib/loupe-pdf/jobs loupe-pdf-server
```

See [docs/server.md](./docs/server.md) for the HTTP contract,
deployment notes, and security caveats.

## Documentation

| Topic | Doc |
| --- | --- |
| The one-line `<LoupePDFViewer>` composition | [docs/loupe-pdf-viewer.md](./docs/loupe-pdf-viewer.md) |
| How the contexts, components, and plugins fit together | [docs/architecture.md](./docs/architecture.md) |
| Wiring `ViewerServices` (page images, layers, separations, TAC, color, densitometer, annotations, reports) | [docs/services.md](./docs/services.md) |
| Capability detection, debug logging, and the in-browser PDF fallback | [docs/fallback.md](./docs/fallback.md) |
| Optional Node + Ghostscript backend for preflight-grade tools | [docs/server.md](./docs/server.md) |
| Per-component props and usage | [docs/components.md](./docs/components.md) |
| Plugin slots, registration, and the `replaces` mechanism | [docs/plugins.md](./docs/plugins.md) |
| Built-in `MeasurementUnit`s + custom-unit Protocol | [docs/measurement-units.md](./docs/measurement-units.md) |
| Theme tokens, i18n, telemetry, read-only mode | [docs/theming.md](./docs/theming.md) |
| Boundary rule, provenance, contributing | [docs/contributing.md](./docs/contributing.md) |

## Community

- [CHANGELOG](./CHANGELOG.md) — release notes (Keep-a-Changelog format).
- [CONTRIBUTING](./CONTRIBUTING.md) — quick-start; the full guide is in [docs/contributing.md](./docs/contributing.md).
- [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.
- [SECURITY](./SECURITY.md) — vulnerability disclosure process. **Don't open public issues for security problems.**

## License

LoupePDF is licensed under the GNU Affero General Public License v3.0 or
later (AGPL-3.0-or-later). See [`LICENSE`](./LICENSE) for the full text.

Copyright (C) 2026 Think Neverland LLC.
