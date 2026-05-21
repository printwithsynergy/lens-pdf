/**
 * `@printwithsynergy/lens-pdf` — root barrel.
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
export { useLensPDF } from "./host/useLensPDF";
export type { UseLensPDFOptions, UseLensPDFReturn } from "./host/useLensPDF";
export { LensPDFProvider } from "./host/LensPDFProvider";
export type { LensPDFProviderProps } from "./host/LensPDFProvider";
export { pageInfoFromDimensions } from "./types";

export { FindingsSidebar } from "./components/FindingsSidebar";
export type { FindingsSidebarProps } from "./components/FindingsSidebar";
export { DielineInfoPanel } from "./components/DielineInfoPanel";
export type { DielineInfoPanelProps } from "./components/DielineInfoPanel";

// The complete viewer — all viewer state, services, and rendering live
// here. The recommended single-component entry point for hosts
// integrating LensPDF: pass a `pdfUrl` and you have a viewer.
export { LensPDF } from "./components/LensPDF";
export type { LensPDFProps, LensPDFTool } from "./components/LensPDF";

// Thin wrapper that adds upload chrome (URL bar, drag-drop, file
// picker, empty state) on top of <LensPDF>. Powers the lenspdf.com
// showcase; most hosts want <LensPDF> instead.
export { LensPDFDemo } from "./components/LensPDFDemo";
export type {
  LensPDFDemoProps,
  LensPDFDemoTool,
} from "./components/LensPDFDemo";

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
export { AnnotationNotesPanel } from "./components/AnnotationNotesPanel";
export { AnnotationThread } from "./components/AnnotationThread";
export { AnnotationToolbar } from "./components/AnnotationToolbar";
export { BoxOverlay } from "./components/BoxOverlay";
export { ColorPickerTool } from "./components/ColorPickerTool";
export { DensitometerTool } from "./components/DensitometerTool";
export { DielineOverlay } from "./components/DielineOverlay";
export { LayerCanvas } from "./components/LayerCanvas";
export { LayerPanel } from "./components/LayerPanel";
export { LensPDFViewer } from "./components/LensPDFViewer";
export type {
  LensPDFViewerProps,
  LensPDFViewerState,
  LensPDFViewerTool,
} from "./components/LensPDFViewer";
export { MeasureTool } from "./components/MeasureTool";
export { createDefaultShellPlugins } from "./components/defaultShellPlugins";
export { MobileBottomSheet } from "./components/MobileBottomSheet";
export { MobileDrawer } from "./components/MobileDrawer";
export { PageCanvas } from "./components/PageCanvas";
export { PageNavigator } from "./components/PageNavigator";
export { SeparationCanvas } from "./components/SeparationCanvas";
export { TACHeatmapOverlay } from "./components/TACHeatmapOverlay";
export { ZoomControls } from "./components/ZoomControls";
export { pluginsForPreset } from "./components/presets";
export type { LensPDFPresetKind } from "./components/presets";
export {
  computeFeatureAvailability,
  pluginsForSlot,
  resolveShellPlugins,
} from "./components/shellPlugins";
export type {
  LensPDFFeatureAvailability,
  LensPDFShellPlugin,
  LensPDFShellPluginContext,
  LensPDFShellSlot,
} from "./components/shellPlugins";

// Adapters — map raw engine outputs (codex, lint, callas, pitstop) to
// lens types. Re-exported from the root for convenience; the canonical
// import is `@printwithsynergy/lens-pdf/adapters`.
export {
  fromCallasFindings,
  fromCodexFindings,
  fromCodexSummary,
  fromLintFindings,
  fromPitstopFindings,
} from "./adapters";
export type { LensPDFDataConfig } from "./adapters";

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
