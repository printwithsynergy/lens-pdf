"use client";

import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Annotation tools the toolbar can put into "active" mode. Each
 * value maps 1:1 to a render branch in {@link AnnotationCanvas}.
 *
 * Pen is listed first so the leftmost tool draws immediately; Select
 * only affects annotations you've already placed (empty canvas =
 * nothing to grab — not broken).
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
  | "highlight"
  | "sticky";

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
  stickyNotesVisible?: boolean;
  onToggleStickyNotes?: () => void;
}

/** Mouse-pointer silhouette — reads as “select” better than a lone △. */
function SelectToolIcon() {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M6 3l12 8.5L13 14l2 7-7-5.5L6 21V3z" />
    </svg>
  );
}

const TOOLS: {
  id: AnnotationTool;
  label: string;
  /** Short line for the hover chip; `title` fallback on narrow hosts */
  tooltip: string;
  icon: ReactNode;
}[] = [
  {
    id: "pen",
    label: "Pen",
    tooltip:
      "Pen — click and drag to draw freehand strokes in the active colour.",
    icon: "\u270E",
  },
  {
    id: "pointer",
    label: "Select & move",
    tooltip:
      "Select — click a stroke, shape, text box, or sticky note you added, then drag to move or resize. Does nothing on empty artwork until you draw something else first.",
    icon: <SelectToolIcon />,
  },
  {
    id: "arrow",
    label: "Arrow",
    tooltip:
      "Arrow — press, drag, release to draw a line with an arrowhead at the end.",
    icon: "\u2192",
  },
  {
    id: "rectangle",
    label: "Rectangle",
    tooltip: "Rectangle — drag diagonally to draw an outlined rectangle.",
    icon: "\u25A1",
  },
  {
    id: "ellipse",
    label: "Ellipse",
    tooltip: "Ellipse — drag diagonally to draw an outlined ellipse or circle.",
    icon: "\u25CB",
  },
  {
    id: "text",
    label: "Text",
    tooltip: "Text — click once to place an editable text label.",
    icon: "T",
  },
  {
    id: "highlight",
    label: "Highlight",
    tooltip:
      "Highlight — drag diagonally to fill a translucent rectangle (uses active colour).",
    icon: "\u2588",
  },
  {
    id: "sticky",
    label: "Sticky note",
    tooltip:
      "Sticky note — click to drop an opaque note card; double-click the text to edit.",
    icon: "\u25A4",
  },
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
  position: "relative",
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

const floatingTipStyle: CSSProperties = {
  position: "fixed",
  zIndex: 10000,
  maxWidth: 280,
  padding: "8px 10px",
  borderRadius: 6,
  fontSize: 12,
  lineHeight: 1.4,
  fontWeight: 500,
  color: "#f1f5f9",
  background: "rgba(15, 12, 25, 0.98)",
  border: "1px solid rgba(255,255,255,0.12)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
  pointerEvents: "none",
  textAlign: "left",
};

/**
 * Self-styled annotation toolbar — works in any host with no Tailwind
 * config required. Shows a visible floating tooltip on hover / focus
 * (not only the native `title` attribute) so touch and fast users
 * still discover what each control does.
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
  stickyNotesVisible = true,
  onToggleStickyNotes,
}: AnnotationToolbarProps) {
  const [tip, setTip] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const showTip = useCallback(
    (text: string, el: HTMLElement) => {
      clearLeaveTimer();
      const r = el.getBoundingClientRect();
      setTip({
        text,
        left: r.left + r.width / 2,
        top: r.top,
      });
    },
    [clearLeaveTimer],
  );

  const hideTipDelayed = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setTip(null), 120);
  }, [clearLeaveTimer]);

  const hideTip = useCallback(() => {
    clearLeaveTimer();
    setTip(null);
  }, [clearLeaveTimer]);

  useEffect(
    () => () => {
      clearLeaveTimer();
    },
    [clearLeaveTimer],
  );

  const tipNode =
    tip &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        style={{
          ...floatingTipStyle,
          left: tip.left,
          top: tip.top,
          transform: "translate(-50%, calc(-100% - 6px))",
        }}
        role="tooltip"
      >
        {tip.text}
      </div>,
      document.body,
    );

  return (
    <div style={wrapperStyle}>
      {tipNode}
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          onClick={() => onToolChange(tool.id)}
          style={toolButtonStyle(activeTool === tool.id)}
          title={tool.tooltip}
          aria-label={tool.label}
          aria-pressed={activeTool === tool.id}
          onMouseEnter={(e) => showTip(tool.tooltip, e.currentTarget)}
          onMouseLeave={hideTipDelayed}
          onFocus={(e) => showTip(tool.tooltip, e.currentTarget)}
          onBlur={hideTip}
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
          title={`${color} — click to use as stroke / fill colour`}
          aria-label={`Use colour ${color}`}
          onMouseEnter={(e) =>
            showTip(
              `Stroke / fill: ${color} — click to make it the active colour for pen, shapes, and notes.`,
              e.currentTarget,
            )
          }
          onMouseLeave={hideTipDelayed}
          onFocus={(e) =>
            showTip(
              `Stroke / fill: ${color} — click to make it the active colour for pen, shapes, and notes.`,
              e.currentTarget,
            )
          }
          onBlur={hideTip}
        />
      ))}
      <input
        type="color"
        value={strokeColor}
        onChange={(e) => onStrokeColorChange(e.target.value)}
        style={customColorInputStyle}
        title="Open the system colour picker for a custom colour"
        aria-label="Custom colour"
        onMouseEnter={(e) =>
          showTip(
            "Custom colour — opens the system colour wheel (browser / OS).",
            e.currentTarget,
          )
        }
        onMouseLeave={hideTipDelayed}
        onFocus={(e) =>
          showTip(
            "Custom colour — opens the system colour wheel (browser / OS).",
            e.currentTarget,
          )
        }
        onBlur={hideTip}
      />

      <span style={dividerStyle} />

      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        style={actionButtonStyle(!canUndo)}
        title="Undo the last change to annotations on this page"
        onMouseEnter={(e) => {
          if (!canUndo) return;
          showTip("Undo — step back one change (draw, move, delete, etc.).", e.currentTarget);
        }}
        onMouseLeave={hideTipDelayed}
        onFocus={(e) => {
          if (!canUndo) return;
          showTip("Undo — step back one change (draw, move, delete, etc.).", e.currentTarget);
        }}
        onBlur={hideTip}
      >
        Undo
      </button>
      <button
        type="button"
        onClick={onRedo}
        disabled={!canRedo}
        style={actionButtonStyle(!canRedo)}
        title="Redo the last change you undid"
        onMouseEnter={(e) => {
          if (!canRedo) return;
          showTip("Redo — re-apply the last undone change.", e.currentTarget);
        }}
        onMouseLeave={hideTipDelayed}
        onFocus={(e) => {
          if (!canRedo) return;
          showTip("Redo — re-apply the last undone change.", e.currentTarget);
        }}
        onBlur={hideTip}
      >
        Redo
      </button>

      {onToggleStickyNotes && (
        <button
          type="button"
          onClick={onToggleStickyNotes}
          style={actionButtonStyle(false)}
          title={
            stickyNotesVisible
              ? "Hide all sticky notes (they stay saved; show again when you like)"
              : "Show all sticky notes again"
          }
          onMouseEnter={(e) =>
            showTip(
              stickyNotesVisible
                ? "Hide notes — all sticky notes disappear from view until you show them again (not deleted)."
                : "Show notes — bring hidden sticky notes back on the page.",
              e.currentTarget,
            )
          }
          onMouseLeave={hideTipDelayed}
          onFocus={(e) =>
            showTip(
              stickyNotesVisible
                ? "Hide notes — all sticky notes disappear from view until you show them again (not deleted)."
                : "Show notes — bring hidden sticky notes back on the page.",
              e.currentTarget,
            )
          }
          onBlur={hideTip}
          aria-pressed={!stickyNotesVisible}
        >
          {stickyNotesVisible ? "Hide notes" : "Show notes"}
        </button>
      )}

      <span
        style={savingLabelStyle}
        title={
          saving
            ? "Writing your annotations to the in-memory store…"
            : "Last change is saved in this session (browser tab only)"
        }
        onMouseEnter={(e) =>
          showTip(
            saving
              ? "Saving — writing the canvas to the browser store…"
              : "Saved — annotations for this page are kept in this tab until you close or reload.",
            e.currentTarget,
          )
        }
        onMouseLeave={hideTipDelayed}
      >
        {saving ? "Saving…" : "Saved"}
      </span>
    </div>
  );
}
