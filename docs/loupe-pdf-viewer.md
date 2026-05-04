---
title: "LoupePDFViewer (one-line viewer)"
description: "Default high-level composition. One JSX line gets you a working multi-page PDF viewer with auto-discovered pages, layers, zoom, color picker, and measure tool."
group: "Getting started"
order: 3
---

# LoupePDFViewer

The default composition. Drop it into any React 19 project and you have
a working PDF viewer — no host-context wiring, no per-page mounting, no
worrying about pdf.js workers.

```tsx
import { LoupePDFViewer } from "@printwithsynergy/loupe-pdf";

export function MyViewer() {
  return <LoupePDFViewer pdfUrl="https://example.com/file.pdf" />;
}
```

## What it does

- Builds a pdf.js fallback adapter from `pdfUrl` and configures the
  worker URL.
- Wraps `ViewerHostContext` and (optionally) `ViewerServicesContext`.
- Auto-discovers page count, page dimensions, and OCG layers from the
  PDF.
- Renders every page in a scrollable, lazy-loaded virtual list (or
  one at a time with `mode="single"`).
- Seeds initial layer state from the PDF's defaults (default-on
  layers enabled, default-off off).
- Ships a responsive default toolbar with zoom, layers, color picker,
  and measure tool.
- Reflows to a bottom-drawer layout under 768 px wide.

## Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `pdfUrl` | `string` | required | PDF URL fetched by the user's browser. **Sign / scope upstream** — see [Security](#security). |
| `workerSrc` | `string` | `defaultPdfWorkerSrc` (unpkg, pinned to bundled pdfjs-dist version) | Override to self-host the pdf.js worker. |
| `services` | `ViewerServices` | _(unset)_ | Pass when your host has a backend with separations / densitometer / TAC / annotations / reports. Components for unwired services hide silently. |
| `tokens` | `ThemeTokens` | `defaultThemeTokens` | Brand palette. |
| `className` | `string` | `""` | Class hook on the outer shell. |
| `mode` | `"scroll"` \| `"single"` | `"scroll"` | Page rendering mode. |
| `tools` | `ReadonlyArray<"zoom"\|"layers"\|"color-picker"\|"measure">` | all four | Toolbar contents. Pass `[]` for no toolbar. |
| `initialZoom` | `number` | `100` | Starting zoom percent. |

## What gets hidden when no services are wired

The composition relies on the host-agnostic capability-detection
contract from [fallback.md](./fallback.md). With only `pdfUrl` set:

| Component | Visible | Notes |
| --- | --- | --- |
| Page rendering, navigation, zoom | ✅ | pdf.js fallback. |
| Layer panel | ✅ if PDF has OCGs | pdf.js fallback. |
| Color picker | ✅ | RGB only (no TAC). |
| Measure tool | ✅ | Page dimensions from PDF. |
| Separations | ❌ hidden | Needs a backend; pdf.js renders RGB only. |
| Densitometer | ❌ hidden | Same. |
| TAC heatmap | ❌ hidden | Same. |
| Annotations | ❌ hidden | Needs persistence. |
| Report links | ❌ hidden | Needs a backend. |

Pass `services` to wire the backend-dependent ones. The reference
server in [`server/`](https://github.com/Printwithsynergy/loupe-pdf/tree/main/server)
is a turnkey option — see [server.md](./server.md).

## Custom layouts

`<LoupePDFViewer>` is purely additive. The lower-level surface stays
exactly as before — for bespoke layouts compose `PageCanvas`,
`LayerPanel`, `MeasureTool`, `ColorPickerTool`, etc. with your own
context providers. See [components.md](./components.md) for the per-
component reference.

## Security

The `pdfUrl` you pass is fetched verbatim by the user's browser. If a
user shouldn't be able to read that PDF, the host must enforce that
upstream — sign the URL, scope it, expire it. The viewer is a pure
renderer and doesn't authenticate anything.

The pdf.js worker is loaded from unpkg by default. For deployments
that can't reach unpkg (intranet, air-gapped CI, strict CSPs), set
`workerSrc` to a self-hosted URL or import the worker into your app's
build and pass its bundler-resolved URL.
