"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
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
const TIER_ORDER = ["error", "warning", "advisory", "info"] as const;
type Tier = (typeof TIER_ORDER)[number];

function tone(t: string): string {
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
}

function FindingsPanel({ ctx }: { ctx: LensPDFShellPluginContext }) {
  const [activeTiers, setActiveTiers] = useState<Set<Tier>>(new Set());
  const allItems = ctx.items ?? [];

  // Filter spell_check items when spelling is hidden
  const items = ctx.hideSpelling
    ? allItems.filter((it) => it.type !== "spell_check")
    : allItems;

  const hasSpellItems = allItems.some((it) => it.type === "spell_check");

  if (allItems.length === 0) {
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

  const counts: Partial<Record<Tier, number>> = {};
  for (const it of items) {
    const t = (it.tier ?? "info") as Tier;
    counts[t] = (counts[t] ?? 0) + 1;
  }

  function toggleTier(t: Tier) {
    setActiveTiers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  const isFiltered = activeTiers.size > 0;
  const visible = isFiltered
    ? items.filter((it) => activeTiers.has((it.tier ?? "info") as Tier))
    : items;

  return (
    <>
      <div style={panelHeaderRowStyle}>
        <h2 style={headingStyle}>
          Inspection ({isFiltered ? `${visible.length}/` : ""}{items.length})
        </h2>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {TIER_ORDER.map((t) =>
          (counts[t] ?? 0) > 0 ? (
            <button
              key={t}
              type="button"
              onClick={() => toggleTier(t)}
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
                border: "2px solid transparent",
                borderColor: activeTiers.has(t) ? "#fff" : "transparent",
                opacity: isFiltered && !activeTiers.has(t) ? 0.4 : 1,
                cursor: "pointer",
                transition: "opacity 0.15s, border-color 0.15s",
              }}
            >
              {counts[t]} {t}
            </button>
          ) : null,
        )}
        {hasSpellItems && (
          <button
            type="button"
            onClick={ctx.onToggleSpelling}
            title={ctx.hideSpelling ? "Show spelling findings" : "Hide spelling findings"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
              background: ctx.hideSpelling ? "rgba(100,116,139,0.3)" : "rgba(217,119,6,0.25)",
              color: ctx.hideSpelling ? "rgba(148,163,184,0.7)" : "rgb(252,211,77)",
              border: "1px solid",
              borderColor: ctx.hideSpelling ? "rgba(100,116,139,0.5)" : "rgba(217,119,6,0.6)",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
          >
            {ctx.hideSpelling ? "Spelling off" : "Spelling"}
          </button>
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
        {visible.slice(0, 100).map((it, i) => {
          const t = (it.tier ?? "info") as string;
          const label = it.label ?? it.id ?? `Finding ${i + 1}`;
          const isSelected = ctx.selectedItem?.id === it.id;
          const findingN = ctx.findingNumbers.get(it.id);
          const decision = ctx.decisions?.[it.id];
          const hasActiveDecision = decision?.is_active === true;
          return (
            <div
              key={it.id ?? `f-${i}`}
              style={{
                display: "flex",
                flexDirection: "column",
                borderRadius: 6,
                border: "1px solid transparent",
                borderColor: isSelected ? "rgba(255,255,255,0.18)" : "transparent",
                background: isSelected ? "rgba(255,255,255,0.05)" : "transparent",
                opacity: hasActiveDecision ? 0.6 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                {findingN != null && (
                  <button
                    type="button"
                    title={`Open note for F${findingN}`}
                    onClick={() => ctx.onFindingNoteRequest?.(it.id)}
                    style={{
                      flexShrink: 0,
                      alignSelf: "center",
                      margin: "0 0 0 4px",
                      padding: "2px 5px",
                      borderRadius: 4,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: tone(t),
                      color: "#fff",
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1.4,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    F{findingN}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      ctx.onItemSelect?.(null);
                    } else {
                      ctx.onSelectItem?.(it);
                      ctx.setCurrentPage(it.page);
                    }
                  }}
                  style={{
                    display: "flex",
                    flex: 1,
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "6px 8px",
                    border: "none",
                    borderRadius: 0,
                    background: "transparent",
                    color: ctx.tokens.fg,
                    cursor: "pointer",
                    textAlign: "left",
                    fontSize: 12,
                    minWidth: 0,
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
                  {hasActiveDecision && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 999,
                        background: "rgba(16,185,129,0.2)",
                        color: "rgb(52,211,153)",
                        border: "1px solid rgba(16,185,129,0.4)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ✓ {decision.decision_type}
                    </span>
                  )}
                </button>
              </div>
              {ctx.onDecide && (
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    padding: "2px 8px 6px 16px",
                    opacity: 0,
                  }}
                  className="findings-panel-actions"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.opacity = "1";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.opacity = "0";
                  }}
                >
                  {hasActiveDecision ? (
                    <button
                      type="button"
                      onClick={() => ctx.onDecide!(it, "suppress")}
                      style={decideButtonStyle("slate")}
                    >
                      Revoke
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => ctx.onDecide!(it, "approve")}
                        style={decideButtonStyle("green")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => ctx.onDecide!(it, "waive")}
                        style={decideButtonStyle("amber")}
                      >
                        Waive
                      </button>
                      <button
                        type="button"
                        onClick={() => ctx.onDecide!(it, "reject")}
                        style={decideButtonStyle("red")}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function decideButtonStyle(color: "green" | "amber" | "red" | "slate"): CSSProperties {
  const colors = {
    green: { border: "rgba(16,185,129,0.5)", text: "rgb(52,211,153)", bg: "rgba(16,185,129,0.1)" },
    amber: { border: "rgba(217,119,6,0.5)", text: "rgb(251,191,36)", bg: "rgba(217,119,6,0.1)" },
    red: { border: "rgba(239,68,68,0.5)", text: "rgb(252,165,165)", bg: "rgba(239,68,68,0.1)" },
    slate: { border: "rgba(100,116,139,0.5)", text: "rgb(148,163,184)", bg: "rgba(100,116,139,0.1)" },
  }[color];
  return {
    padding: "1px 8px",
    borderRadius: 4,
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.text,
    fontSize: 10,
    cursor: "pointer",
  };
}

function findingsPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.findings-panel",
    slot: "panel.left",
    order: 25,
    isAvailable: (ctx) =>
      ctx.viewerMode === "findings" &&
      Boolean((ctx.items && ctx.items.length > 0) || ctx.forceInspectionPanel),
    render: (ctx: LensPDFShellPluginContext) => <FindingsPanel ctx={ctx} />,
  };
}

function annotationsPlugin(): LensPDFShellPlugin {
  return {
    id: "lens.annotations-panel",
    slot: "panel.left",
    order: 40,
    isAvailable: (ctx) => ctx.availability.annotate,
    render: (ctx: LensPDFShellPluginContext) => {
      const findingTargets = (ctx.items ?? []).map((item) => ({
        id: `finding-${item.id}`,
        label: `F${ctx.findingNumbers.get(item.id) ?? "?"} · ${item.label ?? item.id}`,
        pageNum: item.page,
      }));
      return (
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
            findingTargets={findingTargets}
            pendingNoteTarget={ctx.pendingNoteTarget}
            onPendingNoteConsumed={ctx.onPendingNoteConsumed}
          />
        </>
      );
    },
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


