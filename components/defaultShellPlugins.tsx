"use client";

import type { ReactNode } from "react";
import { AnnotationNotesPanel } from "./AnnotationNotesPanel";
import { AnnotationThread } from "./AnnotationThread";
import { AnnotationToolbar } from "./AnnotationToolbar";
import { LayerPanel } from "./LayerPanel";
import {
  channelSwatchStyle,
  headingStyle,
  modeButtonGroupStyle,
  modeButtonStyle,
  rowStyle,
} from "./LoupePDFDemo.styles";
import type { LoupePDFShellPlugin, LoupePDFShellPluginContext } from "./shellPlugins";

const PROCESS_SWATCH: Record<string, string> = {
  Cyan: "#00b7eb",
  Magenta: "#ec008c",
  Yellow: "#fdd835",
  Black: "#111827",
};

function ToolRadio({
  label,
  active,
  onToggle,
  swatch,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
  swatch?: ReactNode;
}) {
  return (
    <label style={rowStyle}>
      <input type="radio" checked={active} onChange={onToggle} />
      {swatch ? (
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            height: 14,
            flex: "0 0 auto",
          }}
        >
          {swatch}
        </span>
      ) : null}
      <span>{label}</span>
    </label>
  );
}

const COLOR_PICKER_SWATCH = (
  <span
    style={{
      display: "block",
      width: 14,
      height: 14,
      borderRadius: "50%",
      background:
        "conic-gradient(#ef4444, #f59e0b, #eab308, #22c55e, #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
    }}
  />
);

const DENSITOMETER_SWATCH = (
  <span
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gridTemplateRows: "1fr 1fr",
      width: 14,
      height: 14,
      borderRadius: 2,
      overflow: "hidden",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
    }}
  >
    <span style={{ background: "#00aeef" }} />
    <span style={{ background: "#ec008c" }} />
    <span style={{ background: "#fff200" }} />
    <span style={{ background: "#000000" }} />
  </span>
);

function modeToolsPlugin(): LoupePDFShellPlugin {
  return {
    id: "loupe.mode-and-tools",
    slot: "panel.left",
    order: 10,
    render: (ctx: LoupePDFShellPluginContext) => {
      const {
        tokens,
        viewerMode,
        setViewerMode,
        activeTool,
        setActiveTool,
        availability,
      } = ctx;
      const { separations, layers, colorPicker, densitometer, measure, annotate, tacHeatmap } =
        availability;
      return (
        <>
          {(separations || layers) && (
            <>
              <h2 style={headingStyle}>View</h2>
              <div style={modeButtonGroupStyle()}>
                <button
                  type="button"
                  style={modeButtonStyle(tokens, viewerMode === "page", "left")}
                  onClick={() => setViewerMode("page")}
                >
                  Page
                </button>
                {separations && (
                  <button
                    type="button"
                    style={modeButtonStyle(tokens, viewerMode === "separation", "middle")}
                    onClick={() => setViewerMode("separation")}
                  >
                    Separations
                  </button>
                )}
                {layers && (
                  <button
                    type="button"
                    style={modeButtonStyle(tokens, viewerMode === "layer", "right")}
                    onClick={() => setViewerMode("layer")}
                  >
                    Layers
                  </button>
                )}
              </div>
            </>
          )}

          <h2 style={headingStyle}>Tools</h2>
          <ToolRadio
            label="Move / Pan"
            active={activeTool === "none"}
            onToggle={() => setActiveTool("none")}
          />
          {colorPicker && (
            <ToolRadio
              label="Color picker"
              active={activeTool === "color-picker"}
              onToggle={() =>
                setActiveTool((prev) => (prev === "color-picker" ? "none" : "color-picker"))
              }
              swatch={COLOR_PICKER_SWATCH}
            />
          )}
          {densitometer && (
            <ToolRadio
              label="Densitometer"
              active={activeTool === "densitometer"}
              onToggle={() =>
                setActiveTool((prev) => (prev === "densitometer" ? "none" : "densitometer"))
              }
              swatch={DENSITOMETER_SWATCH}
            />
          )}
          {measure && (
            <ToolRadio
              label="Measure"
              active={activeTool === "measure"}
              onToggle={() =>
                setActiveTool((prev) => (prev === "measure" ? "none" : "measure"))
              }
            />
          )}
          {annotate && (
            <ToolRadio
              label="Annotate"
              active={activeTool === "annotate"}
              onToggle={() =>
                setActiveTool((prev) => (prev === "annotate" ? "none" : "annotate"))
              }
            />
          )}
          {tacHeatmap && (
            <label style={rowStyle}>
              <input
                type="checkbox"
                checked={ctx.showHeatmap}
                onChange={(e) => ctx.setShowHeatmap(e.target.checked)}
              />
              <span>TAC heatmap (limit 300%)</span>
            </label>
          )}
        </>
      );
    },
  };
}

