---
title: "LoupePDFViewer (one-line viewer)"
description: "High-level one-line viewer entry point. Uses the same full-feature core path as LoupePDF."
group: "Getting started"
order: 3
---

# LoupePDFViewer

`<LoupePDFViewer>` is the alternate name for the same canonical viewer
architecture used by `<LoupePDF>`. Use either name; behavior and props
are aligned.

```tsx
import { LoupePDFViewer } from "@printwithsynergy/loupe-pdf";

export function MyViewer() {
  return <LoupePDFViewer pdfUrl="https://example.com/file.pdf" />;
}
```

## What it does

- One mount for full viewer behavior (page, separations, layers, TAC,
  color picker, densitometer, measure, annotations, plugin slots).
- Uses browser pdf.js services by default and transparently upgrades to
  host-provided services where wired.
- Uses the same core path as `<LoupePDF>` (`controller -> shell -> stage`).

## Props (same as LoupePDF)

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `pdfUrl` | `string` | _(required)_ | PDF URL fetched by the user's browser. |
| `workerSrc` | `string` | _(default worker)_ | Override pdf.js worker URL. |
| `services` | `ViewerServices` | _(browser-backed defaults)_ | Provide backend-authoritative services as needed. |
| `tokens` | `Partial<ThemeTokens>` | `darkThemeTokens` | Theme token overrides. |
| `className` | `string` | _(none)_ | Class on outer shell. |
| `tools` | `ReadonlyArray<LoupePDFTool>` | all | Feature/tool subset. |
| `initialZoom` | `number` | `80` | Starting zoom %. |
| `initialPage` | `number` | `1` | Starting page. |
| `tacLimit` | `number` | `300` | TAC limit for heatmap + densitometer. |
| `items` / `selectedItem` / `onItemSelect` | overlay props | _(none)_ | Preflight finding overlays and selection. |
| `dieline` / `showBoxOverlays` / `cropToTrim` | overlay flags | defaults vary | Print-production overlays and trim clipping. |
| `preset` / `plugins` | shell composition | `minimal` | Plugin-based shell customization. |
| `onPageChange` / `onZoomChange` / `onError` | callbacks | _(none)_ | Lifecycle hooks. |

## Other integration tiers

- **Primary name** — use [`<LoupePDF>`](../README.md#tier-1--drop-in-production-viewer-3-lines).
- **Marketing/upload wrapper** — [`<LoupePDFDemo>`](./components.md#drop-in-demo).
- **Lower-level composition** — `useLoupePDF`, contexts, and component-level APIs.

## Security

`pdfUrl` is fetched by the browser as-is. Sign/scope/expire URLs
upstream according to your auth model. Viewer-side rendering does not
perform access control.
