"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OverlayItem } from "../plugin/types";
import type { PageInfo } from "../../types";
import { DEFAULT_DPI, SEVERITY_COLORS } from "../../types";
import { useViewerHost } from "../host";

interface PageCanvasProps {
  jobId: string;
  page: PageInfo;
  zoom: number;
  /**
   * Generic overlay items to render on top of the page tile. Replaces
   * the legacy `findings: ViewerFinding[]` prop — hosts convert their
   * domain records (LintPDF: `findingsToOverlayItems(findings)`)
   * before passing them in.
   */
  items: readonly OverlayItem[];
  /** Currently-selected overlay item (or null). Drives the highlight
   * + tooltip + page-level indicator branches. */
  selectedItem: OverlayItem | null;
  /** Fires when the user clicks an item's bbox on the canvas. */
  onItemClick: (item: OverlayItem) => void;
  onZoomChange?: (zoom: number) => void;
  onPageChange?: (delta: number) => void;
  tileDpi?: number;
  tileCdnBase?: string | null;
  /**
   * WS-17B — when true, the canvas is clipped to the page's
   * TrimBox (falls back to BleedBox, then CropBox). Hides the
   * white bleed strip that sits outside the trim line on finished-
   * goods review. Default false so pre-WS-17 viewers still see
   * the full MediaBox unchanged.
   */
  cropToTrim?: boolean;
}

const TIER_HEX: Record<NonNullable<OverlayItem["tier"]>, string> = {
  error: "#ef4444",
  warning: "#f59e0b",
  advisory: "#3b82f6",
  info: "#64748b",
  neutral: "#64748b",
};

// Fallback fill/stroke palette for tiers that don't have a SEVERITY_COLORS
// entry. SEVERITY_COLORS only ships error/warning/advisory because that
// was the LintPDF-finding shape; info/neutral hit this fallback.
const TIER_FALLBACK_COLORS = {
  fill: "rgba(100, 116, 139, 0.15)",
  stroke: "#64748b",
} as const;

function colorsForTier(tier: OverlayItem["tier"]) {
  if (tier === "error") return SEVERITY_COLORS.error;
  if (tier === "warning") return SEVERITY_COLORS.warning;
  if (tier === "advisory") return SEVERITY_COLORS.advisory;
  return TIER_FALLBACK_COLORS;
}

