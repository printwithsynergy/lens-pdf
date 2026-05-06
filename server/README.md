# loupe-pdf-server

A small Express + Ghostscript service that supplies the LoupePDF viewer
with everything the in-browser pdf.js fallback can't: real ink
separations (CMYK + spot inks), per-pixel TAC heatmaps, point
densitometer readings, and color samples derived from the actual
rendered raster.

This is a **reference implementation**. Use it directly if it fits, or
read the source as a contract guide and write your own.

## Run

```sh
cd server
npm install
npm run build
LOUPE_JOBS_DIR=/tmp/loupe-jobs LOUPE_CACHE_DIR=/tmp/loupe-cache npm start
```

Or via Docker:

```sh
docker build -t loupe-pdf-server ./server
docker run -p 3000:3000 \
  -v loupe-jobs:/var/lib/loupe-pdf/jobs \
  loupe-pdf-server
```

The image already includes Ghostscript. The only host requirement is
storage for uploaded PDFs (a Docker volume, an EFS mount, etc.).

## Configure

Environment variables, all optional except where noted:

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `LOUPE_JOBS_DIR` | `/var/lib/loupe-pdf/jobs` | Where uploaded PDFs land on disk. |
| `LOUPE_CACHE_DIR` | `/var/cache/loupe-pdf` | Render cache (currently in-memory; reserved for future on-disk caching). |
| `LOUPE_MAX_UPLOAD_MIB` | `100` | Refuse uploads larger than this. |
| `LOUPE_AUTH_MODE` | `internal` | Auth mode for API routes: `internal`, `bearer`, `api-key`, `hybrid`. |
| `LOUPE_BEARER_TOKEN` | unset | Bearer secret used by `bearer` and `hybrid` modes. |
| `LOUPE_API_KEY` | unset | API-key secret used by `api-key` and `hybrid` modes (`x-api-key`). |
| `LOUPE_INTERNAL_TOKEN` | unset | Optional explicit trusted-internal secret (`x-loupe-internal-token`). |
| `LOUPE_VIEWER_BASE_URL` | `https://loupepdf.com/demo` | Default viewer base URL used by `POST /viewer-links`. |
| `GS_BIN` | `gs` | Path / name of the Ghostscript binary. |

## Wire into the viewer

```ts
import type { ViewerServices } from "@printwithsynergy/loupe-pdf/plugin";

const apiBase = "https://separations.example.com";
const jobId = "job-abc";

// Register the PDF before you render anything. This can be done at
// upload time on your own backend rather than inside the viewer.
await fetch(`${apiBase}/jobs/${jobId}/source`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: signedPdfUrl }),
});

// Then point the viewer's services at the same base URL:
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
    listRuns: async () => [], // run-level metadata isn't part of this server yet
  },
  colorSample: {
    sampleAt: async ({ pageNum, pdfX, pdfY, dpi = 150 }) => {
      const r = await fetch(
        `${apiBase}/jobs/${jobId}/color?page=${pageNum}&x=${pdfX}&y=${pdfY}&dpi=${dpi}&pageWidthPts=${pageWidthPts}&pageHeightPts=${pageHeightPts}`,
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
  // …leave layers / annotations / reports unwired or wire them to your own services.
} as ViewerServices;
```

## Viewer link generation API

Generate canonical viewer launch URLs from a config payload:

```sh
curl -X POST "$API_BASE/viewer-links" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $LOUPE_BEARER_TOKEN" \
  -d '{
    "viewerBaseUrl": "https://loupepdf.com/demo",
    "source": "internal",
    "jobId": "job-abc",
    "pdfUrl": "https://cdn.example.com/proof.pdf",
    "page": 1,
    "zoom": 125
  }'
```

Response includes `viewer_url`, normalized query payload, and optional
`expires_at` metadata.

## Endpoint reference

