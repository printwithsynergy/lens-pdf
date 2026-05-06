"use client";

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { DielineResult, PageInfo } from "../types";
import type { ViewerServices } from "../plugin/services";
import type { OverlayItem } from "../plugin/types";
import { AnnotationCanvas } from "./AnnotationCanvas";
import type { AnnotationTool } from "./AnnotationToolbar";
import { BoxOverlay } from "./BoxOverlay";
import { ColorPickerTool } from "./ColorPickerTool";
import { DensitometerTool } from "./DensitometerTool";
import { DielineOverlay } from "./DielineOverlay";
import { LayerCanvas } from "./LayerCanvas";
import { MeasureTool } from "./MeasureTool";
import { PageCanvas } from "./PageCanvas";
import { SeparationCanvas } from "./SeparationCanvas";
import { TACHeatmapOverlay } from "./TACHeatmapOverlay";
import { stageInnerStyle, preparingOverlayStyle } from "./LoupePDFDemo.styles";
import type { LoupePDFShellPlugin, LoupePDFShellPluginContext, ViewerMode } from "./shellPlugins";

interface LoupePDFDemoStageProps {
  isMobile: boolean;
  canvasW: number;
  canvasH: number;
  zoom: number;
  page: PageInfo;
  viewerMode: ViewerMode;
  services: ViewerServices | null;
  enabledChannels: Set<string>;
  enabledLayers: Set<number>;
  allLayerIndices: number[];
  detectedInks: Array<{ name: string }>;
  overlayItems: readonly OverlayItem[];
  effectiveSelected: OverlayItem | null;
  onOverlayItemClick: (item: OverlayItem) => void;
  cropToTrim: boolean;
  showBoxOverlays: boolean;
  dieline: DielineResult | null;
  showHeatmap: boolean;
  tacLimit: number;
  showAnnotate: boolean;
  activeTool: LoupePDFShellPluginContext["activeTool"];
  annotationWrapRef: MutableRefObject<HTMLDivElement | null>;
  annotationTool: AnnotationTool;
  strokeColor: string;
  setSavingAnnotation: Dispatch<SetStateAction<boolean>>;
  onAnnotationHistoryChange: (canUndo: boolean, canRedo: boolean) => void;
  setIndexedAnnotations: Dispatch<
    SetStateAction<
      Array<{
        number: number;
        pageNum: number;
        objectType: string;
        centerX: number;
        centerY: number;
      }>
    >
  >;
  selectedAnnotationId: string | null;
  indexedAnnotations: Array<{
    number: number;
    pageNum: number;
    objectType: string;
    centerX: number;
    centerY: number;
  }>;
  setSelectedAnnotationId: Dispatch<SetStateAction<string | null>>;
  setActiveTool: Dispatch<SetStateAction<LoupePDFShellPluginContext["activeTool"]>>;
  preparing: boolean;
  toolbarOverlayPlugins: LoupePDFShellPlugin[];
  shellPluginContext: LoupePDFShellPluginContext;
}

const FLATTENED_LAYER_INDEX = -1;

/**
 * Canvas/stage composition for `LoupePDFDemo`.
 *
 * Keeps heavy rendering branches outside the demo shell so the demo stays
 * a thin consumer/composer rather than owning core viewer composition logic.
 */
