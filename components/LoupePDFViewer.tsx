"use client";

import { LoupePDF, type LoupePDFProps } from "./LoupePDF";

export type LoupePDFViewerProps = LoupePDFProps;

/**
 * Canonical full-feature viewer.
 *
 * `LoupePDFViewer` now uses the same core architecture as `LoupePDF`,
 * so there is only one implementation path in the package.
 */
export function LoupePDFViewer(props: LoupePDFViewerProps) {
  return <LoupePDF {...props} />;
}
