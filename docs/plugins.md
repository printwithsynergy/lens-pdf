---
title: "Plugin model"
description: "Slot identifiers, plugin shapes, and registration semantics. Includes the replaces mechanism for shadowing first-party plugins with third-party drop-in alternatives."
group: "Reference"
order: 6
---

# Plugin model

LensPDF mounts plugins into nine slots:

- `overlay.canvas` — drawn on top of the page tile.
- `panel.right`, `panel.left`, `panel.bottom` — side / bottom panels.
- `toolbar.top`, `toolbar.left`, `toolbar.bottom` — toolbar pills.
- `annotation.source` — non-visual; supplies annotation data via
  `AnnotationSourceProvider`.
- `dialog.modal` — modal dialog launched from another plugin.

## The manifest

Every plugin shares a manifest:

```ts
interface ViewerPluginManifest {
  id: string;          // "vendor.area.feature"
  version: string;     // semver — bump on protocol-affecting changes
  slot: ViewerSlot;
  replaces?: string;   // shadow another plugin's id in slot lookups
}
```

Visual plugins (overlay / panel / toolbar / dialog) implement
`mount(ctx: ViewerContext): ReactNode`. `AnnotationSourceProvider`
instead provides `subscribe(ctx, onChange)` returning an unsubscribe
callback.

`ViewerContext` carries the live viewer state and the same
`ViewerServices` your host wired up:

```ts
interface ViewerContext {
  readonly page: number;       // 1-indexed current page
  readonly zoom: number;       // multiplier; 1.0 = 100%
  readonly pan: { x: number; y: number };  // CSS px
  readonly viewport: { width: number; height: number };  // CSS px
  readonly selectionBbox: readonly [number, number, number, number] | null;
  readonly document: { pageCount: number; pageDimensions: ReadonlyArray<{ width: number; height: number }> };
  readonly services: ViewerServices;
}
```

## Plugin shapes

### `OverlayPlugin`

```ts
interface OverlayPlugin extends ViewerPluginManifest {
  slot: "overlay.canvas";
  mount(ctx: ViewerContext): ReactNode;
}
```

Use for overlays that draw on top of the page canvas (rulers, finding
boxes, brand-spec violations, etc.).

### `PanelPlugin`

```ts
interface PanelPlugin extends ViewerPluginManifest {
  slot: "panel.right" | "panel.left" | "panel.bottom";
  title: string;       // tab / header label
  order?: number;      // lower renders first
  mount(ctx: ViewerContext): ReactNode;
}
```

### `ToolbarPlugin`

```ts
interface ToolbarPlugin extends ViewerPluginManifest {
  slot: "toolbar.top" | "toolbar.left" | "toolbar.bottom";
  order?: number;
  mount(ctx: ViewerContext): ReactNode;
}
```

### `AnnotationSourceProvider`

Non-visual; supplies annotation data to the viewer. The viewer subscribes
on mount and the provider invokes the callback with the current list and
on every change.

```ts
interface AnnotationSourceProvider extends ViewerPluginManifest {
  slot: "annotation.source";
  subscribe(
    ctx: ViewerContext,
    onChange: (annotations: ReadonlyArray<unknown>) => void,
  ): () => void;     // returns an unsubscribe
}
```

### `DialogPlugin`

```ts
interface DialogPlugin extends ViewerPluginManifest {
  slot: "dialog.modal";
  mount(ctx: ViewerContext): ReactNode;
}
```

## Registering a plugin

```tsx
import { register, type OverlayPlugin } from "@printwithsynergy/lens-pdf/plugin";

const ruler: OverlayPlugin = {
  id: "demo.overlay.ruler",
  version: "0.1.0",
  slot: "overlay.canvas",
  mount(ctx) {
    return <RulerOverlay zoom={ctx.zoom} viewport={ctx.viewport} />;
  },
};

register(ruler);
```

`register` throws if an id is already registered or if a `replaces` claim
collides — both are programmer errors.

`unregister(id)` removes a plugin and frees any `replaces` claim it held.
`listAll()` returns every registered plugin (including the shadowed ones)
for inspection / debugging.

`_resetRegistryForTesting()` is exported for tests only — production code
never calls it.

## Reading plugins back at render-time

The host mounts each slot by calling `getPluginsForSlot(slot)`:

