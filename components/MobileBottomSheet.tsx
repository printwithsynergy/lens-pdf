"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type SnapPosition = "collapsed" | "half" | "full";

interface MobileBottomSheetProps {
  children: React.ReactNode;
  summary: React.ReactNode;
  /** Controlled snap position from parent. */
  snap?: SnapPosition;
  /** Notify parent when snap changes (drag or tap). */
  onSnapChange?: (snap: SnapPosition) => void;
}

const COLLAPSED_H = 56;
const HALF_MAX_VH = 0.3;
const FULL_VH = 0.8;

const SNAP_ORDER: SnapPosition[] = ["collapsed", "half", "full"];

export function MobileBottomSheet({ children, summary, snap: controlledSnap, onSnapChange }: MobileBottomSheetProps) {
  const [internalSnap, setInternalSnap] = useState<SnapPosition>("collapsed");
  const [dragging, setDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const [contentHeight, setContentHeight] = useState(200);
  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const startHeightRef = useRef(0);

  const snap = controlledSnap ?? internalSnap;

  // Measure content to auto-size the "half" snap
  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContentHeight(entry.contentRect.height);
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const getSnapHeights = useCallback(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    // "half" = just enough for content, capped at 30vh
    const halfH = Math.min(contentHeight + COLLAPSED_H + 16, vh * HALF_MAX_VH);
    return {
      collapsed: COLLAPSED_H,
      half: Math.max(halfH, COLLAPSED_H + 60),
      full: vh * FULL_VH,
    };
  }, [contentHeight]);

  const updateSnap = useCallback(
    (next: SnapPosition) => {
      setInternalSnap(next);
      onSnapChange?.(next);
    },
    [onSnapChange],
  );

  useEffect(() => {
    if (controlledSnap !== undefined) {
      setInternalSnap(controlledSnap);
    }
  }, [controlledSnap]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      startYRef.current = touch.clientY;
      const el = sheetRef.current;
      if (el) {
        startHeightRef.current = el.getBoundingClientRect().height;
      }
      setDragging(true);
    },
    [],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!dragging) return;
      const touch = e.touches[0];
      if (!touch) return;
      const delta = startYRef.current - touch.clientY;
      const newHeight = startHeightRef.current + delta;
      const vh = window.innerHeight;
      const clamped = Math.max(COLLAPSED_H, Math.min(vh * 0.9, newHeight));
      setDragOffset(clamped);
    },
    [dragging],
  );

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
    if (dragOffset === null) return;

    const snapValues = getSnapHeights();

    let closest: SnapPosition = "collapsed";
    let minDist = Infinity;
    for (const pos of SNAP_ORDER) {
      // pos is a SnapPosition union key — safe index.
      // eslint-disable-next-line security/detect-object-injection
      const dist = Math.abs(dragOffset - snapValues[pos]);
      if (dist < minDist) {
        minDist = dist;
        closest = pos;
      }
    }

    const currentIdx = SNAP_ORDER.indexOf(snap);
    if (currentIdx === 1 && dragOffset < snapValues.half - 30) {
      closest = "collapsed";
    } else if (currentIdx === 1 && dragOffset > snapValues.half + 30) {
      closest = "full";
    }

    updateSnap(closest);
    setDragOffset(null);
  }, [dragOffset, snap, updateSnap, getSnapHeights]);

  const isCollapsed = snap === "collapsed" && dragOffset === null;

  const snapPx = getSnapHeights();
  const heightStr = dragOffset !== null
    ? `${dragOffset}px`
    // snap is a SnapPosition union key — safe index.
    // eslint-disable-next-line security/detect-object-injection
    : `${snapPx[snap]}px`;

  return (
    <div
      ref={sheetRef}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-slate-900 shadow-2xl"
      style={{
        height: heightStr,
        transition: dragging ? "none" : "height 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-2 active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="h-1 w-10 rounded-full bg-slate-600" />
      </div>

      {/* Summary bar (always visible) */}
      <div
        className="flex shrink-0 items-center px-4 pb-1"
        onClick={() => {
          if (isCollapsed) updateSnap("half");
        }}
      >
        {summary}
      </div>

      {/* Content (scrollable when expanded) */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          <div ref={contentRef}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
