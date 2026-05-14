---
title: "Overview"
description: "Host-agnostic OSS PDF viewer core for React 19. A plugin-driven canvas viewer with overlay, panel, and toolbar slots. AGPL-3.0-or-later."
group: "Getting started"
order: 1
slug: "overview"
---

# LensPDF

[![ci](https://github.com/Printwithsynergy/lens-pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/Printwithsynergy/lens-pdf/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](./LICENSE)
[![react](https://img.shields.io/badge/react-19-61dafb.svg?logo=react&logoColor=white)](https://react.dev/)

OSS PDF viewer core. A plugin-driven canvas viewer with overlay, panel, and
toolbar slots, built around React 19. Host-agnostic: the viewer never
imports a SaaS, never hardcodes a backend route, and self-hides any tool
whose backing service the host hasn't wired. AGPL-3.0-or-later.

## Install

LensPDF is published to the public **npm registry** under the
`@printwithsynergy` scope.

```sh
# stable
npm install @printwithsynergy/lens-pdf

# pre-release (current)
npm install @printwithsynergy/lens-pdf@beta
```

Peer dependencies you provide in your host app:

```sh
npm install react react-dom
# Optional — only if you mount AnnotationCanvas / AnnotationThread:
npm install fabric
# Optional — only if you pass a `codex` client for Ghostscript-accurate
# separations / TAC / layers:
npm install @printwithsynergy/codex-client
```

Requires `react@^19` and `react-dom@^19`. `fabric@^7` is an optional peer
used by the annotation components. `@printwithsynergy/codex-client@^1.8.1`
is an optional peer used by the codex accuracy overlay — hosts that
never pass the `codex` prop don't need to install it. `pdfjs-dist@^4`
is a regular dependency — it comes along automatically and powers the
`createBrowserViewerServices` factory exposed at `/browser`. The package
ships ESM only.

## Quick start — pick your tier

LensPDF ships five integration levels. Start with Tier 1 and drop
down only when you need more control.

### Tier 1 — Drop-in production viewer (~3 lines)

`<LensPDF>` is the recommended single-component entry point. One
mount, every viewer-only feature wired to pdf.js out of the box:

- **Page raster** with a multi-DPI tile cache so zoom never
  degrades the image.
- **Color picker** — RGB readout plus a per-ink breakdown (CMYK
  + any spot inks the PDF declares).
- **Densitometer** — per-channel coverage and TAC limit.
- **TAC heatmap** — process CMYK plus every detected spot ink
  summed and visualised.
- **Per-ink separations** — toggle CMYK and any spot plates
  on / off (defaults to all-on like Output Preview).
- **Layers** — OCG list with per-layer visibility.
- **Annotation toolbar / canvas / thread** — pen, arrow, rect,
  ellipse, text, highlight, sticky note, all in-memory.
- **Mobile** — tools collapse into a left-anchored slide-in
  drawer; readouts swap to bottom sheets so they stay legible.

```tsx
import { LensPDF } from "@printwithsynergy/lens-pdf";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";

export function ProofPage() {
  return <LensPDF pdfUrl="/proofs/abc.pdf" workerSrc={pdfWorkerSrc} />;
}
```

Hosts with a preflight engine plug findings + dieline + box overlays
in directly:

```tsx
<LensPDF
  pdfUrl="/proofs/abc.pdf"
  workerSrc={pdfWorkerSrc}
  items={findings}            // OverlayItem[] — error / warning / advisory bboxes
  selectedItem={selected}
  onItemSelect={setSelected}
  dieline={dielineForCurrentPage}
  showBoxOverlays              // trim / bleed / crop popovers
  cropToTrim                   // clip the canvas to TrimBox
  tools={["color-picker", "densitometer", "annotate", "tac-heatmap"]}
  onPageChange={setCurrentPage}
  tokens={{ accent: "#e50c6a" }}
  brand="MyApp"
  brandLogoUrl="/logo.svg"
/>
```

No backend required for the viewer side. Server-only features (HTML /
PDF report exports, ICC-correct preflight separations, server-
persisted annotations) self-hide because their dedicated services are
intentionally `markUnwired`. Hosts with a backend pass `services` to
override the in-browser ones.

### Tier 1b — Demo / showcase viewer

Same component, with an upload bar + drag-drop + URL paste — useful
for marketing pages and internal sandboxes where users bring their
own files.

```tsx
import { LensPDFDemo } from "@printwithsynergy/lens-pdf";

export function DemoPage() {
  return <LensPDFDemo brand="MyApp" brandLogoUrl="/logo.svg" />;
}
```

### Tier 2 — One-liner viewer (~5 lines)

`<LensPDFViewer>` auto-discovers pages, layers, dimensions. Ships
a responsive toolbar with zoom, layers, color picker, and measure.

```tsx
import { LensPDFViewer } from "@printwithsynergy/lens-pdf/components";

export function MyViewer() {
  return <LensPDFViewer pdfUrl="https://cdn.example.com/proof.pdf" />;
}
```

Slot props (`header`, `sidebar`, `footer`) let you replace regions
without losing the rest of the viewer:

```tsx
<LensPDFViewer
  pdfUrl={url}
  header={(state) => <MyToolbar zoom={state.zoom} setZoom={state.setZoom} />}
  footer={<p>Custom footer</p>}
/>
```

### Tier 3 — Hook + Provider (~20 lines)

`useLensPDF()` manages all state; `<LensPDFProvider>` mounts both
contexts. Build any layout you want on top.

```tsx
import { useLensPDF, LensPDFProvider } from "@printwithsynergy/lens-pdf/host";
import { PageCanvas } from "@printwithsynergy/lens-pdf/components";

export function CustomViewer({ url }: { url: string }) {
  const viewer = useLensPDF(url, { tokens: { accent: "#e50c6a" } });

  return (
    <LensPDFProvider value={viewer}>
      <PageCanvas jobId="demo" page={viewer.currentPageInfo} zoom={viewer.zoom} items={[]} selectedItem={null} onItemClick={() => {}} />
    </LensPDFProvider>
  );
}
```

### Tier 4 — Full custom composition

Wire `ViewerHostContext` + `ViewerServicesContext` yourself. Every
component (`PageCanvas`, `LayerPanel`, `MeasureTool`, etc.) is
exported and unchanged.

### Shareable links

Generate URLs that open the viewer with a specific PDF and settings:

```ts
import { generateShareLink, parseShareParams } from "@printwithsynergy/lens-pdf/host";

const link = generateShareLink({
  baseUrl: "https://lenspdf.com/demo",
  pdfUrl: "https://cdn.example.com/proof.pdf",
  fullscreen: true,
  zoom: 150,
});

// On the demo page:
const params = parseShareParams(new URLSearchParams(window.location.search));
// → { pdfUrl: "https://...", fullscreen: true, zoom: 150 }
```

### PDF validation

Client-side checks (magic bytes, MIME, size) are built in:

```ts
import { validatePdfFile, validatePdfUrl } from "@printwithsynergy/lens-pdf/host";

const result = await validatePdfFile(file); // { valid: true } or { valid: false, error: "..." }
```

### Browser-only services (full feature surface, no backend)

`createBrowserViewerServices` returns a complete `ViewerServices`
backed by pdf.js — every viewer-only feature works on any PDF the
browser can fetch:

```tsx
import { createBrowserViewerServices } from "@printwithsynergy/lens-pdf/browser";
import { ViewerServicesContext, ViewerHostContext } from "@printwithsynergy/lens-pdf/host";

const services = createBrowserViewerServices({ pdfUrl: "/proof.pdf" });

<ViewerHostContext.Provider value={{ apiBase: "", jobApiBase: "", readOnly: false }}>
  <ViewerServicesContext.Provider value={services}>
    <PageCanvas ... />
    <SeparationCanvas ... />
    <TACHeatmapOverlay ... />
    {/* etc. */}
  </ViewerServicesContext.Provider>
</ViewerHostContext.Provider>;

services.dispose(); // free blob URLs / pdf.js doc on unmount
```

CMYK / TAC are RGB-derived approximations when no backend is wired.
Spot inks are detected by scanning raw PDF bytes for `/Separation`
and `/DeviceN` colour spaces; each detected spot's coverage is
estimated from its alternate-RGB direction. Good for visual
showcase and casual review, **not** press-grade. For ICC-correct
readings deploy the optional reference server below and pass its
`services` overrides — the components automatically swap from the
browser approximation to ICC-derived data with no markup change.

## Findings + dieline (0.3.0-beta.71 +)

Two built-in components for adapter authors (lint-pdf, callas
pdfToolbox, PitStop, Acrobat, custom rule engines) mapping their
preflight findings into Lens overlays:

- **`FindingsSidebar`** — vertical sidebar that splits items into
  collapsible **Located in viewer** (clickable, draws boxes/numbers
  on the canvas) and **Informational** (no bbox, surfaced as static
  rows). Severity-filter pills along the top.
- **`DielineInfoPanel`** — info card showing source / spot name /
  confidence + per-region size (mm + inches) from a
  `DielineResult`. Pairs with the canvas-side dieline bbox that
  `BoxOverlay` now draws automatically when the same prop is
  passed to `<LensPDF dieline={...}>`.

Plus two helpers exported from `@printwithsynergy/lens-pdf/plugin`:

- **`hasViewerLocation(item)`** — true when the item has a bbox /
  point / regions. Same predicate the canvas uses internally.
- **`splitFindingsByLocation(items)`** — returns
  `{located, informational}` preserving order in each bucket.

```tsx
import {
  LensPDF,
  FindingsSidebar,
  DielineInfoPanel,
} from "@printwithsynergy/lens-pdf";

<div className="flex h-full w-full">
  <FindingsSidebar items={overlayItems} onSelect={setSelected} />
  <LensPDF
    items={overlayItems}
    selectedItem={selected}
    onItemSelect={setSelected}
    dieline={dielineResult}
  />
  <DielineInfoPanel dieline={dielineResult} />
</div>
```

`FindingsSidebar` + `DielineInfoPanel` are no-ops when their data
prop is empty/null so hosts mount them unconditionally — they only
render once real data arrives. Theming honours Lens's brand-* /
slate-* tokens.

## Demo

Want to see the hide-on-unwired contract in action without setting up your own
host? `demo/` is a tiny Vite app that flips between empty / pdf.js-fallback /
fully-mocked contexts:

```sh
cd demo && npm install && npm run dev
```

See [demo/README.md](./demo/README.md) for the smoke-check checklist.

## Optional reference server

For **press-grade ICC-correct** ink separations, densitometer readings,
and TAC heatmap (the browser services use an RGB→CMYK approximation —
fine for showcase, not for prepress sign-off), deploy the small
Node + Ghostscript service in [`server/`](./server). Wire its
endpoints into your `ViewerServices` and the corresponding components
swap from the browser approximation to ICC-derived data.

```sh
cd server && docker build -t lens-pdf-server .
docker run -p 3000:3000 -v lens-jobs:/var/lib/lens-pdf/jobs lens-pdf-server
```

See [docs/server.md](./docs/server.md) for the HTTP contract,
deployment notes, and security caveats.

## Documentation

| Topic | Doc |
| --- | --- |
| The one-line `<LensPDFViewer>` composition | [docs/lens-pdf-viewer.md](./docs/lens-pdf-viewer.md) |
| How the contexts, components, and plugins fit together | [docs/architecture.md](./docs/architecture.md) |
| Wiring `ViewerServices` (page images, layers, separations, TAC, color, densitometer, annotations, reports) | [docs/services.md](./docs/services.md) |
| Capability detection, debug logging, and the in-browser PDF fallback | [docs/fallback.md](./docs/fallback.md) |
| Optional Node + Ghostscript backend for preflight-grade tools | [docs/server.md](./docs/server.md) |
| Per-component props and usage | [docs/components.md](./docs/components.md) |
| Plugin slots, registration, and the `replaces` mechanism | [docs/plugins.md](./docs/plugins.md) |
| Built-in `MeasurementUnit`s + custom-unit Protocol | [docs/measurement-units.md](./docs/measurement-units.md) |
| Theme tokens, i18n, telemetry, read-only mode | [docs/theming.md](./docs/theming.md) |
| Shareable viewer links (`generateShareLink`, `parseShareParams`) | [docs/share-links.md](./docs/share-links.md) |
| Client-side PDF validation (`validatePdfFile`, `validatePdfUrl`) | [docs/validation.md](./docs/validation.md) |
| Boundary rule, provenance, contributing | [docs/contributing.md](./docs/contributing.md) |

## Community

- [CHANGELOG](./CHANGELOG.md) — release notes (Keep-a-Changelog format).
- [CONTRIBUTING](./CONTRIBUTING.md) — quick-start; the full guide is in [docs/contributing.md](./docs/contributing.md).
- [CODE_OF_CONDUCT](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.
- [SECURITY](./SECURITY.md) — vulnerability disclosure process. **Don't open public issues for security problems.**

## License

LensPDF is licensed under the GNU Affero General Public License v3.0 or
later (AGPL-3.0-or-later). See [`LICENSE`](./LICENSE) for the full text.

Copyright (C) 2026 Think Neverland LLC.
