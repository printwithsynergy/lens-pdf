/**
 * `@lintpdf/viewer-shared/core` — future LoupePDF OSS surface.
 *
 * Phase 1 ships the plugin protocol surface. Phase 2 moves the 16
 * pure-core components (`PageCanvas`, `PageNavigator`, `ZoomControls`,
 * `LayerPanel`, `LayerCanvas`, `AnnotationToolbar`, `AnnotationCanvas`,
 * `AnnotationThread`, `ColorPickerTool`, `DensitometerTool`,
 * `DielineOverlay`, `SeparationCanvas`, `BoxOverlay`,
 * `TACHeatmapOverlay`, `MobileBottomSheet`, `MobileDrawer`) under
 * `core/components/` and re-exports them from this barrel.
 *
 * **No LintPDF imports in this namespace.** The `core/`-scoped ESLint
 * rule enforces it. After Phase 3 the contents of this directory ship
 * as `@thinkneverland/loupe-pdf` (MIT).
 *
 * @public
 */

export * from "./plugin";
