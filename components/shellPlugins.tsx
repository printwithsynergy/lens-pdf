"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import type { AnnotationTool } from "./AnnotationToolbar";
import type { LoupePDFDemoTool } from "./LoupePDFDemo";

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
}

export interface LoupePDFFeatureInputs {
  tools: ReadonlyArray<LoupePDFDemoTool>;
  services: ViewerServices | null;
  detectedInkCount: number;
  layerCount: number;
  isUnwired: (service: object | null | undefined) => boolean;
}

export function computeFeatureAvailability({
  tools,
  services,
  detectedInkCount,
  layerCount,
  isUnwired,
}: LoupePDFFeatureInputs): LoupePDFFeatureAvailability {
  const toolSet = new Set<LoupePDFDemoTool>(tools);
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
  detectedInks: Array<{
    name: string;
    type: "process" | "spot";
    /** Synthetic alternate sRGB triplet for the ink. For spots it's
     *  parsed from the PDF's tint transform when available, otherwise
     *  hash-derived. The separations panel uses this as the third
     *  link in the swatch resolution chain after ``spotPalette`` and
     *  the Pantone Gold library. */
    altRgb: [number, number, number];
  }>;
  /** Host-provided spot-color palette — keyed by spot name (case
   *  insensitive). Takes priority over both the Pantone Gold library
   *  and the PDF's ``altRgb``. Hosts that have a richer source of
   *  truth (codex's ``summary.spot_colors.colors[].swatch_hex``, a
   *  callas/PitStop preflight report, an internal swatch DB) pass
   *  values here so the separations panel renders accurate swatches. */
  spotPalette?: Record<string, string>;
  /** Preflight findings to surface inside the viewer's Inspection
   *  panel. Same superset hosts pass to ``<LoupePDF items={...}>``;
   *  the built-in ``findingsPlugin`` filters/groups by tier and lets
   *  the user click a row to focus the matching bbox on the canvas. */
  items?: ReadonlyArray<import("../plugin").OverlayItem>;
  /** Currently-selected finding, if any. */
  selectedItem?: import("../plugin").OverlayItem | null;
  /** Fires when the user clicks a finding row in the Inspection panel. */
  onItemSelect?: (item: import("../plugin").OverlayItem | null) => void;
  /** When true, render the Inspection panel even with no ``items``
   *  (panel shows a "no findings yet" empty state). Useful for hosts
   *  that want a stable layout while a preflight call is in-flight,
   *  or for demos that always advertise the panel slot. Default false
   *  — hosts without preflight don't see an empty section. */
  forceInspectionPanel?: boolean;
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

