# Theme, i18n, telemetry, read-only mode

Three of the `ViewerServices` fields are infrastructure rather than data:
`tokens`, `i18n`, `telemetry`. They always have safe defaults; override
when you need to plug into your brand palette, translation table, or
analytics. The `readOnly` flag lives on `ViewerHostContext` and toggles
write-only UI.

## Theme tokens

```ts
interface ThemeTokens {
  readonly primary: string;   // brand primary
  readonly accent: string;    // brand accent
  readonly bg: string;        // surface background
  readonly fg: string;        // foreground / body text
  readonly border: string;    // hairline border
}
```

`defaultThemeTokens` is a neutral light palette:

```ts
import { defaultThemeTokens } from "@printwithsynergy/loupe-pdf/plugin";

// {
//   primary: "#0f172a",
//   accent:  "#3b82f6",
//   bg:      "#ffffff",
//   fg:      "#0f172a",
//   border:  "#e2e8f0",
// }
```

Pass your own through `services.tokens`:

```ts
const services: ViewerServices = {
  // …
  tokens: {
    primary: "#1a3a7a",
    accent: "#2563eb",
    bg: "#ffffff",
    fg: "#0f172a",
    border: "#e2e8f0",
  },
};
```

Plugins read from `ctx.services.tokens` rather than hardcoding hex
strings, so swapping a brand palette is a single context-value change.

## i18n

```ts
interface I18nService {
  t(key: string, params?: Record<string, string | number>): string;
}
```

The `noopI18n` default returns the key unchanged with `{param}`
placeholders substituted. Drop in a real translator as needed:

```ts
import type { I18nService } from "@printwithsynergy/loupe-pdf/plugin";

export const i18n: I18nService = {
  t: (key, params) => translateWithICU(key, params),
};
```

Suitable for English-only environments and tests, the no-op behaves
like:

```ts
noopI18n.t("hello.name", { name: "Ada" });    // "hello.name"
// (the key is returned because no entry exists; placeholders still
// substitute when present in the key text itself)
```

## Telemetry

```ts
interface TelemetryService {
  track(event: string, properties?: Record<string, unknown>): void;
}
```

`noopTelemetry` drops every event on the floor. Wire your analytics by
overriding:

```ts
import type { TelemetryService } from "@printwithsynergy/loupe-pdf/plugin";

export const telemetry: TelemetryService = {
  track: (event, props) => window.analytics?.track(event, props),
};
```

OSS hosts that don't want to ship analytics can leave the no-op default —
no events will leave the browser.

## Read-only mode

Set `ViewerHostContext.readOnly` to `true` to suppress write-only UI.

```tsx
<ViewerHostContext.Provider
  value={{
    apiBase: "/api/share/abc123",
    jobApiBase: "/api/share/abc123",
    readOnly: true,
  }}
>
  …
</ViewerHostContext.Provider>
```

What flips:

- `AnnotationCanvas` skips its autosave path entirely (reads still work,
  saves are a no-op).
- `MobileDrawer` hides annotation, share, and verdict controls based on
  the same flag.
- Your own host UI should branch on `useViewerHost().readOnly` to hide
  any control that mutates server state.

Public-token / share-link viewers typically run with `readOnly: true` and
a constrained `apiBase` (`/api/share/<token>` etc.), with annotations
read but not written. The annotation service can be wired to a no-op
`saveForPage` / `remove` even when `readOnly` is false, but flipping the
host flag is the standard pattern.
