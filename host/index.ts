/**
 * Viewer host context — the bridge between an embedding application
 * and the core viewer components.
 *
 * Phase 2 (this directory) extracts the context that was previously
 * defined in `src/types.ts` (`ViewerApiContextValue` / `ViewerApiContext`
 * / `useViewerApi`) so `src/core/` no longer needs to import from
 * `../../types`. The boundary rule that blocks `core/` from
 * referencing the LintPDF directory couldn't catch `../../types`
 * imports — this move closes that gap.
 *
 * Phase 3 (LoupePDF) extracts this directory, alongside everything
 * else under `src/core/`, into `@thinkneverland/loupe-pdf`. Hosts
 * (LintPDF SaaS, OSS embeds) supply their own concrete values via
 * `<ViewerHostContext.Provider value={...}>`.
 *
 * The legacy `useViewerApi` / `ViewerApiContext` names are still
 * re-exported from `src/types.ts` so components outside `core/` (and
 * downstream consumers) can keep their existing imports.
 *
 * @public
 */

import { createContext, useContext } from "react";

/**
 * Values the host application supplies to the viewer's core
 * components. Today this is API base URLs + a read-only flag; later
 * PRs in the Phase-2 abstraction stream will replace direct
 * URL-string consumption with `ViewerServices` (page images,
 * annotations, telemetry, i18n, theme tokens) so this surface stays
 * minimal even as the viewer's capabilities grow.
 *
 * @public
 */
export interface ViewerHostContextValue {
  /**
   * Base path for viewer API calls (no trailing slash). LintPDF
   * authenticated mode: ``/api/lintpdf/viewer/{jobId}``. Public-token
   * (share-link) mode: ``/api/lintpdf/viewer/public/{token}``.
   */
  apiBase: string;
  /** Base path for job-level API calls (findings, reports). */
  jobApiBase: string;
  /**
   * When true, hides write-only UI (annotations, verdict, comparison
   * initiation). Public-token / share-link viewers run with this on.
   */
  readOnly: boolean;
}

/**
 * React context object. Default value is intentionally empty so a
 * misconfigured viewer renders nothing surprising — components that
 * read `apiBase` should treat the empty string as "no host wired up".
 *
 * @public
 */
export const ViewerHostContext = createContext<ViewerHostContextValue>({
  apiBase: "",
  jobApiBase: "",
  readOnly: false,
});

/**
 * Hook for reading the current `ViewerHostContextValue`. Returns the
 * default empty values when no provider is mounted.
 *
 * @public
 */
export function useViewerHost(): ViewerHostContextValue {
  return useContext(ViewerHostContext);
}
