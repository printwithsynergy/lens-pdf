import { defineConfig } from "vitest/config";

// Root-level vitest config. The lens-pdf React library's tests live
// under adapters/, plugin/, browser/, etc. The `server/` directory
// is an *independently-installed* Node package (its own
// package.json + node_modules); vitest run from root would otherwise
// scan into it and try to evaluate `import 'hono'` in an environment
// where hono isn't installed. Exclude it explicitly.
export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "server/**",
    ],
  },
});
