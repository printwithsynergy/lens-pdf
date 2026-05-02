# LoupePDF

OSS PDF viewer core. A plugin-driven canvas viewer with overlay, panel, and
toolbar slots, built around React 19. Extracted from
`thinkneverland/lint-pdf:packages/viewer-shared/src/core/` (Phase 4 — Q1 2026).

## Install

This repo is currently **private** during the OSS pre-flip period. After the
visibility flip:

```sh
pnpm add @printwithsynergy/loupe-pdf
# or, while private (works as a private GitHub-Packages or git-ref dep):
pnpm add github:Printwithsynergy/loupe-pdf#main
```

Peer dependencies you provide in your host app:

```sh
pnpm add react react-dom
# Optional — only if you mount AnnotationCanvas / AnnotationThread:
pnpm add fabric
```

Requires `react@^19` and `react-dom@^19`. `fabric@^6` is an optional peer used
by the annotation components. The package ships ESM only.

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
| Boundary rule, Phase 4 origin, contributing | [docs/contributing.md](./docs/contributing.md) |

## License

LoupePDF is licensed under the GNU Affero General Public License v3.0 or
later (AGPL-3.0-or-later). See [`LICENSE`](./LICENSE) for the full text.

Copyright (C) 2026 Think Neverland LLC.
