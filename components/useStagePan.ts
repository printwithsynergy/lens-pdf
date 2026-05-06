"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, RefObject } from "react";

interface StagePanOptions {
  enabled: boolean;
  ignoreSelector?: string;
}

interface StagePanResult<T extends HTMLElement> {
  scrollRef: RefObject<T | null>;
  dragPanning: boolean;
  onMouseDown: (e: ReactMouseEvent<T>) => void;
  onMouseMove: (e: ReactMouseEvent<T>) => void;
  onMouseUp: () => void;
  onMouseLeave: () => void;
  cursor: CSSProperties["cursor"];
  userSelect: CSSProperties["userSelect"];
}

const DEFAULT_IGNORE_SELECTOR =
  "button, input, textarea, select, a, [role='button'], [data-no-pan='true']";

/**
 * Reusable drag-to-pan behavior for scrollable viewer stages.
 *
 * Keeps panning logic in shared Loupe core instead of per-shell/demo code.
 */
export function useStagePan<T extends HTMLElement>({
  enabled,
  ignoreSelector = DEFAULT_IGNORE_SELECTOR,
}: StagePanOptions): StagePanResult<T> {
  const scrollRef = useRef<T | null>(null);
  const sessionRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const [dragPanning, setDragPanning] = useState(false);

  const endPanSession = useCallback(() => {
    sessionRef.current.active = false;
    setDragPanning(false);
  }, []);

  useEffect(() => {
    if (!dragPanning) return;
    const handleMouseUp = () => endPanSession();
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [dragPanning, endPanSession]);

  const onMouseDown = useCallback(
    (e: ReactMouseEvent<T>) => {
      if (!enabled || e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest(ignoreSelector)) return;
      const stage = scrollRef.current;
      if (!stage) return;
      sessionRef.current = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: stage.scrollLeft,
        scrollTop: stage.scrollTop,
      };
      setDragPanning(true);
      e.preventDefault();
    },
    [enabled, ignoreSelector],
  );

  const onMouseMove = useCallback(
    (e: ReactMouseEvent<T>) => {
      const pan = sessionRef.current;
      if (!enabled || !pan.active) return;
      const stage = scrollRef.current;
      if (!stage) return;
      const dx = e.clientX - pan.startX;
      const dy = e.clientY - pan.startY;
      stage.scrollLeft = pan.scrollLeft - dx;
      stage.scrollTop = pan.scrollTop - dy;
      e.preventDefault();
    },
    [enabled],
  );

  return {
    scrollRef,
    dragPanning,
    onMouseDown,
    onMouseMove,
    onMouseUp: endPanSession,
    onMouseLeave: endPanSession,
    cursor: enabled ? (dragPanning ? "grabbing" : "grab") : "default",
    userSelect: enabled ? "none" : "auto",
  };
}
