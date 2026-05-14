---
title: "PDF validation"
description: "Client-side PDF validation — magic bytes, MIME type, file size — before handing a file to the viewer or pdf.js fallback. Runs entirely in the browser."
group: "Reference"
order: 10
---

# PDF validation

LensPDF ships client-side validation utilities that run entirely in the
browser. Use them before handing user-supplied files or URLs to the
viewer.

Both are exported from `@printwithsynergy/lens-pdf/host`.

## `validatePdfFile(file, maxBytes?)`

Async. Checks a `File` object:

1. **MIME type** — must be `application/pdf` (or empty — some browsers
   don't populate MIME for drag-dropped files).
2. **Magic bytes** — first 5 bytes must be `%PDF-` (hex `25 50 44 46 2D`).
3. **Size** — must be ≤ `maxBytes` (default: 50 MB).

```ts
import { validatePdfFile } from "@printwithsynergy/lens-pdf/host";

const result = await validatePdfFile(file);
if (!result.valid) {
  console.error(result.error);
}
```

Pass a custom limit:

```ts
const result = await validatePdfFile(file, 100 * 1024 * 1024); // 100 MB
```

## `validatePdfUrl(url)`

Synchronous. Validates URL format only — does not fetch or inspect
headers.

Checks:
1. String is non-empty after trimming.
2. Parses as a valid `URL`.
3. Protocol is `http:`, `https:`, or `blob:`.

```ts
import { validatePdfUrl } from "@printwithsynergy/lens-pdf/host";

const result = validatePdfUrl(draftUrl);
if (!result.valid) {
  setError(result.error);
  return;
}
```

## `PdfValidationResult`

Both functions return the same shape:

```ts
interface PdfValidationResult {
  valid: boolean;
  error?: string; // Human-readable message when valid is false
}
```

## Built-in usage

`<LensPDFDemo>` calls both validators automatically — file uploads go
through `validatePdfFile` and URL submissions go through
`validatePdfUrl`. The `maxFileSize` prop on `LensPDFDemo` is forwarded
to `validatePdfFile`.

## Security note

These checks are **client-side only** and meant to catch user mistakes
early (wrong file type, oversized files, malformed URLs). They are not
a security boundary — a determined user can bypass them. Always validate
and sanitise uploads on the server side when applicable.
