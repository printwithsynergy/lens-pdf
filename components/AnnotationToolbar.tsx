"use client";

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
    <div className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 shadow-sm">
      {/* Tool buttons */}
      {TOOLS.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          className={`rounded px-2 py-1 text-sm font-medium transition-colors ${
            activeTool === tool.id
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted"
          }`}
          title={tool.label}
        >
          {tool.icon}
        </button>
      ))}

      <span className="mx-1 h-5 border-r" />

      {/* Color picker */}
      <div className="flex items-center gap-1">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => onStrokeColorChange(color)}
            className={`h-5 w-5 rounded-full border-2 transition-transform ${
              strokeColor === color
                ? "scale-125 border-primary"
                : "border-transparent hover:scale-110"
            }`}
            style={{ backgroundColor: color }}
            title={color}
          />
        ))}
        <input
          type="color"
          value={strokeColor}
          onChange={(e) => onStrokeColorChange(e.target.value)}
          className="ml-1 h-5 w-5 cursor-pointer rounded border-0 p-0"
          title="Custom color"
        />
      </div>

      <span className="mx-1 h-5 border-r" />

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        className="rounded px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
        title="Undo"
      >
        Undo
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        className="rounded px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
        title="Redo"
      >
        Redo
      </button>

      <span className="mx-1 h-5 border-r" />

      {/* Save indicator */}
      <span className="text-xs text-muted-foreground">
        {saving ? "Saving..." : "Saved"}
      </span>
    </div>
  );
}
