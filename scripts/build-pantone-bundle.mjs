#!/usr/bin/env node
/**
 * Removed. As of loupe-pdf 0.3.0-beta.37 / codex-pdf 1.4.0 the
 * Pantone catalogue lives in codex-pdf — fetch it via the codex-
 * client at runtime:
 *
 *   import { HttpClient } from "@printwithsynergy/codex-client";
 *   import { createCodexInkbookAdapter } from "@printwithsynergy/loupe-pdf";
 *
 *   const codex = new HttpClient();
 *   const inkbook = createCodexInkbookAdapter({ codex });
 *   await inkbook.ensure();
 *
 * This script remains as a stub so existing CI invocations don't
 * break; it logs the migration recipe and exits 0.
 */
console.error(
  "[build-pantone-bundle] superseded by codex-pdf 1.4.0+. " +
    "Use codex-client `getInkbook()` / `createCodexInkbookAdapter`. " +
    "This script is now a no-op.",
);
process.exit(0);
