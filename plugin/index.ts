/**
 * Viewer plugin protocol — public surface.
 *
 * @public
 */

export type {
  AnnotationSourceProvider,
  DialogPlugin,
  MeasurementUnit,
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
  AnnotationService,
  I18nService,
  PageImageService,
  TelemetryService,
  ThemeTokens,
  ViewerServices,
} from "./services";

export {
  defaultThemeTokens,
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
