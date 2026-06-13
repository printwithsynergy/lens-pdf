---
title: "Fallback & capability detection"
description: "Tools self-hide when their backing service is unwired. Hosts can opt into graceful degradation with the in-browser pdf.js fallback adapter for page rendering, layers, and color sampling."
group: "Reference"
order: 4
---

# Fallback behaviour & capability detection

LensPDF's components no longer all render the same regardless of what the
host wired. Instead each component picks one of three modes per render:

| Mode       | When                                                                                  | Render                                  |
| ---------- | ------------------------------------------------------------------------------------- | --------------------------------------- |
| `wired`    | Host supplied a real implementation for the backing service.                          | Normal — use the service.               |
| `fallback` | Service is unwired **and** `host.pdfFallback` is set.                                 | Use the in-browser fallback adapter.    |
| `hidden`   | Service is unwired **and** no `pdfFallback` is set (or no fallback exists for it).    | `return null` — the component disappears. |

The distinction matters: a host that wires a real service and gets back an
empty list still renders an empty state ("This PDF has no optional content
layers"), because the host explicitly opted in. A host that didn't wire the
service at all gets nothing — no panel, no menu item, no inert button.

## Capability detection

The default services exported from `@printwithsynergy/lens-pdf/host` are
tagged with a non-enumerable symbol marker. `isUnwired(service)` returns
`true` for any of those defaults and `false` for anything a host substitutes
in. Components use this to choose their render mode.

The full set of unwired defaults is available as a single object:

```ts
import { defaultUnwiredServices } from "@printwithsynergy/lens-pdf/host";
```

Spread it and override only the services your host provides — no need
to manually `markUnwired` each field:

```ts
import { isUnwired, useViewerServices } from "@printwithsynergy/lens-pdf/host";

const { layers } = useViewerServices();
if (isUnwired(layers)) {
  // Host didn't wire the LayerService.
}
```

You generally don't need `isUnwired` directly — `useFallbackMode(service)`
takes the service object and returns the three-state mode for you.

## In-browser fallback (pdf.js)

Hosts that want graceful degradation for the base tools can ship a raw PDF
URL plus the bundled pdf.js adapter:

```ts
import { createPdfJsFallback, ViewerHostContext } from "@printwithsynergy/lens-pdf/host";

const fallback = createPdfJsFallback({
  pdfUrl: "/proofs/abc-signed.pdf",
  // Optional — only needed if your bundler hasn't already configured
  // pdf.js's worker.
  workerSrc: "/pdfjs/pdf.worker.min.mjs",
});

<ViewerHostContext.Provider
  value={{
    apiBase: "",
    jobApiBase: "",
    readOnly: true,
    pdfUrl: "/proofs/abc-signed.pdf",
    pdfFallback: fallback,
    debug: import.meta.env.DEV,
  }}
>
  {children}
</ViewerHostContext.Provider>
```

`pdfjs-dist` is a regular dependency of `@printwithsynergy/lens-pdf` (installed
transitively) and is imported statically by the `./browser` and
`./fallback-pdfjs` entry points — so it only lands in your bundle if you import
one of those entry points.

### What the fallback can do

| Tool / panel       | Wired service       | Falls back?                     |
| ------------------ | ------------------- | ------------------------------- |
| `PageCanvas`       | `pageImages`        | ✅ Renders pages with pdf.js.   |
| `PageNavigator`    | `pageImages`*       | ✅ via `getPageCount()`.         |
| `MeasureTool`      | (none — needs dims) | ✅ via `getPageDimensions()`.    |
| `LayerPanel`       | `layers`            | ✅ via `listLayers()`.           |
| `ColorPickerTool`  | `colorSample`       | ✅ RGB sample only (no TAC).     |
| `SeparationCanvas` | `separations`       | ❌ pdf.js can't split inks.      |
| `DensitometerTool` | `densitometer`      | ❌ pdf.js can't split inks.      |
| `TACHeatmapOverlay`| `tacHeatmap`        | ❌ Needs server-side rendering.  |
| `AnnotationCanvas` | `annotations`       | ❌ Annotations need persistence. |
| `AnnotationThread` | `annotations`       | ❌ Same.                         |
| `MobileDrawer`     | `reports` (links)   | ❌ Report URLs are host-built.   |

\* `PageNavigator` reads page count from the host's page list, but
`getPageCount()` is exposed on the adapter so hosts that build their own
glue can bootstrap the page list from the PDF directly.

The three ❌ rows need real ink-channel separations, which only a
server-side renderer (Ghostscript, MuPDF with separation rendering, etc.)
can produce. pdf.js renders to RGB; there's no path to reconstruct CMYK
from the resulting raster. Those components stay hidden when their
dedicated services are unwired, fallback or no fallback.

For the preflight-grade tools, deploy the optional reference server
under [`server/`](https://github.com/Printwithsynergy/lens-pdf/tree/main/server)
or wire `services.separations` / `services.densitometer` /
`services.tacHeatmap` to your own backend. See
[server.md](./server.md) for the contract and a wiring example.

### Debug logging

Set `debug: true` on the host context (typically `import.meta.env.DEV` or
`process.env.NODE_ENV !== "production"`) and every self-hide gets a
one-shot `console.info`:

```
[lens-pdf] DensitometerTool hidden — host did not wire `services.densitometer`.
Provide an implementation, or set `pdfFallback` on the host context to use the
in-browser PDF fallback.
```

The log is deduped per-component-name so re-renders don't spam the console.
With `debug` off (the default) hidden components are silent.

## Security

LensPDF is a pure renderer. It does not authenticate, sign, or rate-limit
any of the URLs it consumes. Specifically:

- The `pdfUrl` you put on the host context is fetched verbatim by the
  user's browser. If a downstream user shouldn't be able to read that PDF,
  the host must enforce that with signed/expiring/scoped URLs **before**
  handing the URL to the viewer.
- Service URL builders (`getPageImageUrl`, `getChannelImageUrl`, etc.) are
  the same — whatever URL the host returns is what the browser fetches.
- The pdf.js fallback adapter parses the PDF entirely client-side. If the
  PDF blob contains data the user shouldn't see (other pages, hidden
  layers, embedded files), they will be able to extract it via DevTools.
  Strip / redact upstream if that matters.
- The viewer never stores credentials. If your services need auth, do it
  at the URL level (signed query strings, cookies the browser already
  carries, etc.).
- `readOnly: true` hides write-only UI but is **not** a security boundary —
  it's a UX convenience. Enforce write-side authz on the server.

## The service contract (for non-JS hosts)

If you're wiring LensPDF from a PHP, Laravel, Perl, Rails, or any other
backend, your job is just to expose HTTP endpoints that match the shape
each `ViewerService` URL builder calls. There is no SDK to install — the
viewer is decoupled by design. The minimal contract is:

| Service           | Endpoint shape (your choice)                                    | Returns                  |
| ----------------- | --------------------------------------------------------------- | ------------------------ |
| `pageImages`      | `GET /pdf/{job}/page/{n}.png?dpi=N`                             | PNG bytes                |
| `layers`          | `GET /pdf/{job}/layers` + `GET /pdf/{job}/layer/{i}.png?dpi=N`  | JSON list + PNGs         |
| `separations`     | `GET /pdf/{job}/channel/{name}.png?dpi=N`                       | PNG bytes (greyscale)    |
| `tacHeatmap`      | `GET /pdf/{job}/tac.png?dpi=N&limit=L` + `…/tac.json?...`       | PNG + JSON runs          |
| `colorSample`     | `GET /pdf/{job}/color?page=N&x=X&y=Y`                           | `ColorSample` JSON       |
| `densitometer`    | `GET /pdf/{job}/density?page=N&x=X&y=Y&limit=L`                 | `DensitometerSample` JSON |
| `annotations`     | CRUD on `/pdf/{job}/annotations[/id]`                           | `AnnotationEntry` JSON   |
| `reports`         | `GET /pdf/{job}/report.html` + `GET /pdf/{job}/report.pdf`      | Static URLs              |

Pick whatever URL scheme fits your framework's routing. The viewer's
synchronous URL builders just need to produce the right string — they
don't care what's on the other end as long as it returns the documented
content-type.
