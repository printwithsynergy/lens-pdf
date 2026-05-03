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

```sh
npm install @printwithsynergy/loupe-pdf
```

(Or use a git-ref dep against this repo:
`npm install github:Printwithsynergy/loupe-pdf#main`.)

Peer dependencies you provide in your host app:

```sh
npm install react react-dom
# Optional — only if you mount AnnotationCanvas / AnnotationThread:
npm install fabric
# Optional — only if you wire the in-browser PDF fallback (see docs/fallback.md):
npm install pdfjs-dist
```

Requires `react@^19` and `react-dom@^19`. `fabric@^6` and `pdfjs-dist@^4` are
optional peers used by the annotation components and the pdf.js fallback
adapter respectively. The package ships ESM only.

## Quick start

A single-page viewer with a zoom control and a tile canvas.
`ZoomControls` exposes zoom as a percentage (`100`); `PageCanvas` expects a
multiplier (`1.0`). Convert at the boundary as shown.

```tsx
import { useState } from "react";
import {
  PageCanvas,
  ZoomControls,
} from "@printwithsynergy/loupe-pdf/components";
import {
  ViewerHostContext,
  ViewerServicesContext,
} from "@printwithsynergy/loupe-pdf/host";
import type { ViewerServices } from "@printwithsynergy/loupe-pdf/plugin";
import type { PageInfo } from "@printwithsynergy/loupe-pdf/types";

const services = {
  pageImages: {
    getPageImageUrl: ({ pageNum, dpi }) =>
      `/api/pdf/${pageNum}.png?dpi=${dpi}`,
  },
} as ViewerServices;

const page: PageInfo = {
  page_num: 1,
  width_pts: 612,
  height_pts: 792,
  media_box: { x0: 0, y0: 0, x1: 612, y1: 792 },
  crop_box: null,
  trim_box: null,
  bleed_box: null,
  rotation: 0,
};

export function MyViewer() {
  const [zoom, setZoom] = useState(100);
  return (
    <ViewerHostContext.Provider
      value={{ apiBase: "/api/pdf", jobApiBase: "/api/pdf", readOnly: false }}
    >
      <ViewerServicesContext.Provider value={services}>
        <ZoomControls zoom={zoom} onZoomChange={setZoom} />
        <PageCanvas
          jobId="demo"
          page={page}
          zoom={zoom / 100}
          items={[]}
          selectedItem={null}
          onItemClick={() => {}}
        />
      </ViewerServicesContext.Provider>
    </ViewerHostContext.Provider>
  );
}
```

That's enough to render a page tile. From here, wire whichever
`ViewerServices` fields your host supports and mount more components — see
the docs below for everything else.

## Demo

Want to see the hide-on-unwired contract in action without setting up your own
host? `demo/` is a tiny Vite app that flips between empty / pdf.js-fallback /
fully-mocked contexts:

```sh
cd demo && npm install && npm run dev
```

See [demo/README.md](./demo/README.md) for the smoke-check checklist.

## Documentation

| Topic | Doc |
| --- | --- |
| How the contexts, components, and plugins fit together | [docs/architecture.md](./docs/architecture.md) |
| Wiring `ViewerServices` (page images, layers, separations, TAC, color, densitometer, annotations, reports) | [docs/services.md](./docs/services.md) |
| Capability detection, debug logging, and the in-browser PDF fallback | [docs/fallback.md](./docs/fallback.md) |
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
