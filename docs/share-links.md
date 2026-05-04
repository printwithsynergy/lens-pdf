---
title: "Shareable links"
description: "Generate and parse shareable viewer URLs that pre-load a specific PDF with custom settings — fullscreen, zoom, page, mode, tools, and theme."
group: "Reference"
order: 9
---

# Shareable links

`generateShareLink()` builds a URL that opens any LoupePDF host page
with a specific PDF pre-loaded and settings applied.
`parseShareParams()` reads those query params back into props your
component can consume.

Both are exported from `@printwithsynergy/loupe-pdf/host`.

## URL format

```
https://loupepdf.com/demo?url=<encoded>&fullscreen=true&zoom=150&page=1&mode=single&theme=dark
```

| Param | Type | Notes |
| --- | --- | --- |
| `url` | URL-encoded string | PDF URL to pre-load. |
| `fullscreen` | `"true"` \| `"1"` | Open in fullscreen (no site chrome). |
| `zoom` | integer | Initial zoom percentage. |
| `page` | integer | Initial page number (1-indexed). |
| `mode` | `"scroll"` \| `"single"` | Defaults to `"scroll"` when absent. |
| `tools` | comma-separated | Subset of tools to enable. |
| `theme` | `"light"` \| `"dark"` \| JSON | Preset name or inline `ThemeTokens`. |

## Generating a link

```ts
import { generateShareLink } from "@printwithsynergy/loupe-pdf/host";

const link = generateShareLink({
  baseUrl: "https://loupepdf.com/demo",
  pdfUrl: "https://cdn.example.com/proof.pdf",
  fullscreen: true,
  zoom: 150,
  page: 2,
});
// → "https://loupepdf.com/demo?url=https%3A%2F%2Fcdn.example.com%2Fproof.pdf&fullscreen=true&zoom=150&page=2"
```

### `ShareLinkOptions`

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `baseUrl` | `string` | required | Host demo/viewer page URL. |
| `pdfUrl` | `string` | required | PDF URL to pre-load. |
| `fullscreen` | `boolean` | `false` | Fixed-position full-viewport. |
| `zoom` | `number` | _(omitted)_ | Percentage. |
| `page` | `number` | _(omitted)_ | 1-indexed page. |
| `mode` | `"scroll" \| "single"` | `"scroll"` | Only serialised when not `"scroll"`. |
| `tools` | `string[]` | _(omitted)_ | Comma-joined in URL. |
| `theme` | `"light" \| "dark" \| Partial<ThemeTokens>` | _(omitted)_ | Preset name or JSON-encoded tokens. |

## Parsing on the consumer side

```ts
import { parseShareParams } from "@printwithsynergy/loupe-pdf/host";

const params = parseShareParams(new URLSearchParams(window.location.search));

// params.pdfUrl      → "https://cdn.example.com/proof.pdf"
// params.fullscreen  → true
// params.zoom        → 150
// params.page        → 2
```

### `ParsedShareParams`

| Field | Type | Notes |
| --- | --- | --- |
| `pdfUrl` | `string \| undefined` | |
| `fullscreen` | `boolean` | Defaults to `false`. |
| `zoom` | `number \| undefined` | |
| `page` | `number \| undefined` | |
| `mode` | `"scroll" \| "single" \| undefined` | |
| `tools` | `string[] \| undefined` | |
| `theme` | `"light" \| "dark" \| Partial<ThemeTokens> \| undefined` | |

## End-to-end with `<LoupePDFDemo>`

Wire `parseShareParams` into `<LoupePDFDemo>` props:

```tsx
import { LoupePDFDemo } from "@printwithsynergy/loupe-pdf/components";
import { parseShareParams } from "@printwithsynergy/loupe-pdf/host";

export function DemoPage() {
  const params = parseShareParams(new URLSearchParams(window.location.search));

  return (
    <LoupePDFDemo
      brand="MyApp"
      initialPdfUrl={params.pdfUrl}
      fullscreen={params.fullscreen}
      initialZoom={params.zoom ?? 80}
      initialPage={params.page}
    />
  );
}
```

Users can now share links like
`https://myapp.com/demo?url=https://cdn.example.com/proof.pdf&fullscreen=true`
that open the viewer full-screen with the PDF pre-loaded.
