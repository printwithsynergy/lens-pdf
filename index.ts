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

export type { LensPDFDataConfig } from "./adapters";
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
export type {
  BrowserViewerServices,
  BrowserViewerServicesOptions,
  DetectedInk,
} from "./browser";
// Browser-only ViewerServices factory — gives consumers a one-liner
// path to a fully wired viewer without a server backend.
export {
  createBrowserViewerServices,
  defaultBrowserWorkerSrc,
  detectSpotInksFromPdfBytes,
  PROCESS_CHANNELS,
  rgbToCmyk,
  useBrowserViewerServicesVersion,
} from "./browser";
export { AnnotationCanvas } from "./components/AnnotationCanvas";
export { AnnotationNotesPanel } from "./components/AnnotationNotesPanel";
export { AnnotationThread } from "./components/AnnotationThread";
export { AnnotationToolbar } from "./components/AnnotationToolbar";
export { BoxOverlay } from "./components/BoxOverlay";
export { ColorPickerTool } from "./components/ColorPickerTool";
export { DensitometerTool } from "./components/DensitometerTool";
export type { DielineInfoPanelProps } from "./components/DielineInfoPanel";
export { DielineInfoPanel } from "./components/DielineInfoPanel";
export { DielineOverlay } from "./components/DielineOverlay";
export { createDefaultShellPlugins } from "./components/defaultShellPlugins";
export type { FindingsSidebarProps } from "./components/FindingsSidebar";
export { FindingsSidebar } from "./components/FindingsSidebar";
export { LayerCanvas } from "./components/LayerCanvas";
export { LayerPanel } from "./components/LayerPanel";
export type { LensPDFProps, LensPDFTool } from "./components/LensPDF";
// The complete viewer — all viewer state, services, and rendering live
// here. The recommended single-component entry point for hosts
// integrating LensPDF: pass a `pdfUrl` and you have a viewer.
export { LensPDF } from "./components/LensPDF";
export type {
  LensPDFDemoProps,
  LensPDFDemoTool,
} from "./components/LensPDFDemo";
// Thin wrapper that adds upload chrome (URL bar, drag-drop, file
// picker, empty state) on top of <LensPDF>. Powers the lenspdf.com
// showcase; most hosts want <LensPDF> instead.
export { LensPDFDemo } from "./components/LensPDFDemo";
export type {
  LensPDFViewerProps,
  LensPDFViewerState,
  LensPDFViewerTool,
} from "./components/LensPDFViewer";
export { LensPDFViewer } from "./components/LensPDFViewer";
export { MeasureTool } from "./components/MeasureTool";
export { MobileBottomSheet } from "./components/MobileBottomSheet";
export { MobileDrawer } from "./components/MobileDrawer";
export { PageCanvas } from "./components/PageCanvas";
export { PageNavigator } from "./components/PageNavigator";
export type { LensLoadingSkeletonProps } from "./components/PdfSubstrate";
// Default branded loading screen. Mount directly or wrap with
// extra brand chrome. Pass via `<LensPDF loadingPlaceholder={...}>`
// to override the substrate's loading slot, or use as a standalone
// skeleton elsewhere in your app while a PDF metadata fetch is in
// flight.
export { LensLoadingSkeleton } from "./components/PdfSubstrate";
// Default pdf.js worker URL — exposed so hosts can preload it
// alongside their HTML. Imported from a leaf module with NO
// transitive imports (no `pdfjs-dist`, no `react-pdf`) so hosts
// can safely use this constant in SSR contexts like Astro
// frontmatter without crashing on `DOMMatrix is not defined`.
//
// Astro example:
//   <link rel="preload" as="script" href={defaultPdfjsWorkerSrc} crossorigin />
export { defaultPdfjsWorkerSrc } from "./components/pdfjsWorker";
export type { LensPDFPresetKind } from "./components/presets";
export { pluginsForPreset } from "./components/presets";
export { SeparationCanvas } from "./components/SeparationCanvas";
export type {
  LensMenuAction,
  LensPDFFeatureAvailability,
  LensPDFShellPlugin,
  LensPDFShellPluginContext,
  LensPDFShellSlot,
} from "./components/shellPlugins";
export {
  computeFeatureAvailability,
  pluginsForSlot,
  resolveShellPlugins,
} from "./components/shellPlugins";
export { TACHeatmapOverlay } from "./components/TACHeatmapOverlay";
export { ZoomControls } from "./components/ZoomControls";
export type { ViewerHostContextValue } from "./host";
// Host-level utilities re-exported for convenience.
export {
  defaultUnwiredServices,
  useFallbackMode,
  useViewerHost,
  useViewerServices,
  ViewerHostContext,
  ViewerServicesContext,
} from "./host";
export type { LensPDFProviderProps } from "./host/LensPDFProvider";
export { LensPDFProvider } from "./host/LensPDFProvider";
export type { PdfValidationResult } from "./host/pdfValidation";
export { validatePdfFile, validatePdfUrl } from "./host/pdfValidation";
export type { ParsedShareParams, ShareLinkOptions } from "./host/shareLink";
export { generateShareLink, parseShareParams } from "./host/shareLink";
export type { UseLensPDFOptions, UseLensPDFReturn } from "./host/useLensPDF";
export { useLensPDF } from "./host/useLensPDF";
export * from "./plugin";
export { pageInfoFromDimensions } from "./types";

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