export function PageCanvas({
  jobId: _jobId,
  page,
  zoom,
  items,
  selectedItem,
  onItemClick,
  onZoomChange,
  onPageChange,
  tileDpi,
  tileCdnBase,
  cropToTrim = false,
}: PageCanvasProps) {
  const { apiBase } = useViewerHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tileImg, setTileImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(true);

  // Tooltip state: shows item info near the clicked bbox
  const [tooltip, setTooltip] = useState<{ item: OverlayItem; x: number; y: number } | null>(null);

  // Root wrapper — we attach a non-passive touchmove listener here so
  // pinch-zoom (2-finger) can preventDefault without blocking the browser's
  // native 1 & 2-finger pan (which scrolls the outer overflow-auto container).
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Pinch-zoom state: initial finger distance + zoom at gesture start.
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  const pinchDist = (touches: TouchList): number => {
    if (touches.length < 2) return 0;
    const dx = touches[1]!.clientX - touches[0]!.clientX;
    const dy = touches[1]!.clientY - touches[0]!.clientY;
    return Math.hypot(dx, dy);
  };

  // Native (non-React) touch listeners so preventDefault is honored on
  // pinch-zoom (React synthesises passive listeners in modern versions).
  // 1-finger drag is left alone so the outer scroll container handles pan.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !onZoomChange) return;

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = { startDist: pinchDist(e.touches), startZoom: zoom };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current || pinchRef.current.startDist <= 0) return;
      // Only preventDefault on pinch — leaves 1-finger pan native.
      e.preventDefault();
      const scale = pinchDist(e.touches) / pinchRef.current.startDist;
      const next = Math.round(Math.max(25, Math.min(400, pinchRef.current.startZoom * scale)));
      onZoomChange(next);
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [zoom, onZoomChange]);

  // onPageChange is kept in the prop list for call-site compatibility, but
  // swipe-to-change-page would fight native touch-pan. Consumers that need
  // page navigation use the toolbar arrows / keyboard.
  void onPageChange;
  const [pulsePhase, setPulsePhase] = useState(0);

  // Scale factor: zoom% maps to DPI scaling
  const scale = zoom / 100;
  const dpi = tileDpi ?? DEFAULT_DPI;

  // PDF points to pixels at the given DPI
  const ptsToPixels = dpi / 72;
  const canvasWidth = Math.round(page.width_pts * ptsToPixels * scale);
  const canvasHeight = Math.round(page.height_pts * ptsToPixels * scale);

  const trimViewport = (() => {
    if (!cropToTrim) return null;
    const box = page.trim_box ?? page.bleed_box ?? page.crop_box;
    if (!box) return null;
    const mb = page.media_box;
    const mbW = mb.x1 - mb.x0;
    const mbH = mb.y1 - mb.y0;
    if (mbW <= 0 || mbH <= 0) return null;
    const leftPx = ((box.x0 - mb.x0) / mbW) * canvasWidth;
    const topPx = ((mb.y1 - box.y1) / mbH) * canvasHeight;
    const widthPx = ((box.x1 - box.x0) / mbW) * canvasWidth;
    const heightPx = ((box.y1 - box.y0) / mbH) * canvasHeight;
    if (
      Math.abs(leftPx) < 0.5 &&
      Math.abs(topPx) < 0.5 &&
      Math.abs(widthPx - canvasWidth) < 0.5 &&
      Math.abs(heightPx - canvasHeight) < 0.5
    ) {
      return null;
    }
    return {
      leftPx: Math.max(0, leftPx),
      topPx: Math.max(0, topPx),
      widthPx: Math.max(1, widthPx),
      heightPx: Math.max(1, heightPx),
    };
  })();

  // Load tile image — prefer CDN when available, fall back to engine proxy
  useEffect(() => {
    setLoading(true);
    const img = new Image();
    const cdnUrl = tileCdnBase
      ? `${tileCdnBase}p${page.page_num}_d${dpi}.png`
      : null;
    const proxyUrl = `${apiBase}/pages/${page.page_num}/tile?dpi=${dpi}`;

    img.onload = () => {
      setTileImg(img);
      setLoading(false);
    };
    img.onerror = () => {
      if (cdnUrl && img.src === cdnUrl) {
        img.src = proxyUrl;
      } else {
        setLoading(false);
      }
    };
    img.src = cdnUrl ?? proxyUrl;
  }, [apiBase, page.page_num, dpi, tileCdnBase]);

  // Animate pulse for selected item
  useEffect(() => {
    if (!selectedItem?.bbox || selectedItem.page !== page.page_num) return;
    let raf: number;
    let start: number | null = null;
    const animate = (ts: number) => {
      if (start === null) start = ts;
      const elapsed = ts - start;
      // Oscillate between 0 and 1 over 1.5s
      setPulsePhase((Math.sin((elapsed / 750) * Math.PI) + 1) / 2);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [selectedItem, page.page_num]);

  // Show tooltip when selectedItem changes (from panel click or canvas click)
  useEffect(() => {
    if (!selectedItem || selectedItem.page !== page.page_num) {
      setTooltip(null);
      return;
    }
    let x: number;
    let y: number;
    if (selectedItem.bbox) {
      const [x0, , x1, y1] = selectedItem.bbox;
      x = ((x0 + x1) / 2) * ptsToPixels * scale;
      y = (page.height_pts - y1) * ptsToPixels * scale;
    } else {
      // No bbox: show tooltip centered at top of page
      x = canvasWidth / 2;
      y = 40;
    }
    setTooltip({ item: selectedItem, x, y });
    // No auto-dismiss: tooltip stays until user clicks elsewhere or changes selection
  }, [selectedItem, page.page_num, page.height_pts, ptsToPixels, scale, canvasWidth]);

  // Render canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !tileImg) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Draw the page tile, scaled to the canvas size
    ctx.drawImage(tileImg, 0, 0, canvasWidth, canvasHeight);

    // Draw item overlays
    const pageItems = items.filter(
      (it) => it.page === page.page_num && it.bbox,
    );

    const hasSelected =
      selectedItem &&
      selectedItem.page === page.page_num &&
      selectedItem.bbox;

    // Counter for badge numbering
    let badgeIndex = 0;

    for (const item of pageItems) {
      if (!item.bbox) continue;
      badgeIndex++;
      const [x0, y0, x1, y1] = item.bbox;

      // Convert PDF coordinates (origin lower-left) to canvas (origin upper-left)
      const px0 = x0 * ptsToPixels * scale;
      const py0 = (page.height_pts - y1) * ptsToPixels * scale;
      const pw = (x1 - x0) * ptsToPixels * scale;
      const ph = (y1 - y0) * ptsToPixels * scale;

      const colors = colorsForTier(item.tier);
      const tierHex = item.color ?? TIER_HEX[item.tier ?? "neutral"];
      const isSelected = selectedItem?.id === item.id;

      if (hasSelected && !isSelected) {
        // Dimmed: other items when one is selected
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = colors.fill;
        ctx.fillRect(px0, py0, pw, ph);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1;
        ctx.strokeRect(px0, py0, pw, ph);
        ctx.globalAlpha = 1;
      } else if (isSelected) {
        // Selected item: prominent highlight with animated glow
        const glowAlpha = 0.15 + pulsePhase * 0.2;
        ctx.fillStyle = colors.fill.replace(
          /[\d.]+\)$/,
          `${glowAlpha.toFixed(2)})`,
        );
        ctx.fillRect(px0, py0, pw, ph);

        // Animated outer glow
        const glowSize = 4 + pulsePhase * 4;
        ctx.shadowColor = tierHex;
        ctx.shadowBlur = glowSize;
        ctx.strokeStyle = tierHex;
        ctx.lineWidth = 4;
        ctx.strokeRect(px0, py0, pw, ph);
        ctx.shadowColor = "transparent";
        ctx.shadowBlur = 0;

        // Numbered badge at top-right corner
        const badgeRadius = 10;
        const bx = px0 + pw - 2;
        const by = py0 - 2;
        ctx.fillStyle = tierHex;
        ctx.beginPath();
        ctx.arc(bx, by, badgeRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(badgeIndex), bx, by);
      } else {
        // No selection active: show all at normal opacity
        ctx.fillStyle = colors.fill;
        ctx.fillRect(px0, py0, pw, ph);
        ctx.strokeStyle = colors.stroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px0, py0, pw, ph);
      }
    }
  }, [
    tileImg,
    canvasWidth,
    canvasHeight,
    items,
    page,
    ptsToPixels,
    scale,
    selectedItem,
    pulsePhase,
  ]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle click on canvas to detect item and show tooltip
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Convert to PDF coordinates
    const pdfX = clickX / (ptsToPixels * scale);
    const pdfY = page.height_pts - clickY / (ptsToPixels * scale);

    // Find clicked item
    const pageItems = items.filter(
      (it) => it.page === page.page_num && it.bbox,
    );
    for (const item of pageItems) {
      if (!item.bbox) continue;
      const [x0, y0, x1, y1] = item.bbox;
      if (pdfX >= x0 && pdfX <= x1 && pdfY >= y0 && pdfY <= y1) {
        onItemClick(item);
        // Tooltip shown by the selectedItem useEffect
        return;
      }
    }
    // Clicked empty area: dismiss tooltip
    setTooltip(null);
  };

  const outerWidth = trimViewport ? trimViewport.widthPx : canvasWidth;
  const outerHeight = trimViewport ? trimViewport.heightPx : canvasHeight;

  const tooltipTier = tooltip?.item.tier ?? "neutral";
  const selectedItemTier = selectedItem?.tier ?? "neutral";

  return (
    <div
      ref={wrapperRef}
      className="relative inline-block overflow-hidden"
      style={{
        touchAction: onZoomChange ? "pan-x pan-y" : undefined,
        width: outerWidth,
        height: outerHeight,
      }}
    >
      {loading && (
        <div
          className="flex items-center justify-center bg-muted/50"
          style={{ width: outerWidth, height: outerHeight }}
        >
          <div className="flex flex-col items-center gap-2">
            <svg className="h-8 w-8 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
            <span className="text-xs text-slate-500">Page {page.page_num}</span>
          </div>
        </div>
      )}
      <div
        className="absolute"
        style={{
          left: trimViewport ? -trimViewport.leftPx : 0,
          top: trimViewport ? -trimViewport.topPx : 0,
          width: canvasWidth,
          height: canvasHeight,
        }}
      >
      <canvas
        ref={canvasRef}
        onClick={handleClick}
        className={`cursor-crosshair ${loading ? "hidden" : ""}`}
        style={{
          width: canvasWidth,
          height: canvasHeight,
        }}
      />
      {/* Page-level indicator for items without bbox */}
      {selectedItem && !selectedItem.bbox && selectedItem.page === page.page_num && (
        <div
          className="pointer-events-none absolute inset-0 animate-pulse rounded border-2"
          style={{
            borderColor: TIER_HEX[selectedItemTier],
            boxShadow: `inset 0 0 30px ${TIER_HEX[selectedItemTier]}30`,
          }}
        />
      )}
      {/* Item tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-40 max-w-[280px] rounded-lg bg-black/90 px-3 py-2 text-xs text-white shadow-xl"
          style={{
            left: Math.max(8, Math.min(tooltip.x - 100, canvasWidth - 288)),
            top: Math.max(8, tooltip.y - 8),
            transform: "translateY(-100%)",
          }}
        >
          <div className="mb-1 flex items-center gap-2">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: TIER_HEX[tooltipTier] }}
            />
            <span className="font-bold uppercase" style={{ color: TIER_HEX[tooltipTier] }}>
              {tooltipTier}
            </span>
            {tooltip.item.code && (
              <code className="ml-auto text-[10px] text-gray-400">{tooltip.item.code}</code>
            )}
          </div>
          <p className="break-words leading-snug text-gray-200">
            {(() => {
              const text = tooltip.item.description ?? tooltip.item.label ?? "";
              return text.length > 160 ? text.slice(0, 160) + "..." : text;
            })()}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}