export function LoupePDFDemoStage({
  isMobile,
  canvasW,
  canvasH,
  zoom,
  page,
  viewerMode,
  services,
  enabledChannels,
  enabledLayers,
  allLayerIndices,
  detectedInks,
  overlayItems,
  effectiveSelected,
  onOverlayItemClick,
  cropToTrim,
  showBoxOverlays,
  dieline,
  showHeatmap,
  tacLimit,
  showAnnotate,
  activeTool,
  annotationWrapRef,
  annotationTool,
  strokeColor,
  setSavingAnnotation,
  onAnnotationHistoryChange,
  setIndexedAnnotations,
  indexedAnnotations,
  selectedAnnotationId,
  setSelectedAnnotationId,
  setActiveTool,
  preparing,
  toolbarOverlayPlugins,
  shellPluginContext,
}: LoupePDFDemoStageProps) {
  return (
    <div style={stageInnerStyle}>
      {toolbarOverlayPlugins.length > 0 && (
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 30,
            alignSelf: "center",
            width: isMobile ? "100%" : undefined,
            maxWidth: isMobile ? "100%" : undefined,
            boxSizing: "border-box",
            overflowX: isMobile ? "auto" : undefined,
            WebkitOverflowScrolling: isMobile ? "touch" : undefined,
            paddingLeft: isMobile ? 0 : undefined,
            paddingRight: isMobile ? 0 : undefined,
          }}
        >
          {toolbarOverlayPlugins.map((plugin) => (
            <div key={plugin.id}>{plugin.render(shellPluginContext)}</div>
          ))}
        </div>
      )}
      <div
        style={{
          width: canvasW,
          height: canvasH,
          position: "relative",
          background: "#fff",
          boxShadow:
            "0 24px 60px rgba(0,0,0,0.55), 0 6px 18px rgba(0,0,0,0.3)",
          borderRadius: 4,
        }}
      >
        {viewerMode === "separation" && services ? (
          <SeparationCanvas
            jobId="loupe-pdf-demo"
            pageNum={page.page_num}
            enabledChannels={enabledChannels}
            allChannels={
              detectedInks.length > 0
                ? detectedInks.map((i) => i.name)
                : ["Cyan", "Magenta", "Yellow", "Black"]
            }
            width={canvasW}
            height={canvasH}
          />
        ) : viewerMode === "layer" &&
          services &&
          allLayerIndices.length > 0 &&
          allLayerIndices.every(
            (layerIndex) => layerIndex !== FLATTENED_LAYER_INDEX,
          ) ? (
          <LayerCanvas
            jobId="loupe-pdf-demo"
            pageNum={page.page_num}
            enabledLayers={enabledLayers}
            allLayers={allLayerIndices}
            width={canvasW}
            height={canvasH}
          />
        ) : (
          <PageCanvas
            jobId="loupe-pdf-demo"
            page={page}
            zoom={zoom}
            items={overlayItems}
            selectedItem={effectiveSelected}
            onItemClick={onOverlayItemClick}
            cropToTrim={cropToTrim}
          />
        )}

        {viewerMode === "page" && showBoxOverlays && (
          <BoxOverlay
            page={page}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
            dieline={dieline ?? null}
          />
        )}
        {viewerMode === "page" && dieline && !showBoxOverlays && (
          <DielineOverlay
            page={page}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
            dieline={dieline}
          />
        )}

        {services && showHeatmap && (
          <TACHeatmapOverlay
            jobId="loupe-pdf-demo"
            pageNum={page.page_num}
            width={canvasW}
            height={canvasH}
            pageWidthPts={page.width_pts}
            pageHeightPts={page.height_pts}
            tacLimit={tacLimit}
          />
        )}
        {services && showAnnotate && (
          <div
            ref={annotationWrapRef}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: activeTool === "annotate" ? "auto" : "none",
            }}
          >
            <AnnotationCanvas
              jobId="loupe-pdf-demo"
              pageNum={page.page_num}
              width={canvasW}
              height={canvasH}
              activeTool={annotationTool}
              strokeColor={strokeColor}
              onSavingChange={setSavingAnnotation}
              onHistoryChange={onAnnotationHistoryChange}
              onIndexedAnnotationsChange={setIndexedAnnotations}
              selectedAnnotationNumber={
                selectedAnnotationId?.startsWith("obj-")
                  ? Number(selectedAnnotationId.slice(4))
                  : null
              }
              onSelectedAnnotationNumberChange={(annotationNumber) => {
                setSelectedAnnotationId(
                  annotationNumber != null ? `obj-${annotationNumber}` : null,
                );
              }}
            />
          </div>
        )}
        {showAnnotate &&
          indexedAnnotations.map((row) => {
            const id = `obj-${row.number}`;
            const selected = selectedAnnotationId === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSelectedAnnotationId(id);
                  setActiveTool("annotate");
                }}
                title={`Annotation #${row.number}`}
                style={{
                  position: "absolute",
                  left: Math.max(10, row.centerX - 12),
                  top: Math.max(10, row.centerY - 12),
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  border: selected
                    ? "2px solid rgba(251,191,36,0.98)"
                    : "1px solid rgba(255,255,255,0.82)",
                  background: selected
                    ? "rgba(251,191,36,0.95)"
                    : "rgba(15,23,42,0.9)",
                  color: selected ? "#111827" : "#f8fafc",
                  fontSize: 11,
                  fontWeight: 700,
                  lineHeight: "24px",
                  textAlign: "center",
                  cursor: "pointer",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
                  zIndex: 26,
                  padding: 0,
                }}
              >
                {row.number}
              </button>
            );
          })}
        {activeTool === "color-picker" && (
          <ColorPickerTool
            jobId="loupe-pdf-demo"
            pageNum={page.page_num}
            pageWidthPts={page.width_pts}
            pageHeightPts={page.height_pts}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
          />
        )}
        {activeTool === "densitometer" && (
          <DensitometerTool
            jobId="loupe-pdf-demo"
            pageNum={page.page_num}
            pageWidthPts={page.width_pts}
            pageHeightPts={page.height_pts}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
            tacLimit={tacLimit}
          />
        )}
        {activeTool === "measure" && (
          <MeasureTool
            pageWidthPts={page.width_pts}
            pageHeightPts={page.height_pts}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
          />
        )}

        {preparing &&
          (viewerMode !== "page" || showHeatmap) && (
            <div style={preparingOverlayStyle}>
              Rasterising page &amp; computing CMYK…
            </div>
          )}
      </div>
    </div>
  );
}
