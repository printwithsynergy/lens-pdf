/**
 * `@lintpdf/viewer-shared/core` — future LoupePDF OSS surface.
 *
 * Phase 2 moved the 17 pure-core components (the 16 originally
 * surfaced in the Track B audit + `MeasureTool`, which defaulted
 * to core with a `MeasurementUnit` plugin slot) into
 * `core/components/`. They're re-exported from this barrel.
 *
 * **No LintPDF imports in this namespace.** The `core/`-scoped
 * ESLint rule enforces it. After Phase 3 the contents of this
 * directory ship as `@thinkneverland/loupe-pdf` (MIT).
 *
 * @public
 */

export * from "./plugin";

// Pure-core components moved in Phase 2.
export { AnnotationCanvas } from "./components/AnnotationCanvas";
export { AnnotationThread } from "./components/AnnotationThread";
export { AnnotationToolbar } from "./components/AnnotationToolbar";
export { BoxOverlay } from "./components/BoxOverlay";
export { ColorPickerTool } from "./components/ColorPickerTool";
export { DensitometerTool } from "./components/DensitometerTool";
export { DielineOverlay } from "./components/DielineOverlay";
export { LayerCanvas } from "./components/LayerCanvas";
export { LayerPanel } from "./components/LayerPanel";
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
