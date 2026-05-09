"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import type { AnnotationTool } from "./AnnotationToolbar";
import type { LoupePDFTool } from "./viewerTools";

export type ViewerMode = "page" | "separation" | "layer";
export type PointerTool =
  | "none"
  | "color-picker"
  | "densitometer"
  | "measure"
  | "annotate";

export interface LoupePDFFeatureAvailability {
  colorPicker: boolean;
  densitometer: boolean;
  measure: boolean;
  annotate: boolean;
  tacHeatmap: boolean;
  separations: boolean;
  layers: boolean;
  /** True when the tool is configured but services are still initialising.
   *  UI should render the button disabled with a loading spinner. */
  colorPickerPending: boolean;
  densitometerPending: boolean;
  tacHeatmapPending: boolean;
  separationsPending: boolean;
  layersPending: boolean;
}

export interface LoupePDFFeatureInputs {
  tools: ReadonlyArray<LoupePDFTool>;
  services: ViewerServices | null;
  detectedInkCount: number;
  layerCount: number;
  isUnwired: (service: object | null | undefined) => boolean;
  /** True when a PDF is loading but no services (pdfjs or codex) are ready yet. */
  toolsPending?: boolean;
}

export function computeFeatureAvailability({
  tools,
  services,
  detectedInkCount,
  layerCount,
  isUnwired,
  toolsPending = false,
}: LoupePDFFeatureInputs): LoupePDFFeatureAvailability {
  const toolSet = new Set<LoupePDFTool>(tools);
  const hasColorSampler = !!services && !isUnwired(services.colorSample);
  const hasDensitometer = !!services && !isUnwired(services.densitometer);
  const hasMeasurement = true;
  const hasAnnotations = !!services && !isUnwired(services.annotations);
  const hasTacHeatmap = !!services && !isUnwired(services.tacHeatmap);
  const hasSeparationService = !!services && !isUnwired(services.separations);
  const hasLayerService = !!services && !isUnwired(services.layers);
  const hasSeparationData = detectedInkCount > 0;
  const hasLayerData = layerCount > 0;
  return {
    colorPicker: toolSet.has("color-picker") && hasColorSampler,
    densitometer: toolSet.has("densitometer") && hasDensitometer,
    measure: toolSet.has("measure") && hasMeasurement,
    annotate: toolSet.has("annotate") && hasAnnotations,
    tacHeatmap: toolSet.has("tac-heatmap") && hasTacHeatmap,
    separations:
      toolSet.has("separations") && hasSeparationService && hasSeparationData,
    layers: toolSet.has("layers") && hasLayerService && hasLayerData,
    colorPickerPending: toolSet.has("color-picker") && toolsPending,
    densitometerPending: toolSet.has("densitometer") && toolsPending,
    tacHeatmapPending: toolSet.has("tac-heatmap") && toolsPending,
    separationsPending: toolSet.has("separations") && toolsPending,
    layersPending: toolSet.has("layers") && toolsPending,
  };
}

export interface LoupePDFShellPluginContext {
  tokens: ThemeTokens;
  isMobile: boolean;
  pdfUrl: string;
  servicesVersion: number;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  viewerMode: ViewerMode;
  setViewerMode: Dispatch<SetStateAction<ViewerMode>>;
  activeTool: PointerTool;
  setActiveTool: Dispatch<SetStateAction<PointerTool>>;
  showHeatmap: boolean;
  setShowHeatmap: Dispatch<SetStateAction<boolean>>;
  enabledChannels: Set<string>;
  setEnabledChannels: Dispatch<SetStateAction<Set<string>>>;
  detectedInks: Array<{ name: string; type: "process" | "spot" }>;
  enabledLayers: Set<number>;
  setEnabledLayers: Dispatch<SetStateAction<Set<number>>>;
  allLayerIndices: number[];
  annotationTool: AnnotationTool;
  setAnnotationTool: Dispatch<SetStateAction<AnnotationTool>>;
  strokeColor: string;
  setStrokeColor: Dispatch<SetStateAction<string>>;
  savingAnnotation: boolean;
  canUndo: boolean;
  canRedo: boolean;
  triggerUndo: () => void;
  triggerRedo: () => void;
  indexedAnnotations: Array<{
    number: number;
    pageNum: number;
    objectType: string;
    centerX: number;
    centerY: number;
  }>;
  selectedAnnotationId: string | null;
  setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
  availability: LoupePDFFeatureAvailability;
}

export type LoupePDFShellSlot = "panel.left" | "overlay.toolbar";

export interface LoupePDFShellPlugin {
  id: string;
  slot: LoupePDFShellSlot;
  order?: number;
  replaces?: string;
  isAvailable?: (ctx: LoupePDFShellPluginContext) => boolean;
  render: (ctx: LoupePDFShellPluginContext) => ReactNode;
}

export function resolveShellPlugins(
  plugins: ReadonlyArray<LoupePDFShellPlugin>,
): LoupePDFShellPlugin[] {
  const byId = new Map<string, LoupePDFShellPlugin>();
  const overrides = new Map<string, string>();
  for (const plugin of plugins) {
    if (byId.has(plugin.id)) {
      throw new Error(`Duplicate shell plugin id: ${plugin.id}`);
    }
    if (plugin.replaces) {
      const existing = overrides.get(plugin.replaces);
      if (existing) {
        throw new Error(
          `Shell plugin override conflict: '${plugin.id}' and '${existing}' both replace '${plugin.replaces}'.`,
        );
      }
      overrides.set(plugin.replaces, plugin.id);
    }
    byId.set(plugin.id, plugin);
  }
  const filtered = Array.from(byId.values()).filter((plugin) => !overrides.has(plugin.id));
  filtered.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return filtered;
}

export function pluginsForSlot(
  plugins: ReadonlyArray<LoupePDFShellPlugin>,
  slot: LoupePDFShellSlot,
  ctx: LoupePDFShellPluginContext,
): LoupePDFShellPlugin[] {
  return plugins.filter((plugin) => {
    if (plugin.slot !== slot) return false;
    if (!plugin.isAvailable) return true;
    return plugin.isAvailable(ctx);
  });
}

