---
title: "Reference server"
description: "Optional Node + Ghostscript backend that supplies real ink separations, densitometer readings, TAC heatmap, and color sampling. Deploy if you need preflight-grade tools the in-browser fallback can't provide."
group: "Reference"
order: 9
---

# Reference server

The viewer's [`SeparationCanvas`](./components.md#separationcanvas),
[`DensitometerTool`](./components.md#densitometertool), and
[`TACHeatmapOverlay`](./components.md#tacheatmapoverlay) all require
real ink-channel rasters. The pdf.js fallback can't produce those —
pdf.js renders to RGB, and there's no in-browser path to reconstruct
CMYK or spot inks from the result. For preflight-grade output you need
a server-side renderer.

The repo ships a small reference implementation under
[`server/`](https://github.com/Printwithsynergy/lens-pdf/tree/main/server)
that you can deploy as-is or read as a contract guide and replace with
your own. It's a Node + Express service that shells out to Ghostscript
(`tiffsep` device) for separation rendering. Auth, rate limiting, and
multi-tenant isolation are deliberately out of scope; run it behind
your gateway.

## Quick start

```sh
git clone https://github.com/Printwithsynergy/lens-pdf
cd lens-pdf/server
docker build -t lens-pdf-server .
docker run -p 3000:3000 -v lens-jobs:/var/lib/lens-pdf/jobs lens-pdf-server
```

`server/README.md` has the full local-development workflow and the
list of environment variables.

## When you need it

| Component | Reference server | pdf.js fallback | Empty |
| --- | --- | --- | --- |
| `PageCanvas` | ✅ | ✅ | hidden |
| `PageNavigator` | ✅ | ✅ | hidden |
| `LayerPanel` | wire your own `layers` service | ✅ | hidden |
| `MeasureTool` | ✅ (page dims via PDF) | ✅ | hidden |
| `ColorPickerTool` | ✅ (true RGB sample) | ✅ (RGB only) | hidden |
| `SeparationCanvas` | **✅ only here** | hidden | hidden |
| `DensitometerTool` | **✅ only here** | hidden | hidden |
| `TACHeatmapOverlay` | **✅ only here** | hidden | hidden |
| `AnnotationCanvas` | wire your own `annotations` service | hidden | hidden |
| Reports | wire your own `reports` service | hidden | hidden |

Mix and match — the host can use the reference server for separations
and the pdf.js fallback for everything else, or wire its own
implementations for any subset.

## Wiring example

Pre-register the PDF on the server (do this server-side at upload
time, not from the browser, so you don't have to expose the source
URL to the user):

```ts
await fetch(`${apiBase}/jobs/${jobId}/source`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: signedPdfUrl }),
});
```

Then point the viewer's services at the same base URL:

```ts
import type { ViewerServices } from "@printwithsynergy/lens-pdf/plugin";

const services: ViewerServices = {
  pageImages: {
    getPageImageUrl: ({ pageNum, dpi }) =>
      `${apiBase}/jobs/${jobId}/page/${pageNum}.png?dpi=${dpi}`,
  },
  separations: {
    getChannelImageUrl: ({ pageNum, channelName, dpi }) =>
      `${apiBase}/jobs/${jobId}/channel/${encodeURIComponent(channelName)}.png?page=${pageNum}&dpi=${dpi}`,
  },
  tacHeatmap: {
    getHeatmapImageUrl: ({ pageNum, dpi, tacLimit }) =>
      `${apiBase}/jobs/${jobId}/tac.png?page=${pageNum}&dpi=${dpi}&limit=${tacLimit}`,
    listRuns: async () => [], // not implemented in the reference server yet
  },
  colorSample: {
    sampleAt: async ({ pageNum, pdfX, pdfY, dpi = 150 }) => {
      const r = await fetch(
        `${apiBase}/jobs/${jobId}/color?page=${pageNum}` +
        `&x=${pdfX}&y=${pdfY}&dpi=${dpi}` +
        `&pageWidthPts=${pageWidthPts}&pageHeightPts=${pageHeightPts}`,
      );
      return r.ok ? await r.json() : null;
    },
  },
  densitometer: {
    sampleAt: async ({ pageNum, pdfX, pdfY, dpi = 150, tacLimit }) => {
      const r = await fetch(`${apiBase}/jobs/${jobId}/density`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: pageNum,
          x: pdfX,
          y: pdfY,
          pageWidthPts,
          pageHeightPts,
          dpi,
          tacLimit,
        }),
      });
      if (!r.ok) {
        if (r.status === 422) throw new Error("No separations available for this page.");
        throw new Error(`Sampling failed (${r.status})`);
      }
      return await r.json();
    },
  },
  // …leave layers / annotations / reports unwired or supply your own.
} as ViewerServices;
```

The viewer doesn't care that any of these came from the same backend —
each `ViewerServices` field is independent and can point anywhere.

## HTTP contract

The reference server is one shape; you can implement any of the
endpoints differently as long as the responses match. The contract:

| Method | Path | Returns |
| --- | --- | --- |
| `POST` | `/jobs/{jobId}/source` | Accept the PDF (raw bytes via `application/pdf`, or `application/json` `{ url }` to fetch). |
| `GET` | `/jobs/{jobId}/page/{n}.png?dpi=N` | Composite RGB PNG. |
| `GET` | `/jobs/{jobId}/channels?page=N` | `{ "channels": ["Cyan", "Magenta", ...] }`. |
| `GET` | `/jobs/{jobId}/channel/{name}.png?page=N&dpi=N` | Grayscale PNG, white = no ink. |
| `GET` | `/jobs/{jobId}/tac.png?page=N&dpi=N&limit=L` | RGBA PNG, transparent under the limit. |
| `GET` | `/jobs/{jobId}/color?page=N&x=X&y=Y&pageWidthPts=W&pageHeightPts=H&dpi=N` | `ColorSample` JSON. |
| `POST` | `/jobs/{jobId}/density` | `DensitometerSample` JSON. Body: `{ page, x, y, pageWidthPts, pageHeightPts, dpi, tacLimit }`. |
| `DELETE` | `/jobs/{jobId}` | Drop server-side state for the job. |

`ColorSample` and `DensitometerSample` shapes are defined in
`@printwithsynergy/lens-pdf/types` — match those exactly.

## Security caveats

The viewer is a pure renderer; the reference server is a thin
Ghostscript wrapper. Authz, rate limiting, multi-tenant isolation, and
SSRF prevention are **your responsibility**. Specifically:

- The optional `LENS_BEARER_TOKEN` is a coarse single-secret check
  meant for private-network deploys. For anything user-facing, run the
  service behind your real gateway.
- The `{ url: "..." }` upload mode fetches whatever URL you give it.
  Block internal hostnames at your egress layer or skip the URL flow
  and upload PDFs directly.
- Treat every uploaded PDF as hostile. Run the container with
  `--read-only`, drop capabilities, set ulimits.
- Ghostscript with `-dSAFER` is the default but historical sandbox
  bypasses exist; isolate the process accordingly.
- The 60 s render timeout protects against the most obvious DoS
  attempts; pair with per-tenant concurrency caps.

See [`server/README.md`](https://github.com/Printwithsynergy/lens-pdf/tree/main/server#security)
for the full list.

## Cloudflare / CDN deployment

Every per-job GET response is marked **immutable** with a 1-year TTL
and tagged with `Cache-Tag: job-{jobId}`:

```
Cache-Control: public, max-age=31536000, immutable, s-maxage=31536000
Cache-Tag: job-{jobId}
```

So putting Cloudflare in front of the server gives you free edge
caching with no extra config — the default Cache Rules will respect
the headers and store responses at the edge for a year.

Two things to watch:

1. **Don't set `LENS_BEARER_TOKEN`** if you want CDN caching. An
   `Authorization` header makes Cloudflare bypass the edge cache.
   Move auth to the gateway tier (Cloudflare Access, signed URLs,
   mTLS at the origin) instead.
2. **`DELETE /jobs/{jobId}` should be paired with a Cloudflare
   purge-by-tag call** from your control plane (tag: `job-{jobId}`).
   On Cloudflare plans without tag purges, rely on the immutable URL
   pattern — a new `jobId` produces new URLs that haven't been cached
   yet.

The reference server's `server/README.md` has the full Cloudflare
deployment writeup.

## Limitations of this reference

- Per-text-run TAC metadata (the hover-tooltip layer of
  `TACHeatmapOverlay`) is not implemented — heatmap renders fine, the
  per-run list is empty.
- ICC output-intent overrides are not exposed as env vars yet.
- The in-process cache is in-memory; multi-pod deployments need to
  swap `cache.ts` for a shared backend (or rely entirely on the
  Cloudflare edge tier).
- Layers (OCGs), annotations, reports — wire those to your own
  services.

If you need any of these, the source is small enough to fork. Pull
requests welcome.