function separationsPlugin(): LoupePDFShellPlugin {
  return {
    id: "loupe.separations-panel",
    slot: "panel.left",
    order: 20,
    isAvailable: (ctx) => ctx.availability.separations && ctx.viewerMode === "separation",
    render: (ctx: LoupePDFShellPluginContext) => (
      <>
        <h2 style={headingStyle}>Inks</h2>
        {ctx.detectedInks.map((ink) => {
          const enabled = ctx.enabledChannels.has(ink.name);
          return (
            <label key={ink.name} style={rowStyle}>
              <input
                type="checkbox"
                checked={enabled}
                onChange={() =>
                  ctx.setEnabledChannels((prev) => {
                    const next = new Set(prev);
                    if (next.has(ink.name)) next.delete(ink.name);
                    else next.add(ink.name);
                    return next;
                  })
                }
              />
              <span
                style={{
                  ...channelSwatchStyle,
                  backgroundColor:
                    ink.type === "process"
                      ? PROCESS_SWATCH[ink.name] ?? "#1f2937"
                      : "#7c3aed",
                }}
              />
              <span>{ink.name}</span>
            </label>
          );
        })}
      </>
    ),
  };
}

function layersPlugin(): LoupePDFShellPlugin {
  return {
    id: "loupe.layers-panel",
    slot: "panel.left",
    order: 30,
    isAvailable: (ctx) => ctx.availability.layers && ctx.viewerMode === "layer",
    render: (ctx: LoupePDFShellPluginContext) => (
      <>
        <h2 style={headingStyle}>Layers</h2>
        <div
          style={{
            border: `1px solid ${ctx.tokens.border}`,
            borderRadius: 8,
            padding: 6,
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          <LayerPanel
            jobId="loupe-pdf-demo"
            enabledLayers={ctx.enabledLayers}
            onToggleLayer={(ocgIndex) => {
              ctx.setEnabledLayers((prev) => {
                const next = new Set(prev);
                if (next.has(ocgIndex)) next.delete(ocgIndex);
                else next.add(ocgIndex);
                return next;
              });
            }}
            onSetAllLayers={(enabled) => {
              ctx.setEnabledLayers(enabled ? new Set(ctx.allLayerIndices) : new Set());
            }}
          />
        </div>
      </>
    ),
  };
}

function annotationsPlugin(): LoupePDFShellPlugin {
  return {
    id: "loupe.annotations-panel",
    slot: "panel.left",
    order: 40,
    isAvailable: (ctx) => ctx.availability.annotate,
    render: (ctx: LoupePDFShellPluginContext) => (
      <>
        <h2 style={headingStyle}>Annotations</h2>
        <AnnotationThread
          jobId="loupe-pdf-demo"
          currentUserEmail="you@browser.local"
          onJumpToPage={(p) => ctx.setCurrentPage(p)}
          refreshKey={ctx.servicesVersion}
          comfortable={ctx.isMobile}
        />
        <div style={{ height: 8 }} />
        <h2 style={headingStyle}>Notes</h2>
        <AnnotationNotesPanel
          refreshKey={ctx.servicesVersion}
          storageScopeKey={ctx.pdfUrl || "loupe-pdf-demo"}
          onJumpToPage={(p) => ctx.setCurrentPage(p)}
          indexedAnnotations={ctx.indexedAnnotations}
        />
      </>
    ),
  };
}

function annotationToolbarPlugin(): LoupePDFShellPlugin {
  return {
    id: "loupe.annotation-toolbar",
    slot: "overlay.toolbar",
    order: 10,
    isAvailable: (ctx) =>
      ctx.availability.annotate && ctx.activeTool === "annotate",
    render: (ctx: LoupePDFShellPluginContext) => (
      <AnnotationToolbar
        activeTool={ctx.annotationTool}
        onToolChange={ctx.setAnnotationTool}
        strokeColor={ctx.strokeColor}
        onStrokeColorChange={ctx.setStrokeColor}
        onUndo={ctx.triggerUndo}
        onRedo={ctx.triggerRedo}
        canUndo={ctx.canUndo}
        canRedo={ctx.canRedo}
        saving={ctx.savingAnnotation}
      />
    ),
  };
}

export function createDefaultShellPlugins(): LoupePDFShellPlugin[] {
  return [
    modeToolsPlugin(),
    separationsPlugin(),
    layersPlugin(),
    annotationsPlugin(),
    annotationToolbarPlugin(),
  ];
}

