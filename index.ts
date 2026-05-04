/**
 * `@printwithsynergy/loupe-pdf` — root barrel.
 *
 * Re-exports every public protocol, component, and unit. Host
 * applications usually import directly from a sub-path (`/host`,
 * `/components`, `/plugin`, `/units`, `/types`) so their bundler
 * only pulls what they use; this convenience barrel exists for
 * smaller embeds that want the whole surface in one import.
 *
 * The viewer is host-agnostic — no SaaS-specific imports, no
 * hardcoded backend paths. Hosts wire their own concrete
 * `ViewerServices` and supply their own host context. See the
 * `core/`-scoped ESLint rule (mirrored in `docs/contributing.md`)
 * for the boundary that keeps it that way.
 *
 * Distributed under AGPL-3.0-or-later.
 *
 * @public
 */

export * from "./plugin";

// Host-level utilities re-exported for convenience.
export {
  defaultUnwiredServices,
  ViewerHostContext,
  ViewerServicesContext,
  useViewerHost,
  useViewerServices,
  useFallbackMode,
} from "./host";
export type { ViewerHostContextValue } from "./host";

export { validatePdfFile, validatePdfUrl } from "./host/pdfValidation";
export type { PdfValidationResult } from "./host/pdfValidation";
export { generateShareLink, parseShareParams } from "./host/shareLink";
export type { ShareLinkOptions, ParsedShareParams } from "./host/shareLink";
export { useLoupePDF } from "./host/useLoupePDF";
export type { UseLoupePDFOptions, UseLoupePDFReturn } from "./host/useLoupePDF";
export { LoupePDFProvider } from "./host/LoupePDFProvider";
export type { LoupePDFProviderProps } from "./host/LoupePDFProvider";
export { pageInfoFromDimensions } from "./types";

export { LoupePDFDemo } from "./components/LoupePDFDemo";
export type {
  LoupePDFDemoProps,
  LoupePDFDemoTool,
} from "./components/LoupePDFDemo";

// Browser-only ViewerServices factory — gives consumers a one-liner
// path to a fully wired viewer without a server backend.
export {
  createBrowserViewerServices,
  defaultBrowserWorkerSrc,
  detectSpotInksFromPdfBytes,
  rgbToCmyk,
  useBrowserViewerServicesVersion,
  PROCESS_CHANNELS,
} from "./browser";
export type {
  BrowserViewerServices,
  BrowserViewerServicesOptions,
  DetectedInk,
} from "./browser";

export { AnnotationCanvas } from "./components/AnnotationCanvas";
export { AnnotationThread } from "./components/AnnotationThread";
export { AnnotationToolbar } from "./components/AnnotationToolbar";
export { BoxOverlay } from "./components/BoxOverlay";
export { ColorPickerTool } from "./components/ColorPickerTool";
export { DensitometerTool } from "./components/DensitometerTool";
export { DielineOverlay } from "./components/DielineOverlay";
export { LayerCanvas } from "./components/LayerCanvas";
export { LayerPanel } from "./components/LayerPanel";
export { LoupePDFViewer } from "./components/LoupePDFViewer";
export type {
  LoupePDFViewerProps,
  LoupePDFViewerState,
  LoupePDFViewerTool,
} from "./components/LoupePDFViewer";
export { MeasureTool } from "./components/MeasureTool";
export { MobileBottomSheet } from "./components/MobileBottomSheet";
export { MobileDrawer } from "./components/MobileDrawer";
export { PageCanvas } from "./components/PageCanvas";
export { PageNavigator } from "./components/PageNavigator";
export { SeparationCanvas } from "./components/SeparationCanvas";
export { TACHeatmapOverlay } from "./components/TACHeatmapOverlay";
export { ZoomControls } from "./components/ZoomControls";

// Built-in MeasurementUnit definitions consumed by MeasureTool.
export {
  agateUnit,
  allMeasurementUnits,
  defaultMeasurementUnits,
  inchUnit,
  mmUnit,
  picaUnit,
  pointUnit,
} from "./units";