```tsx
import { Fragment } from "react";
import {
  getPluginsForSlot,
  type ViewerContext,
} from "@printwithsynergy/lens-pdf/plugin";

function OverlaySlot({ ctx }: { ctx: ViewerContext }) {
  const plugins = getPluginsForSlot("overlay.canvas");
  return (
    <>
      {plugins.map((p) => (
        <Fragment key={p.id}>{p.mount(ctx)}</Fragment>
      ))}
    </>
  );
}
```

`getPluginsForSlot` returns plugins:

- Sorted by `order` ascending (lowest first); insertion order breaks ties.
- With anything shadowed by a `replaces` claim filtered out.

## Replacing a first-party plugin

When a plugin pack ships a drop-in alternative, set `replaces` on the
override:

```ts
register({
  id: "thirdparty.panel.findings",
  version: "0.1.0",
  slot: "panel.right",
  replaces: "vendor.panel.findings",  // shadow the original
  title: "Findings",
  mount: (ctx) => <ThirdPartyFindings ctx={ctx} />,
});
```

Constraints:

- The replacement must declare the same `slot` as the target. Cross-slot
  overrides are not supported (panels can't replace overlays, etc.).
- At most one plugin can claim a given `replaces` target — a second
  registration that targets the same id throws.
- The target id does not need to be registered yet. The override
  registers cleanly even before the target loads, and starts shadowing
  as soon as the target appears.

## Viewer shell plugins (`LensPDF` / `LensPDFDemo`)

The drop-in components also expose a focused shell-plugin API for
sidebar/menu/tool customization without touching the global plugin
registry.

Import from `@printwithsynergy/lens-pdf/components`:

```ts
type LensPDFShellSlot = "panel.left" | "overlay.toolbar" | "topbar";

interface LensPDFShellPlugin {
  id: string;
  slot: LensPDFShellSlot;
  order?: number;
  replaces?: string;
  isAvailable?: (ctx: LensPDFShellPluginContext) => boolean;
  render: (ctx: LensPDFShellPluginContext) => ReactNode;
}
```

Pass plugins directly:

```tsx
<LensPDF
  pdfUrl="/proofs/abc.pdf"
  plugins={[
    {
      id: "acme.left.custom",
      slot: "panel.left",
      order: 15,
      render: (ctx) => <div>Page {ctx.currentPage}</div>,
    },
  ]}
/>
```

`replaces` uses the same shadow semantics as the global registry:
set `replaces: "<builtin-id>"` to override a first-party shell plugin.

### Shell slots

| Slot | Where it renders | Typical use |
| --- | --- | --- |
| `panel.left` | Tools menu — persistent left sidebar on desktop; hamburger-toggled drawer on mobile. Host `menuActions` render above plugin nodes here. | Mode picker, separations panel, layers panel, annotations panel, custom inspectors. |
| `overlay.toolbar` | Sticky toolbar above the canvas. | Annotation toolbar, sticky tool palettes. |
| `topbar` | Inside `LensTopBar`, to the right of the brand block. | Save-status indicators, search inputs, host-controlled stateful UI. |

For simple link / button actions in the tools menu, prefer the
declarative [`menuActions`](./components.md#tools-menu-menuactions)
prop on `<LensPDF>` — no plugin authoring required.

## `OverlayItem`

Plugins and host adapters translate their domain types — findings,
annotations, brand-spec violations — into `OverlayItem`s before handing
them to a core component. The shape is deliberately minimal:

```ts
interface OverlayItem {
  readonly id: string;
  readonly page: number;                                              // 1-indexed
  readonly bbox?: readonly [number, number, number, number];          // PDF points
  readonly tier?: "error" | "warning" | "advisory" | "info" | "neutral";
  readonly color?: string;                                            // CSS hex, optional override
  readonly label?: string;
  readonly description?: string;
  readonly code?: string;                                             // short identifier code
  readonly data?: Record<string, unknown>;                            // round-trip payload
}
```

`PageCanvas` and `PageNavigator` consume `OverlayItem[]` directly. The
default tier→colour map is `error` red, `warning` amber, `advisory` blue,
`info` / `neutral` slate (see `SEVERITY_COLORS` in `/types`); set `color`
on an item to override per-item.
