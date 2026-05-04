"use client";

import type { CSSProperties } from "react";

/**
 * Annotation tools the toolbar can put into "active" mode. Each
 * value maps 1:1 to a render branch in {@link AnnotationCanvas}:
 *
 *   - `pointer`   — select / move existing objects
 *   - `pen`       — free-hand fabric brush
 *   - `arrow`     — line + arrowhead grouped on mouse-up
 *   - `rectangle` — outlined rect dragged from corner to corner
 *   - `ellipse`   — outlined ellipse inscribed in the drag box
 *   - `text`      — IText click-to-place, edit-on-create
 *   - `highlight` — semi-transparent filled rect (hue from `strokeColor`)
 *
 * @public
 */
export type AnnotationTool =
  | "pointer"
  | "pen"
  | "arrow"
  | "rectangle"
  | "ellipse"
  | "text"
  | "highlight";

interface AnnotationToolbarProps {
  activeTool: AnnotationTool;
  onToolChange: (tool: AnnotationTool) => void;
  strokeColor: string;
  onStrokeColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  saving: boolean;
}

const TOOLS: { id: AnnotationTool; label: string; icon: string }[] = [
  { id: "pointer", label: "Select", icon: "\u25B3" },
  { id: "pen", label: "Pen", icon: "\u270E" },
  { id: "arrow", label: "Arrow", icon: "\u2192" },
  { id: "rectangle", label: "Rectangle", icon: "\u25A1" },
  { id: "ellipse", label: "Ellipse", icon: "\u25CB" },
  { id: "text", label: "Text", icon: "T" },
  { id: "highlight", label: "Highlight", icon: "\u2588" },
];

const PRESET_COLORS = [
  "#ef4444",
  "#f59e0b",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#000000",
  "#ffffff",
];

const ACCENT = "#e50c6a";

const wrapperStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 10px",
  borderRadius: 8,
  border: "1px solid rgba(255, 255, 255, 0.1)",
  background: "rgba(15, 12, 25, 0.92)",
  backdropFilter: "blur(8px)",
  color: "#f5f3f7",
  fontSize: 13,
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.45)",
  flexWrap: "wrap",
};

function toolButtonStyle(active: boolean): CSSProperties {
  return {
    width: 28,
    height: 28,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    border: `1px solid ${active ? ACCENT : "rgba(255,255,255,0.1)"}`,
    background: active ? ACCENT : "transparent",
    color: active ? "#fff" : "inherit",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    padding: 0,
    lineHeight: 1,
  };
}

const dividerStyle: CSSProperties = {
  width: 1,
  height: 18,
  background: "rgba(255, 255, 255, 0.15)",
  margin: "0 4px",
  flexShrink: 0,
};

function swatchStyle(color: string, active: boolean): CSSProperties {
  return {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: active
      ? `2px solid ${ACCENT}`
      : "2px solid rgba(255, 255, 255, 0.2)",
    background: color,
    cursor: "pointer",
    padding: 0,
    transform: active ? "scale(1.1)" : "scale(1)",
    transition: "transform 0.12s ease",
  };
}

function actionButtonStyle(disabled: boolean): CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid rgba(255, 255, 255, 0.15)",
    background: "transparent",
    color: "inherit",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    fontSize: 12,
    fontWeight: 500,
  };
}

const savingLabelStyle: CSSProperties = {
  fontSize: 11,
  opacity: 0.65,
  fontVariantNumeric: "tabular-nums",
  marginLeft: 4,
};

const customColorInputStyle: CSSProperties = {
  width: 22,
  height: 22,
  cursor: "pointer",
  border: "none",
  padding: 0,
  background: "transparent",
  borderRadius: 4,
  marginLeft: 2,
};

/**
 * Self-styled annotation toolbar — works in any host with no Tailwind
 * config required. Styles are inlined so it renders correctly even
 * when the embedding application doesn't define shadcn-style CSS
 * variables.
 *
 * @public
 */
export function AnnotationToolbar({
  activeTool,
  onToolChange,
  strokeColor,
  onStrokeColorChange,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  saving,
}: AnnotationToolbarProps) {
  return (
    <div style={wrapperStyle}>
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => onToolChange(tool.id)}
          style={toolButtonStyle(activeTool === tool.id)}
          title={tool.label}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
        >
          {tool.icon}
        </button>
      ))}

      <span style={dividerStyle} />

      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onStrokeColorChange(color)}
          style={swatchStyle(color, strokeColor.toLowerCase() === color)}
          title={color}
          aria-label={`Use color ${color}`}
        />
      ))}
      <input
        type="color"
        value={strokeColor}
        onChange={(e) => onStrokeColorChange(e.target.value)}
        style={customColorInputStyle}
        title="Custom color"
        aria-label="Custom color"
      />

      <span style={dividerStyle} />

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        style={actionButtonStyle(!canUndo)}
        title="Undo"
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        style={actionButtonStyle(!canRedo)}
        title="Redo"
      >
        Redo
      </button>

      <span style={savingLabelStyle}>{saving ? "Saving…" : "Saved"}</span>
    </div>
  );
}
