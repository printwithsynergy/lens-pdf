"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { ThemeTokens } from "../plugin/services";
import {
  emptyStateStyle,
  headingStyle,
  layoutStyle,
  pageNavBtnStyle,
  pageNavStyle,
  sidebarStyle,
  stageStyle,
} from "./LoupePDFDemo.styles";
import { LoupePDFDemoStage } from "./LoupePDFDemoStage";
import type { LoupeViewerControllerResult } from "./useLoupeViewerController";

export interface LoupePDFViewerShellProps {
  controller: LoupeViewerControllerResult;
  tokens: ThemeTokens;
  isMobile: boolean;
  pdfUrl: string;
  cropToTrim?: boolean;
  showBoxOverlays?: boolean;
  tacLimit?: number;
  dieline?: import("../types").DielineResult | null;
  overlayItems?: readonly import("../plugin/types").OverlayItem[];
  effectiveSelected?: import("../plugin/types").OverlayItem | null;
  onOverlayItemClick?: (item: import("../plugin/types").OverlayItem) => void;
  emptyState?: ReactNode;
}

export function LoupePDFViewerShell({
  controller,
  tokens,
  isMobile,
  pdfUrl,
  cropToTrim = false,
  showBoxOverlays = false,
  tacLimit = 300,
  dieline = null,
  overlayItems = [],
  effectiveSelected = null,
  onOverlayItemClick = () => {},
  emptyState,
}: LoupePDFViewerShellProps) {
  const {
    pageCount,
    currentPage,
    setCurrentPage,
    zoom,
    setZoom,
    leftPanelPlugins,
    toolsLoading,
    stagePan,
    canvasW,
    canvasH,
    page,
    viewerMode,
    services,
    enabledChannels,
    enabledLayers,
    allLayerIndices,
    detectedInks,
    showHeatmap,
    activeTool,
    annotationWrapRef,
    annotationTool,
    strokeColor,
    setSavingAnnotation,
    handleAnnotationHistoryChange,
    setIndexedAnnotations,
    indexedAnnotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    setActiveTool,
    preparing,
    toolbarOverlayPlugins,
    shellPluginContext,
    showAnnotate,
  } = controller;
  const hasAnyTool = leftPanelPlugins.length > 0;
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div style={{ ...layoutStyle, position: "relative" }}>
      {hasAnyTool && isMobile && mobileSidebarOpen && (
        <div
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            top: 0,
            zIndex: 140,
            background: "rgba(0, 0, 0, 0.72)",
          }}
        />
      )}
      {hasAnyTool && isMobile && !mobileSidebarOpen && (
        <button
          type="button"
          aria-label="Open tools panel"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            left: "auto",
            zIndex: 60,
            width: 44,
            height: 44,
            borderRadius: 8,
            border: `1px solid ${tokens.border}`,
            background: tokens.bg,
            color: tokens.fg,
            cursor: "pointer",
            fontSize: 22,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
          }}
          onClick={() => setMobileSidebarOpen(true)}
        >
          {"\u2630"}
        </button>
      )}
      {hasAnyTool && (
        <aside
          style={
            isMobile
              ? {
                  ...sidebarStyle(tokens),
                  position: "fixed",
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: "min(85vw, 320px)",
                  maxWidth: "100%",
                  zIndex: 141,
                  transform: mobileSidebarOpen
                    ? "translateX(0)"
                    : "translateX(-100%)",
                  transition: "transform 0.22s ease-out",
                  borderRight: `1px solid ${tokens.border}`,
                  boxShadow: mobileSidebarOpen
                    ? "8px 0 24px rgba(0, 0, 0, 0.45)"
                    : "none",
                  WebkitOverflowScrolling: "touch",
                  overscrollBehavior: "contain",
                  paddingTop: "max(12px, env(safe-area-inset-top))",
                  paddingBottom: "max(16px, env(safe-area-inset-bottom))",
                }
              : sidebarStyle(tokens)
          }
        >
          {isMobile && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                marginBottom: 8,
                position: "sticky",
                top: 0,
                zIndex: 2,
                paddingTop: 2,
                paddingBottom: 8,
                background: tokens.bg,
                borderBottom: `1px solid ${tokens.border}`,
              }}
            >
              <h2 style={{ ...headingStyle, margin: 0 }}>Tools</h2>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                aria-label="Close tools panel"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  border: `1px solid ${tokens.border}`,
                  background: tokens.bg,
                  color: tokens.fg,
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {"\u00D7"}
              </button>
            </div>
          )}
          <div style={pageNavStyle}>
            <span style={{ width: 44 }}>Zoom</span>
            <input
              type="range"
              min="25"
              max="400"
              step="5"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ flex: 1 }}
            />
            <span
              style={{
                minWidth: 44,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {zoom}%
            </span>
          </div>
          {pageCount > 1 && (
            <div style={pageNavStyle}>
              <button
                type="button"
                style={pageNavBtnStyle(tokens, currentPage <= 1)}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Previous page"
              >
                &lsaquo;
              </button>
              <span
                style={{
                  flex: 1,
                  textAlign: "center",
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  opacity: 0.8,
                }}
              >
                Page {currentPage} / {pageCount}
              </span>
              <button
                type="button"
                style={pageNavBtnStyle(tokens, currentPage >= pageCount)}
                onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                disabled={currentPage >= pageCount}
                aria-label="Next page"
              >
                &rsaquo;
              </button>
            </div>
          )}
          {toolsLoading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 0",
                opacity: 0.8,
                fontSize: 12,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.2)",
                  borderTopColor: "rgba(255,255,255,0.75)",
                  animation: "loupe-pdf-tools-spin 0.85s linear infinite",
                }}
              />
              <span>Loading tools…</span>
              <style>{`@keyframes loupe-pdf-tools-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            leftPanelPlugins.map((plugin) => (
              <div key={plugin.id}>{plugin.render(shellPluginContext)}</div>
            ))
          )}
        </aside>
      )}

      <section
        ref={stagePan.scrollRef}
        onMouseDown={stagePan.onMouseDown}
        onMouseMove={stagePan.onMouseMove}
        onMouseUp={stagePan.onMouseUp}
        onMouseLeave={stagePan.onMouseLeave}
        style={{
          ...stageStyle,
          cursor: stagePan.cursor,
          userSelect: stagePan.userSelect,
          ...(isMobile
            ? {
                padding: "12px 8px",
                paddingBottom: "max(12px, env(safe-area-inset-bottom))",
                gap: 8,
              }
            : {}),
        }}
      >
        {!pdfUrl ? (
          emptyState ?? (
            <div style={emptyStateStyle}>
              <h2 style={{ ...headingStyle, margin: 0 }}>No PDF loaded</h2>
            </div>
          )
        ) : (
          <LoupePDFDemoStage
            isMobile={isMobile}
            canvasW={canvasW}
            canvasH={canvasH}
            zoom={zoom}
            page={page}
            viewerMode={viewerMode}
            services={services}
            enabledChannels={enabledChannels}
            enabledLayers={enabledLayers}
            allLayerIndices={allLayerIndices}
            detectedInks={detectedInks}
            overlayItems={overlayItems}
            effectiveSelected={effectiveSelected}
            onOverlayItemClick={onOverlayItemClick}
            cropToTrim={cropToTrim}
            showBoxOverlays={showBoxOverlays}
            dieline={dieline}
            showHeatmap={showHeatmap}
            tacLimit={tacLimit}
            showAnnotate={showAnnotate}
            activeTool={activeTool}
            annotationWrapRef={annotationWrapRef}
            annotationTool={annotationTool}
            strokeColor={strokeColor}
            setSavingAnnotation={setSavingAnnotation}
            onAnnotationHistoryChange={handleAnnotationHistoryChange}
            setIndexedAnnotations={setIndexedAnnotations}
            indexedAnnotations={indexedAnnotations}
            selectedAnnotationId={selectedAnnotationId}
            setSelectedAnnotationId={setSelectedAnnotationId}
            setActiveTool={setActiveTool}
            preparing={preparing}
            toolbarOverlayPlugins={toolbarOverlayPlugins}
            shellPluginContext={shellPluginContext}
          />
        )}
      </section>
    </div>
  );
}
