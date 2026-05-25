"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { ThemeTokens, ViewerServices } from "../plugin/services";
import type { AnnotationTool } from "./AnnotationToolbar";
import type { LensPDFDemoTool } from "./LensPDFDemo";

export type ViewerMode = "page" | "separation" | "layer" | "findings";
export type PointerTool =
  | "none"
  | "color-picker"
  | "densitometer"
  | "measure"
  | "annotate";

export interface LensPDFFeatureAvailability {
  colorPicker: boolean;
  densitometer: boolean;
  measure: boolean;
  annotate: boolean;
  tacHeatmap: boolean;
  separations: boolean;
  layers: boolean;
}

export interface LensPDFFeatureInputs {
  tools: ReadonlyArray<LensPDFDemoTool>;
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
}: LensPDFFeatureInputs): LensPDFFeatureAvailability {
  const toolSet = new Set<LensPDFDemoTool>(tools);
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

export interface LensPDFShellPluginContext {
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
  /** Manual dieline overlay toggle. Independent of viewerMode — when
   *  `true` the dieline draws on top of any canvas mode. When `false`,
   *  dieline only renders in Inspection mode (`viewerMode === "findings"`). */
  showDieline: boolean;
  setShowDieline: Dispatch<SetStateAction<boolean>>;
  /** Manual finding-overlay toggle (bbox highlights + F-number badges
   *  on the canvas). Same gating logic as `showDieline`. */
  showFindings: boolean;
  setShowFindings: Dispatch<SetStateAction<boolean>>;
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
   *  view. Same superset hosts pass to ``<LensPDF items={...}>``;
   *  the built-in Tools panel renders the filtered/grouped list inline
   *  when the user activates Inspection mode and lets them click a row
   *  to focus the matching bbox on the canvas. */
  items?: ReadonlyArray<import("../plugin").OverlayItem>;
  /** Currently-selected finding, if any. */
  selectedItem?: import("../plugin").OverlayItem | null;
  /** Fires when the user clicks a finding row in the Inspection panel. */
  onItemSelect?: (item: import("../plugin").OverlayItem | null) => void;
  /** Selects a finding (or clears with ``null``) and jumps to its page.
   *  Works in both controlled and uncontrolled modes. Prefer this over
   *  calling onItemSelect directly in shell plugins so the page navigation
   *  is always handled. */
  onSelectItem?: (item: import("../plugin").OverlayItem | null) => void;
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
  availability: LensPDFFeatureAvailability;
  /** Stable F1…FN number for every finding, keyed by item.id.
   *  Separate from hand-drawn annotation numbering (#1, #2, …). */
  findingNumbers: ReadonlyMap<string, number>;
  /** Called when the user clicks an F# badge to open a linked note. */
  onFindingNoteRequest?: (id: string) => void;
  /** When non-null, the Notes panel should select this target and
   *  auto-create a blank linked note focused for typing. */
  pendingNoteTarget?: string | null;
  /** Called by the Notes panel once it has consumed pendingNoteTarget. */
  onPendingNoteConsumed?: () => void;
  /** Active decisions keyed by finding id (from lint-pdf decisions API). */
  decisions?: Record<string, import("../plugin/types").DecisionRecord>;
  /** Fires when the user approves / waives / rejects a finding. */
  onDecide?: (
    item: import("../plugin").OverlayItem,
    type: import("../plugin/types").DecisionType,
    notes?: string,
  ) => void;
  /** When true, spell-check findings are hidden from the Inspection panel. */
  hideSpelling?: boolean;
  /** Toggles spell-check visibility. */
  onToggleSpelling?: () => void;
}

export type LensPDFShellSlot = "panel.left" | "overlay.toolbar";

export interface LensPDFShellPlugin {
  id: string;
  slot: LensPDFShellSlot;
  order?: number;
  replaces?: string;
  isAvailable?: (ctx: LensPDFShellPluginContext) => boolean;
  render: (ctx: LensPDFShellPluginContext) => ReactNode;
}

export function resolveShellPlugins(
  plugins: ReadonlyArray<LensPDFShellPlugin>,
): LensPDFShellPlugin[] {
  const byId = new Map<string, LensPDFShellPlugin>();
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
  plugins: ReadonlyArray<LensPDFShellPlugin>,
  slot: LensPDFShellSlot,
  ctx: LensPDFShellPluginContext,
): LensPDFShellPlugin[] {
  return plugins.filter((plugin) => {
    if (plugin.slot !== slot) return false;
    if (!plugin.isAvailable) return true;
    return plugin.isAvailable(ctx);
  });
}


