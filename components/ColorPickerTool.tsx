"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useState } from "react";
import type { ColorSample } from "../types";
import {
  logUnwiredHide,
  useFallbackMode,
  useViewerHost,
  useViewerServices,
} from "../host";
import { useIsMobile } from "./useIsMobile";

interface ColorPickerToolProps {
  jobId: string;
  pageNum: number;
  pageWidthPts: number;
  pageHeightPts: number;
  canvasWidth: number;
  canvasHeight: number;
}

export function ColorPickerTool({
  jobId: _jobId,
  pageNum,
  pageWidthPts,
  pageHeightPts,
  canvasWidth,
  canvasHeight,
}: ColorPickerToolProps) {
  const { colorSample } = useViewerServices();
  const { debug, pdfFallback } = useViewerHost();
  const mode = useFallbackMode(colorSample);
  const isMobile = useIsMobile();
  const [sample, setSample] = useState<ColorSample | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (mode === "hidden" && debug) logUnwiredHide("ColorPickerTool", "colorSample");
  }, [mode, debug]);

  const pickAt = useCallback(
    async (clickX: number, clickY: number) => {
      // Convert to PDF coordinates (origin lower-left)
      const pdfX = (clickX / canvasWidth) * pageWidthPts;
      const pdfY = pageHeightPts - (clickY / canvasHeight) * pageHeightPts;

      setPosition({ x: clickX, y: clickY });
      setLoading(true);
      try {
        const data =
          mode === "fallback" && pdfFallback
            ? await pdfFallback.sampleColorAt({ pageNum, pdfX, pdfY })
            : await colorSample.sampleAt({ pageNum, pdfX, pdfY });
        if (data) setSample(data);
      } finally {
        setLoading(false);
      }
    },
    [colorSample, pdfFallback, mode, pageNum, pageWidthPts, pageHeightPts, canvasWidth, canvasHeight],
  );

  if (mode === "hidden") return null;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      void pickAt(e.clientX - rect.left, e.clientY - rect.top);
    },
    [pickAt],
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const touch = e.touches[0]!;
      const rect = e.currentTarget.getBoundingClientRect();
      void pickAt(touch.clientX - rect.left, touch.clientY - rect.top);
    },
    [pickAt],
  );

  // Readout placement: floating tooltip on desktop (anchored near the
  // click), bottom sheet on mobile so the readout never falls behind
  // the user's finger or off-screen.
  const readoutStyle: CSSProperties = isMobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        pointerEvents: "none",
        padding: "12px 16px 16px",
        background: "rgba(10, 8, 16, 0.96)",
        borderTop: "1px solid rgba(255, 255, 255, 0.12)",
        color: "#fff",
        boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.45)",
        fontSize: 13,
      }
    : {
        position: "absolute",
        left: position
          ? Math.min(position.x + 16, canvasWidth - 230)
          : 0,
        top: position
          ? Math.min(position.y + 16, canvasHeight - 200)
          : 0,
        zIndex: 30,
        pointerEvents: "none",
        minWidth: 200,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid rgba(255, 255, 255, 0.2)",
        background: "rgba(0, 0, 0, 0.92)",
        color: "#fff",
        boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55)",
        fontSize: 12,
      };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        cursor: "crosshair",
        zIndex: 25,
        touchAction: "none",
      }}
      onClick={handleClick}
      onTouchStart={handleTouch}
    >
      {position && sample && (
        <div style={readoutStyle}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 4,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                border: "1px solid rgba(255, 255, 255, 0.3)",
                backgroundColor: sample.hex,
              }}
            />
            <span
              style={{
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontWeight: 700,
              }}
            >
              {sample.hex.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: 10, color: "#cbd5e1", lineHeight: 1.5 }}>
            <div>
              RGB: {sample.rgb[0]}, {sample.rgb[1]}, {sample.rgb[2]}
            </div>
            {sample.tac !== null && <div>TAC: {sample.tac.toFixed(1)}%</div>}
          </div>
          {sample.inks && sample.inks.length > 0 && (
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: 10,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  columnGap: 8,
                  rowGap: 2,
                }}
              >
                {sample.inks
                  .filter((i) => i.type === "process")
                  .map((ink) => (
                    <div
                      key={ink.name}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span style={{ color: "#cbd5e1" }}>
                        {ink.name.charAt(0)}
                      </span>
                      <span
                        style={{ fontVariantNumeric: "tabular-nums", color: "#f1f5f9" }}
                      >
                        {ink.percent.toFixed(1)}%
                      </span>
                    </div>
                  ))}
              </div>
              {sample.inks.some((i) => i.type === "spot") && (
                <div
                  style={{
                    marginTop: 4,
                    paddingTop: 4,
                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  {sample.inks
                    .filter((i) => i.type === "spot")
                    .map((ink) => (
                      <div
                        key={ink.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#e2e8f0",
                          }}
                          title={ink.name}
                        >
                          {ink.name}
                        </span>
                        <span
                          style={{ fontVariantNumeric: "tabular-nums", color: "#f1f5f9" }}
                        >
                          {ink.percent.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {position && loading && !sample && (
        <div
          style={{
            position: isMobile ? "fixed" : "absolute",
            left: isMobile ? 16 : position.x + 16,
            ...(isMobile
              ? { bottom: 16, right: 16 }
              : { top: position.y + 16 }),
            zIndex: 60,
            pointerEvents: "none",
            padding: "4px 10px",
            borderRadius: 4,
            background: "rgba(0, 0, 0, 0.85)",
            color: "#fff",
            fontSize: 11,
            border: "1px solid rgba(255, 255, 255, 0.15)",
          }}
        >
          Sampling...
        </div>
      )}
      {position && (
        <div
          style={{
            position: "absolute",
            left: position.x - 8,
            top: position.y - 8,
            zIndex: 20,
            pointerEvents: "none",
            width: 16,
            height: 16,
            border: "2px solid white",
            borderRadius: "50%",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
          }}
        />
      )}
    </div>
  );
}
