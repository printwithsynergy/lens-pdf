/**
 * `<LoupePDFProvider>` — thin context wrapper that mounts both
 * `ViewerHostContext` and `ViewerServicesContext` from a
 * {@link UseLoupePDFReturn} value.
 *
 * Pair with {@link useLoupePDF} for the "full custom" tier:
 *
 * ```tsx
 * const viewer = useLoupePDF(url, { tokens });
 * return (
 *   <LoupePDFProvider value={viewer}>
 *     <MyCustomShell>
 *       <PageCanvas ... />
 *     </MyCustomShell>
 *   </LoupePDFProvider>
 * );
 * ```
 *
 * @public
 */

import type { ReactNode } from "react";
import { ViewerHostContext, ViewerServicesContext } from "./index";
import type { UseLoupePDFReturn } from "./useLoupePDF";

/** Props for {@link LoupePDFProvider}. */
export interface LoupePDFProviderProps {
  /** The return value from {@link useLoupePDF}. */
  value: UseLoupePDFReturn;
  children: ReactNode;
}

/**
 * Mounts both `ViewerHostContext` and `ViewerServicesContext` from a
 * `useLoupePDF()` return value.
 *
 * @public
 */
export function LoupePDFProvider({ value, children }: LoupePDFProviderProps) {
  return (
    <ViewerHostContext.Provider value={value.hostValue}>
      <ViewerServicesContext.Provider value={value.servicesValue}>
        {children}
      </ViewerServicesContext.Provider>
    </ViewerHostContext.Provider>
  );
}
