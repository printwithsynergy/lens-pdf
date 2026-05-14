"use client";

import type { CSSProperties, ReactNode } from "react";
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
} from "./LensPDFDemo.styles";
import type { LensPDFShellPlugin, LensPDFShellPluginContext } from "./shellPlugins";
import { resolveSpotSwatch } from "../browser/pantone-gold";

const panelHeaderRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const panelHeaderActionsStyle: CSSProperties = {
  display: "flex",
  gap: 6,
};

const panelAllButtonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  color: "#cbd5e1",
  fontSize: 11,
  padding: "2px 6px",
  cursor: "pointer",
};

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

function modeToolsPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.mode-and-tools",
    slot: "panel.left",
    order: 10,
    render: (ctx: LensPDFShellPluginContext) => {
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
      // Page / Separations / Layers are canvas rendering modes —
      // they share row 1 as a connected pill group. Inspection
      // swaps the side-panel contents (not the canvas), so it sits
      // on its own row below as a full-width button. Keeps the
      // canvas-mode toggles visually distinct from the panel-mode
      // toggle.
      const hasFindings = Boolean(
        (ctx.items && ctx.items.length > 0) || ctx.forceInspectionPanel,
      );
      const sepIsLast = separations && !layers;
      const pageIsLast = !separations && !layers;
      const showFirstRow = separations || layers || hasFindings;
      return (
        <>
          {showFirstRow && (
            <>
              <h2 style={headingStyle}>View</h2>
              <div style={modeButtonGroupStyle()}>
                <button
                  type="button"
                  style={modeButtonStyle(
                    tokens,
                    viewerMode === "page",
                    pageIsLast ? "solo" : "left",
                  )}
                  onClick={() => setViewerMode("page")}
                >
                  Page
                </button>
                {separations && (
                  <button
                    type="button"
                    style={modeButtonStyle(
                      tokens,
                      viewerMode === "separation",
                      sepIsLast ? "right" : "middle",
                    )}
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
              {hasFindings && (
                <div style={{ ...modeButtonGroupStyle(), marginTop: 6 }}>
                  <button
                    type="button"
                    style={modeButtonStyle(
                      tokens,
                      viewerMode === "findings",
                      "solo",
                    )}
                    onClick={() => setViewerMode("findings")}
                  >
                    Inspection
                  </button>
                </div>
              )}
            </>
          )}

          <h2 style={headingStyle}>Tools</h2>
          <ToolRadio
            label="Move / Pan"
            active={activeTool === "none"}
            onToggle={() => {
              setActiveTool("none");
              // Move / Pan is non-annotation navigation; force the
              // annotation sub-tool to pointer so we never leave pen
              // armed when the user exits annotate mode.
              ctx.setAnnotationTool("pointer");
            }}
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

function separationsPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.separations-panel",
    slot: "panel.left",
    order: 20,
    isAvailable: (ctx) => ctx.availability.separations && ctx.viewerMode === "separation",
    render: (ctx: LensPDFShellPluginContext) => {
      const allInkNames = ctx.detectedInks.map((ink) => ink.name);
      return (
        <>
          <div style={panelHeaderRowStyle}>
            <h2 style={headingStyle}>Inks ({ctx.detectedInks.length})</h2>
            <div style={panelHeaderActionsStyle}>
              <button
                type="button"
                onClick={() => ctx.setEnabledChannels(new Set(allInkNames))}
                style={panelAllButtonStyle}
                title="Show every ink"
              >
                All on
              </button>
              <button
                type="button"
                onClick={() => ctx.setEnabledChannels(new Set())}
                style={panelAllButtonStyle}
                title="Hide every ink"
              >
                All off
              </button>
            </div>
          </div>
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
                        : resolveSpotSwatch(ink.name, ink.altRgb, ctx.spotPalette),
                  }}
                />
                <span>{ink.name}</span>
              </label>
            );
          })}
        </>
      );
    },
  };
}

function layersPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.layers-panel",
    slot: "panel.left",
    order: 30,
    isAvailable: (ctx) => ctx.availability.layers && ctx.viewerMode === "layer",
    render: (ctx: LensPDFShellPluginContext) => (
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
            jobId="lens-pdf-demo"
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

/**
 * Inspection / Findings panel. Activated by ``viewerMode ===
 * "findings"`` — appears as a fourth tab in the VIEW selector
 * (alongside Page / Separations / Layers) instead of as its own
 * always-on side card. The mode-tools plugin renders the
 * ``Inspection`` button automatically when ``items`` is non-empty
 * or ``forceInspectionPanel`` is set.
 *
 * Rendering: when active, the findings list takes over the entire
 * left panel area below the View toggle. When inactive, this plugin
 * returns nothing.
 */
function findingsPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.findings-panel",
    slot: "panel.left",
    order: 25,
    isAvailable: (ctx) =>
      ctx.viewerMode === "findings" &&
      Boolean((ctx.items && ctx.items.length > 0) || ctx.forceInspectionPanel),
    render: (ctx: LensPDFShellPluginContext) => {
      const items = ctx.items ?? [];
      if (items.length === 0) {
        // forceInspectionPanel branch — render an empty state so the
        // panel slot is visible but the user gets a clear "no
        // findings yet" affordance rather than an unexplained blank.
        return (
          <>
            <div style={panelHeaderRowStyle}>
              <h2 style={headingStyle}>Inspection</h2>
            </div>
            <div
              style={{
                border: `1px dashed ${ctx.tokens.border}`,
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                opacity: 0.7,
                color: ctx.tokens.fg,
              }}
            >
              No findings yet. The host will populate this panel when a
              preflight pass completes.
            </div>
          </>
        );
      }
      const counts: Record<string, number> = {};
      for (const it of items) {
        const t = (it.tier ?? "info") as string;
        counts[t] = (counts[t] ?? 0) + 1;
      }
      const tone = (t: string): string => {
        switch (t) {
          case "error":
            return "rgba(220, 38, 38, 0.85)";
          case "warning":
            return "rgba(245, 158, 11, 0.85)";
          case "advisory":
            return "rgba(14, 165, 233, 0.85)";
          default:
            return "rgba(148, 163, 184, 0.75)";
        }
      };
      return (
        <>
          <div style={panelHeaderRowStyle}>
            <h2 style={headingStyle}>Inspection ({items.length})</h2>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {(["error", "warning", "advisory", "info"] as const).map((t) =>
              (counts[t] ?? 0) > 0 ? (
                <span
                  key={t}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background: tone(t),
                    color: "#fff",
                  }}
                >
                  {counts[t]} {t}
                </span>
              ) : null,
            )}
          </div>
          <div
            style={{
              maxHeight: 320,
              overflowY: "auto",
              border: `1px solid ${ctx.tokens.border}`,
              borderRadius: 8,
              padding: 4,
            }}
          >
            {items.slice(0, 100).map((it, i) => {
              const t = (it.tier ?? "info") as string;
              const label = it.label ?? it.id ?? `Finding ${i + 1}`;
              const isSelected = ctx.selectedItem?.id === it.id;
              return (
                <button
                  key={it.id ?? `f-${i}`}
                  type="button"
                  onClick={() => ctx.onItemSelect?.(isSelected ? null : it)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 8px",
                    border: "1px solid transparent",
                    borderColor: isSelected ? "rgba(255,255,255,0.18)" : "transparent",
                    borderRadius: 6,
                    background: isSelected ? "rgba(255,255,255,0.05)" : "transparent",
                    color: ctx.tokens.fg,
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      marginTop: 4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: tone(t),
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, lineHeight: 1.3 }}>{label}</div>
                    {it.description ? (
                      <div style={{ opacity: 0.7, fontSize: 11, marginTop: 2 }}>
                        {it.description}
                      </div>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      );
    },
  };
}

function annotationsPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.annotations-panel",
    slot: "panel.left",
    order: 40,
    isAvailable: (ctx) => ctx.availability.annotate,
    render: (ctx: LensPDFShellPluginContext) => (
      <>
        <h2 style={headingStyle}>Annotations</h2>
        <AnnotationThread
          jobId="lens-pdf-demo"
          currentUserEmail="you@browser.local"
          onJumpToPage={(p) => ctx.setCurrentPage(p)}
          refreshKey={ctx.servicesVersion}
          comfortable={ctx.isMobile}
        />
        <div style={{ height: 8 }} />
        <h2 style={headingStyle}>Notes</h2>
        <AnnotationNotesPanel
          refreshKey={ctx.servicesVersion}
          storageScopeKey={ctx.pdfUrl || "lens-pdf-demo"}
          onJumpToPage={(p) => ctx.setCurrentPage(p)}
          indexedAnnotations={ctx.indexedAnnotations}
          selectedAnnotationId={ctx.selectedAnnotationId}
          onSelectedAnnotationIdChange={(id) => ctx.setSelectedAnnotationId(id)}
        />
      </>
    ),
  };
}

function annotationToolbarPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.annotation-toolbar",
    slot: "overlay.toolbar",
    order: 10,
    isAvailable: (ctx) =>
      ctx.availability.annotate && ctx.activeTool === "annotate",
    render: (ctx: LensPDFShellPluginContext) => (
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
        compact={ctx.isMobile}
      />
    ),
  };
}

export function createDefaultShellPlugins(): LensPDFShellPlugin[] {
  return [
    findingsPlugin(),
    modeToolsPlugin(),
    separationsPlugin(),
    layersPlugin(),
    annotationsPlugin(),
    annotationToolbarPlugin(),
  ];
}