All endpoints are scoped to a `jobId` (1–128 chars of `[a-zA-Z0-9_-]`).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/healthz` | Liveness. |
| `POST` | `/viewer-links` | Build canonical viewer launch URL from config payload. |
| `POST` | `/jobs/{jobId}/source` | Register a PDF. Body: `application/pdf` raw bytes **or** `application/json` `{ "url": "https://…" }` to fetch on the server's behalf. |
| `DELETE` | `/jobs/{jobId}` | Drop cached state for the job. |
| `GET` | `/jobs/{jobId}/annotations` | List annotations for job. |
| `GET` | `/jobs/{jobId}/annotations/{annotationId}` | Get one annotation by id. |
| `POST` | `/jobs/{jobId}/annotations` | Create annotation record. |
| `PUT` | `/jobs/{jobId}/annotations/{annotationId}` | Update annotation record. |
| `DELETE` | `/jobs/{jobId}/annotations/{annotationId}` | Delete annotation record. |
| `GET` | `/jobs/{jobId}/annotations/page/{pageNum}?authorEmail=...` | Get page annotation for one author (AnnotationService compatibility). |
| `POST` | `/jobs/{jobId}/annotations/page/{pageNum}` | Upsert page annotation for one author (AnnotationService compatibility). |
| `GET` | `/jobs/{jobId}/page/{pageNum}.png?dpi=N` | Composite RGB PNG of one page. |
| `GET` | `/jobs/{jobId}/channels?page=N&dpi=N` | List of ink-channel names present on the page. |
| `GET` | `/jobs/{jobId}/channel/{name}.png?page=N&dpi=N` | One per-ink grayscale PNG. |
| `GET` | `/jobs/{jobId}/tac.png?page=N&dpi=N&limit=N` | TAC heatmap PNG (transparent under the limit). |
| `GET` | `/jobs/{jobId}/color?page=N&x=…&y=…&pageWidthPts=…&pageHeightPts=…&dpi=N` | Single-pixel `ColorSample` JSON. |
| `POST` | `/jobs/{jobId}/density` | `DensitometerSample` JSON; body fields: `page`, `x`, `y`, `pageWidthPts`, `pageHeightPts`, `dpi`, `tacLimit`. |

## Security

Read this before exposing the server to anything you don't fully control.

- **Auth is deployment-mode driven** via `LOUPE_AUTH_MODE`. `internal`
  is intended for trusted networks only. `hybrid` lets internal calls
  pass while enforcing bearer/api-key for external callers. Multi-tenant
  authz and audit policy still belong in your gateway/app layer.
- **PDF URL fetching is unguarded**. When a host POSTs
  `{ url: "https://…" }`, the server fetches it as-is. SSRF mitigation
  (block `127.0.0.1`, `169.254.0.0/16`, internal hostnames, etc.) is
  not built in — do it at your egress layer, or avoid the URL flow and
  upload PDFs directly.
- **Ghostscript with `-dSAFER`** is on by default but Ghostscript has
  had sandbox bypasses historically. Run the container with
  `--read-only`, drop capabilities, and treat any uploaded PDF as
  hostile.
- **Resource exhaustion**: a malicious PDF can keep Ghostscript busy.
  The 60-second per-render timeout protects against the most obvious
  cases; pair with a request rate limit and a per-tenant concurrent-
  render cap.
- **PDF storage** is filesystem-based and unencrypted at rest. Use
  encrypted storage if any of the PDFs you process need protection at
  rest.
- **Logs include URLs and sizes**. Don't ship them to a service that
  shouldn't see those.

## Performance notes

- Ghostscript's `tiffsep` device is the bottleneck — 1–4 seconds per
  page at 150 DPI on a 4-core machine, much more for image-heavy
  pages or high DPIs. Prefer 96–150 DPI for viewer tiles, only render
  300+ when the user explicitly zooms in.
- The in-memory cache holds 256 entries / 30 minutes. For multi-pod
  deployments, swap `cache.ts` for a Redis-backed implementation —
  every cacheable surface routes through `getOrRender` helpers in
  `index.ts`, so the change is contained.
- `sharp` decodes channel PNGs once per pixel sample. For
  high-frequency densitometer use, keep one rendered job hot and
  consider returning the channel rasters as raw planar buffers
  cached alongside the PNG.

## Cloudflare / CDN edge caching

Every per-job response is marked **immutable** with a 1-year TTL and
tagged with `Cache-Tag: job-{jobId}`. A given
`(jobId, page, dpi, channel)` tuple never changes — the only way the
content changes is replacing the source PDF, which means a new
`jobId` (or a `DELETE /jobs/{jobId}` followed by re-upload).

Cache headers emitted on cacheable responses:

```
Cache-Control: public, max-age=31536000, immutable, s-maxage=31536000
Cache-Tag: job-{jobId}
```

Cacheable endpoints (GETs only):

- `/jobs/{jobId}/page/{n}.png` — composite RGB
- `/jobs/{jobId}/channel/{name}.png` — per-ink raster
- `/jobs/{jobId}/tac.png` — TAC heatmap
- `/jobs/{jobId}/channels` — channel list JSON
- `/jobs/{jobId}/color` — point sample JSON (deterministic per coord)

POST endpoints (`/jobs/{jobId}/source`, `/jobs/{jobId}/density`) are
non-cacheable per HTTP spec.

### Wiring at Cloudflare

1. **Put the server behind Cloudflare** with proxy mode on (orange
   cloud). The default Cache Rules will respect the `Cache-Control`
   header above and edge-cache for 1 year.
2. **Avoid header auth on cacheable GETs** if you want CDN caching.
   `Authorization` and custom API-key headers commonly bypass shared
   cache tiers. Prefer gateway auth (Cloudflare Access, signed URLs,
   mTLS at origin) so cacheable URL space stays unauthenticated.
3. **Pair `DELETE /jobs/{jobId}` with a Cloudflare purge-by-tag call**
   from your control plane. The tag to purge is `job-{jobId}`. Tag
   purges require Cloudflare Enterprise; on lower plans, purge by URL
   (you'll need to enumerate the tiles your viewer fetched) or rely on
   the immutable URL pattern (new `jobId` = new URLs = no cache hit).
4. **Optional: enable Cloudflare Polish** to recompress PNGs at the
   edge — helpful for the per-channel rasters which are mostly
   grayscale and compress well.

The server emits no `Set-Cookie` headers, so the default Cloudflare
heuristic ("don't cache responses with cookies") doesn't bite.

## Limitations

- ICC output intent embedded in the PDF is honoured by Ghostscript;
  if you need to override it (e.g., always render to GRACoL2006), pass
  `-sDefaultRGBProfile=...` / `-sDefaultCMYKProfile=...` to Ghostscript
  in `ghostscript.ts`. Not exposed via env vars yet.
- The `tacHeatmap.listRuns` per-text-run TAC list isn't implemented —
  the heatmap renders fine, but the hover-tooltip layer in
  `TACHeatmapOverlay` will be empty. Adding it requires walking the
  PDF's text content stream and intersecting each run's bbox with the
  rasterised TAC image.
- Annotations, layers (OCGs), and report exports are not part of this
  server — wire those to your own services.

## License

AGPL-3.0-or-later, same as LoupePDF itself. See [`../LICENSE`](../LICENSE).
