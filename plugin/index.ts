/**
 * Viewer plugin protocol — public surface.
 *
 * @public
 */

export type {
  AnnotationSourceProvider,
  DialogPlugin,
  MeasurementUnit,
  OverlayItem,
  OverlayPlugin,
  PanelPlugin,
  ToolbarPlugin,
  ViewerPlugin,
  ViewerPluginManifest,
  ViewerSlot,
} from "./types";

export type {
  ViewerContext,
  ViewerDocumentMetadata,
  ViewerViewport,
} from "./context";

export type {
  AnnotationEntry,
  AnnotationService,
  ColorSampleService,
  DensitometerService,
  I18nService,
  LayerService,
  PageImageService,
  PdfFallbackAdapter,
  ReportsService,
  SeparationService,
  TACHeatmapService,
  TelemetryService,
  ThemeTokens,
  ViewerServices,
} from "./services";

export {
  darkThemeTokens,
  defaultThemeTokens,
  isUnwired,
  markUnwired,
  noopI18n,
  noopTelemetry,
} from "./services";

export {
  _resetRegistryForTesting,
  getPluginsForSlot,
  listAll,
  register,
  unregister,
} from "./registry";
