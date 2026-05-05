"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AnnotationTool } from "./AnnotationToolbar";
import { isUnwired, logUnwiredHide, useViewerHost, useViewerServices } from "../host";

interface AnnotationCanvasProps {
  jobId: string;
  pageNum: number;
  width: number;
  height: number;
  activeTool: AnnotationTool;
  strokeColor: string;
  onSavingChange?: (saving: boolean) => void;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  /**
   * Emits a numbered list of annotations currently on the page so the
   * host can show a linked notes panel (`#1`, `#2`, …).
   */
  onIndexedAnnotationsChange?: (
    rows: Array<{
      number: number;
      pageNum: number;
      objectType: string;
      centerX: number;
      centerY: number;
    }>,
  ) => void;
  selectedAnnotationNumber?: number | null;
  onSelectedAnnotationNumberChange?: (annotationNumber: number | null) => void;
}
const ANNOTATION_NUMBER_KEY = "__loupeAnnotationNumber";
type IndexedAnnotationRow = {
  number: number;
  pageNum: number;
  objectType: string;
  centerX: number;
  centerY: number;
};

// Undo/redo state kept per-component instance
interface HistoryState {
  stack: string[];
  index: number;
}

export function AnnotationCanvas({
  jobId: _jobId,
  pageNum,
  width,
  height,
  activeTool,
  strokeColor,
  onSavingChange,
  onHistoryChange,
  onIndexedAnnotationsChange,
  selectedAnnotationNumber,
  onSelectedAnnotationNumberChange,
}: AnnotationCanvasProps) {
  const { readOnly, debug } = useViewerHost();
  const { annotations } = useViewerServices();
  const hidden = isUnwired(annotations);
  const canvasElRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (hidden && debug) logUnwiredHide("AnnotationCanvas", "annotations");
  }, [hidden, debug]);

  const fabricRef = useRef<any>(null);
  const historyRef = useRef<HistoryState>({ stack: [], index: -1 });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ── Helpers ──────────────────────────────────────────────────

  const saveToApi = useCallback(

    async (canvas: any) => {
      if (readOnly) return;
      onSavingChange?.(true);
      try {
        await annotations.saveForPage(pageNum, canvas.toJSON());
      } finally {
        onSavingChange?.(false);
      }
    },
    [annotations, pageNum, readOnly, onSavingChange],
  );

  const debouncedSave = useCallback(
  
    (canvas: any) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => saveToApi(canvas), 2000);
    },
    [saveToApi],
  );

  const syncAnnotationIndex = useCallback(
    (canvas: any) => {
      const objects = canvas
        .getObjects()
        .filter((obj: any) => obj.excludeFromExport !== true);
      let maxNumber = 0;
      for (const obj of objects) {
        const n = Number((obj as Record<string, unknown>)[ANNOTATION_NUMBER_KEY]);
        if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
      }
      let next = maxNumber + 1;
      let touched = false;
      for (const obj of objects) {
        const n = Number((obj as Record<string, unknown>)[ANNOTATION_NUMBER_KEY]);
        if (!Number.isFinite(n) || n <= 0) {
          (obj as Record<string, unknown>)[ANNOTATION_NUMBER_KEY] = next++;
          touched = true;
        }
      }
      const rows: IndexedAnnotationRow[] = objects
        .map((obj: any) => {
          const rect = obj.getBoundingRect();
          return {
            number: Number(
              (obj as Record<string, unknown>)[ANNOTATION_NUMBER_KEY] ?? 0,
            ),
            pageNum,
            objectType: String(obj.type ?? "object"),
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
          };
        })
        .filter((r: IndexedAnnotationRow) => Number.isFinite(r.number) && r.number > 0)
        .sort((a: IndexedAnnotationRow, b: IndexedAnnotationRow) => a.number - b.number);
      onIndexedAnnotationsChange?.(rows);
      if (touched) canvas.requestRenderAll();
    },
    [onIndexedAnnotationsChange, pageNum],
  );

  const pushHistory = useCallback(
  
    (canvas: any) => {
      const json = JSON.stringify(canvas.toJSON());
      const h = historyRef.current;
      // Truncate any redo entries
      h.stack = h.stack.slice(0, h.index + 1);
      h.stack.push(json);
      h.index = h.stack.length - 1;
      onHistoryChange?.(h.index > 0, false);
    },
    [onHistoryChange],
  );

  // ── Undo / Redo (exposed via ref-style callbacks) ───────────

  const undo = useCallback(() => {
    const canvas = fabricRef.current;
    const h = historyRef.current;
    if (!canvas || h.index <= 0) return;
    h.index -= 1;
    canvas.loadFromJSON(JSON.parse(h.stack[h.index]!), () => {
      canvas.renderAll();
      debouncedSave(canvas);
      onHistoryChange?.(h.index > 0, h.index < h.stack.length - 1);
    });
  }, [debouncedSave, onHistoryChange]);

  const redo = useCallback(() => {
    const canvas = fabricRef.current;
    const h = historyRef.current;
    if (!canvas || h.index >= h.stack.length - 1) return;
    h.index += 1;
    canvas.loadFromJSON(JSON.parse(h.stack[h.index]!), () => {
      canvas.renderAll();
      debouncedSave(canvas);
      onHistoryChange?.(h.index > 0, h.index < h.stack.length - 1);
    });
  }, [debouncedSave, onHistoryChange]);

  // Expose undo/redo on the canvas element as data attributes for parent access
  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;
  
    (el as any).__annotationUndo = undo;
  
    (el as any).__annotationRedo = redo;
  }, [undo, redo]);

  // ── Fabric initialisation ────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const fabric = await import("fabric");
      if (cancelled || !canvasElRef.current) return;

      const canvas = new fabric.Canvas(canvasElRef.current, {
        width,
        height,
        selection: true,
      });
      fabricRef.current = canvas;

      // fabric v6 no longer auto-instantiates freeDrawingBrush. Without
      // this, switching to the pen tool sets isDrawingMode=true but the
      // brush is undefined so nothing renders. Instantiate a PencilBrush
      // up-front and the tool effect below configures colour / width.
      try {
        const PencilBrush = (fabric as any).PencilBrush;
        if (PencilBrush && !canvas.freeDrawingBrush) {
          canvas.freeDrawingBrush = new PencilBrush(canvas);
        }
      } catch {
        // Fall through — older fabric builds will already have a brush.
      }

      // Load existing annotations through the AnnotationService.
      // getForPage returns null on no-saved-drawing or any error,
      // so the canvas falls back to a blank slate.
      const saved = await annotations.getForPage(pageNum);
      if (saved?.fabricJson) {
        await new Promise<void>((resolve) => {
          // fabricJson is opaque to `core/`; the canvas component
          // is the only place that knows it's a Fabric.js JSON.
          canvas.loadFromJSON(saved.fabricJson as Record<string, unknown>, () => {
            canvas.renderAll();
            resolve();
          });
        });
      }

      syncAnnotationIndex(canvas);
      // Seed history
      pushHistory(canvas);

      // Listen for object changes
      const onChange = () => {
        syncAnnotationIndex(canvas);
        pushHistory(canvas);
        debouncedSave(canvas);
      };
      const getSelectedNumber = () => {
        const active = canvas.getActiveObject();
        if (!active) return null;
        const n = Number(
          ((active as unknown as Record<string, unknown>)[ANNOTATION_NUMBER_KEY]),
        );
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const onSelection = () => {
        onSelectedAnnotationNumberChange?.(getSelectedNumber());
      };
      canvas.on("object:added", onChange);
      canvas.on("object:modified", onChange);
      canvas.on("object:removed", onChange);
      canvas.on("selection:created", onSelection);
      canvas.on("selection:updated", onSelection);
      canvas.on("selection:cleared", onSelection);

      setLoaded(true);
    }

    init();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
    // Intentionally only per-page init: re-initialising Fabric on every
    // parent state update (tool toggles, side-panel changes) can tear
    // down the canvas mid-interaction and crash the viewer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageNum]);

  // Keep canvas selection in sync when the panel picks an annotation by number.
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || selectedAnnotationNumber == null) return;
    const match = canvas.getObjects().find((obj: any) => {
      const n = Number(
        ((obj as unknown as Record<string, unknown>)[ANNOTATION_NUMBER_KEY]),
      );
      return Number.isFinite(n) && n === selectedAnnotationNumber;
    });
    if (!match) return;
    canvas.setActiveObject(match);
    canvas.requestRenderAll();
  }, [selectedAnnotationNumber]);

  // ── Resize canvas when dimensions change ─────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setDimensions({ width, height });
    canvas.renderAll();
  }, [width, height]);

  // ── Tool switching ───────────────────────────────────────────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !loaded) return;

    // Reset drawing mode
    canvas.isDrawingMode = false;
    canvas.selection = true;
    canvas.defaultCursor = "default";

    if (activeTool === "pen") {
      canvas.isDrawingMode = true;
      if (canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush.color = strokeColor;
        canvas.freeDrawingBrush.width = 2;
      }
    } else if (activeTool === "pointer") {
      canvas.selection = true;
    } else {
      // For shape tools, disable selection so mousedown creates shapes
      canvas.selection = false;
      canvas.defaultCursor = "crosshair";
    }
  }, [activeTool, strokeColor, loaded]);

  // ── Shape drawing (arrow, rect, ellipse, text, highlight) ────

  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas || !loaded) return;
    if (
      activeTool === "pointer" ||
      activeTool === "pen"
    )
      return;

    let isDrawing = false;
    let startX = 0;
    let startY = 0;
  
    let activeShape: any = null;

  
    const onMouseDown = async (opt: any) => {
      const pointer = canvas.getPointer(opt.e);
      startX = pointer.x;
      startY = pointer.y;
      isDrawing = true;

      const fabric = await import("fabric");

      if (activeTool === "text") {
        const text = new fabric.IText("Text", {
          left: startX,
          top: startY,
          fontSize: 16,
          fill: strokeColor,
          fontFamily: "sans-serif",
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        isDrawing = false;
        return;
      }

      if (activeTool === "rectangle") {
        activeShape = new fabric.Rect({
          left: startX,
          top: startY,
          width: 0,
          height: 0,
          fill: "transparent",
          stroke: strokeColor,
          strokeWidth: 2,
        });
      } else if (activeTool === "ellipse") {
        activeShape = new fabric.Ellipse({
          left: startX,
          top: startY,
          rx: 0,
          ry: 0,
          fill: "transparent",
          stroke: strokeColor,
          strokeWidth: 2,
        });
      } else if (activeTool === "highlight") {
        activeShape = new fabric.Rect({
          left: startX,
          top: startY,
          width: 0,
          height: 0,
          fill: strokeColor + "40", // semi-transparent
          stroke: "transparent",
          strokeWidth: 0,
        });
      } else if (activeTool === "arrow") {
        activeShape = new fabric.Line([startX, startY, startX, startY], {
          stroke: strokeColor,
          strokeWidth: 2,
        });
      }

      if (activeShape) {
        canvas.add(activeShape);
      }
    };

  
    const onMouseMove = (opt: any) => {
      if (!isDrawing || !activeShape) return;
      const pointer = canvas.getPointer(opt.e);

      if (activeTool === "rectangle" || activeTool === "highlight") {
        const left = Math.min(startX, pointer.x);
        const top = Math.min(startY, pointer.y);
        activeShape.set({
          left,
          top,
          width: Math.abs(pointer.x - startX),
          height: Math.abs(pointer.y - startY),
        });
      } else if (activeTool === "ellipse") {
        activeShape.set({
          rx: Math.abs(pointer.x - startX) / 2,
          ry: Math.abs(pointer.y - startY) / 2,
          left: Math.min(startX, pointer.x),
          top: Math.min(startY, pointer.y),
        });
      } else if (activeTool === "arrow") {
        activeShape.set({ x2: pointer.x, y2: pointer.y });
      }

      canvas.renderAll();
    };

    const onMouseUp = async () => {
      if (!isDrawing) return;
      isDrawing = false;

      // For arrow tool, add an arrowhead triangle
      if (activeTool === "arrow" && activeShape) {
        const fabric = await import("fabric");
        const x1 = activeShape.x1 as number;
        const y1 = activeShape.y1 as number;
        const x2 = activeShape.x2 as number;
        const y2 = activeShape.y2 as number;
        const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
        const headLen = 12;

        const head = new fabric.Triangle({
          left: x2,
          top: y2,
          width: headLen,
          height: headLen,
          fill: strokeColor,
          angle: angle + 90,
          originX: "center",
          originY: "center",
        });

        // Group line + head
        const group = new fabric.Group([activeShape, head]);
        canvas.remove(activeShape);
        canvas.add(group);
      }

      activeShape = null;
      canvas.renderAll();
    };

    canvas.on("mouse:down", onMouseDown);
    canvas.on("mouse:move", onMouseMove);
    canvas.on("mouse:up", onMouseUp);

    return () => {
      canvas.off("mouse:down", onMouseDown);
      canvas.off("mouse:move", onMouseMove);
      canvas.off("mouse:up", onMouseUp);
    };
  }, [activeTool, strokeColor, loaded]);

  if (hidden) return null;

  // Inline positioning styles — don't depend on the host's Tailwind
  // config providing `absolute` / `inset-0`, so the annotation canvas
  // overlays correctly in any embed (Astro, Next, plain CRA, etc.).
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "auto",
        zIndex: 20,
      }}
    >
      <canvas ref={canvasElRef} width={width} height={height} />
    </div>
  );
}
