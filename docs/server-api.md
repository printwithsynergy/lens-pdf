---
title: "Server API"
description: "Viewer link generation and annotation CRUD in the Loupe reference backend."
group: "Backend"
order: 2
slug: "server-api"
---

# Server API

`loupe-pdf/server` now exposes two integration APIs:

- `POST /viewer-links` to generate hosted viewer URLs from config.
- Annotation CRUD under `/jobs/:jobId/annotations`.

All endpoints run behind the auth mode configured by `LOUPE_AUTH_MODE`.

## Auth modes

| Mode | Behavior |
| --- | --- |
| `internal` | Trusted internal requests only. |
| `bearer` | Requires `Authorization: Bearer <token>`. |
| `api-key` | Requires `x-api-key: <key>`. |
| `hybrid` | Allows trusted internal OR bearer/api-key. |

Related env vars:

- `LOUPE_AUTH_MODE` (`internal`, `bearer`, `api-key`, `hybrid`)
- `LOUPE_BEARER_TOKEN`
- `LOUPE_API_KEY`
- `LOUPE_INTERNAL_TOKEN` (optional explicit internal secret)

## Link generation API

### Request

`POST /viewer-links`

```json
{
  "viewerBaseUrl": "https://loupepdf.com/demo",
  "source": "internal",
  "jobId": "job_123",
  "pdfUrl": "https://cdn.example.com/proof.pdf",
  "page": 1,
  "zoom": 125,
  "tool": "measure",
  "mode": "page",
  "extras": {
    "api_base": "https://loupe-api.internal"
  }
}
```

### Response

```json
{
  "viewer_url": "https://loupepdf.com/demo?source=internal&job_id=job_123&url=...",
  "viewer_base_url": "https://loupepdf.com/demo",
  "query": {
    "source": "internal",
    "job_id": "job_123"
  },
  "expires_at": null,
  "metadata": {}
}
```

## Annotation CRUD API

### Endpoints

- `GET /jobs/:jobId/annotations`
- `GET /jobs/:jobId/annotations/:annotationId`
- `POST /jobs/:jobId/annotations`
- `PUT /jobs/:jobId/annotations/:annotationId`
- `DELETE /jobs/:jobId/annotations/:annotationId`

Compatibility endpoints used by `AnnotationService` adapters:

- `GET /jobs/:jobId/annotations/page/:pageNum?authorEmail=...`
- `POST /jobs/:jobId/annotations/page/:pageNum`

## Simple usage

```ts
import { createLoupeServerApiClient } from "@printwithsynergy/loupe-pdf/host";

const api = createLoupeServerApiClient({
  apiBase: "https://loupe-api.internal",
  bearerToken: process.env.LOUPE_API_TOKEN,
});

const link = await api.generateViewerLink({
  viewerBaseUrl: "https://loupepdf.com/demo",
  source: "internal",
  jobId: "job_123",
});
```

## Complex usage (viewer + server annotations)

```ts
import {
  createLoupeServerApiClient,
  createServerAnnotationService,
} from "@printwithsynergy/loupe-pdf/host";
import { LoupePDF } from "@printwithsynergy/loupe-pdf";

const api = createLoupeServerApiClient({
  apiBase: "https://loupe-api.internal",
  bearerToken: process.env.LOUPE_API_TOKEN,
});

const annotationService = createServerAnnotationService({
  apiBase: "https://loupe-api.internal",
  bearerToken: process.env.LOUPE_API_TOKEN,
  jobId: "job_123",
  currentUserEmail: "user@example.com",
});

// Combine this annotation service into your ViewerServices object
// along with pageImages/separations/etc from your backend wiring.
```
