/**
 * `<LensPDFProvider>` — thin context wrapper that mounts both
 * `ViewerHostContext` and `ViewerServicesContext` from a
 * {@link UseLensPDFReturn} value.
 *
 * Pair with {@link useLensPDF} for the "full custom" tier:
 *
 * ```tsx
 * const viewer = useLensPDF(url, { tokens });
 * return (
 *   <LensPDFProvider value={viewer}>
 *     <MyCustomShell>
 *       <PageCanvas ... />
 *     </MyCustomShell>
 *   </LensPDFProvider>
 * );
 * ```
 *
 * @public
 */

import type { ReactNode } from "react";
import { ViewerHostContext, ViewerServicesContext } from "./index";
import type { UseLensPDFReturn } from "./useLensPDF";

/** Props for {@link LensPDFProvider}. */
export interface LensPDFProviderProps {
  /** The return value from {@link useLensPDF}. */
  value: UseLensPDFReturn;
  children: ReactNode;
}

/**
 * Mounts both `ViewerHostContext` and `ViewerServicesContext` from a
 * `useLensPDF()` return value.
 *
 * @public
 */
export function LensPDFProvider({ value, children }: LensPDFProviderProps) {
  return (
    <ViewerHostContext.Provider value={value.hostValue}>
      <ViewerServicesContext.Provider value={value.servicesValue}>
        {children}
      </ViewerServicesContext.Provider>
    </ViewerHostContext.Provider>
  );
}
