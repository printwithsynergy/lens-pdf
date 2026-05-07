# loupe-pdf-server (DEPRECATED)

> **DEPRECATED — 0.3.0-beta.36.** This Ghostscript-backed reference
> server is superseded by [`codex-pdf`](https://pypi.org/project/codex-pdf/),
> which exposes the same surface (page raster, OCG-isolated layers,
> separations, TAC heatmap, color picker, densitometer) over a
> documented HTTP contract with a Python + TypeScript client SDK.
>
> The folder will be removed in `0.4.0`. Anyone still running this
> service should migrate to `codex-pdf >= 1.3.0`. New deploys should
> never pick this up.

## Why

`codex-pdf` is the **canonical PDF byte-level engine** for Think
Neverland tools. It owns:

- `POST /v1/render/page` — one PNG per page with overprint simulation.
- `POST /v1/render/separations` — per-channel rasters from
  `gs -sDEVICE=tiffsep`.
- `POST /v1/render/heatmap` — TAC heatmap PNG + per-text-run readings.
- `POST /v1/render/layer` — OCG-isolated RGBA tile.
- `POST /v1/sample/color` / `POST /v1/sample/density` — point samples.
- `POST /v1/walk/content-stream` / `POST /v1/walk/type4` — analyzer
  side-channels (lint analysers, Type-4 PostScript evaluator).
- SSRF-hardened URL ingestion, Basic + Bearer + API-key + Internal
  auth, content-addressed cache (memory + Redis), a Railway
  Dockerfile, a Python `HttpClient`, and a TS
  `@printwithsynergy/codex-client@1.3.0`.

## Migration

1. Deploy `codex-pdf` (Railway, Fly, your own k8s, etc.). Reference
   config: <https://github.com/printwithsynergy/codex-pdf/blob/main/Dockerfile>
   and <https://github.com/printwithsynergy/codex-pdf/blob/main/railway.toml>.
2. Set `CODEX_API_BASE`, `CODEX_BEARER_TOKEN` (or Basic Auth creds)
   on the codex deployment.
3. Replace consumer code that talked to this server with
   `@printwithsynergy/codex-client`:

   ```ts
   import { HttpClient } from "@printwithsynergy/codex-client";

   const codex = new HttpClient({
     baseUrl: process.env.CODEX_API_BASE,
     bearerToken: process.env.CODEX_API_TOKEN,
   });

   const png = await codex.renderPage(pdfBytes, { page: 1, dpi: 300 });
   const seps = await codex.renderSeparations(pdfBytes, { page: 1 });
   const sample = await codex.sampleDensity(pdfBytes, { x: 100, y: 200 });
   ```

4. Wire `loupe-pdf/browser/index.ts`'s `createBrowserViewerServices`
   with the same `codex` instance — it now consumes the codex client
   exclusively (no pdf.js fallback).
5. Decommission this directory.

## Why removal in 0.4.0

The `loupe-pdf/server/` Ghostscript reference duplicates the codex
implementation, and keeping two copies in sync risks subtle drift
in TAC computation, separation channel ordering, OCG-toggle
semantics, and overprint simulation. Codex is the canonical source.

If you have constraints that block migrating to codex (regulated
environment that can't run a Python service, a self-hosted JS-only
stack, etc.), pin `@printwithsynergy/loupe-pdf @ 0.3.0-beta.34` —
that release still ships the in-browser pdf.js path. New work
should target codex.
