"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { DensitometerSample } from "../types";
import { isUnwired, logUnwiredHide, useViewerHost, useViewerServices } from "../host";
import {
  resolveSpotSwatchColor,
  type SpotSwatchResolution,
} from "../host/spotColor";
import { useIsMobile } from "./useIsMobile";

interface DensitometerToolProps {
  jobId: string;
  pageNum: number;
  pageWidthPts: number;
  pageHeightPts: number;
  canvasWidth: number;
  canvasHeight: number;
  /** TAC limit in percent (default 300). Matches separations config. */
  tacLimit?: number;
}

/**
 * Real CMYK + spot-channel densitometer. Samples each ink channel at the
 * clicked point and reports:
 *
 *   C  62.3%  M  18.1%
 *   Y   4.7%  K  91.5%
 *   ────────────────
 *   TAC 176.6%   (under 300)
 *
 * Falls back to a friendly "no separations" message on RGB/greyscale
 * source PDFs where the engine can't split CMYK.
 */
export function DensitometerTool({
  jobId: _jobId,
  pageNum,
  pageWidthPts,
  pageHeightPts,
  canvasWidth,
  canvasHeight,
  tacLimit = 300,
}: DensitometerToolProps) {
  const { densitometer } = useViewerServices();
  const { debug } = useViewerHost();
  const hidden = isUnwired(densitometer);
  const isMobile = useIsMobile();
  const [sample, setSample] = useState<DensitometerSample | null>(null);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hidden && debug) logUnwiredHide("DensitometerTool", "densitometer");
  }, [hidden, debug]);

  const pickAt = useCallback(
    async (clickX: number, clickY: number) => {
      const pdfX = (clickX / canvasWidth) * pageWidthPts;
      const pdfY = pageHeightPts - (clickY / canvasHeight) * pageHeightPts;

      setPosition({ x: clickX, y: clickY });
      setLoading(true);
      setError(null);
      setSample(null);

      try {
        const data = await densitometer.sampleAt({
          pageNum,
          pdfX,
          pdfY,
          tacLimit,
        });
        setSample(data);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Sampling failed",
        );
      } finally {
        setLoading(false);
      }
    },
    [densitometer, pageNum, pageWidthPts, pageHeightPts, canvasWidth, canvasHeight, tacLimit],
  );

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

  // Map channel name to a solid swatch colour for the readout. Process
  // channels use the standard CMYK primaries; spot channels go through
  // the shared `resolveSpotSwatchColor` resolver so PMS-named spots
  // present their intent-accurate hue (Pantone DB Lab → sRGB) instead
  // of a hash-of-name pseudo-random colour. Cache by name to avoid
  // re-running the resolver on every render.
  const spotResolutions = useMemo(() => new Map<string, SpotSwatchResolution>(), []);
  const resolveSpot = useCallback(
    (name: string): SpotSwatchResolution => {
      const cached = spotResolutions.get(name);
      if (cached) return cached;
      const next = resolveSpotSwatchColor(name);
      spotResolutions.set(name, next);
      return next;
    },
    [spotResolutions],
  );

  const swatchFor = (name: string): string => {
    const n = name.toLowerCase();
    if (n === "cyan" || n === "c") return "#00b7eb";
    if (n === "magenta" || n === "m") return "#e91e63";
    if (n === "yellow" || n === "y") return "#fdd835";
    if (n === "black" || n === "k") return "#111827";
    const { rgb } = resolveSpot(name);
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  };

  /** Provenance string surfaced in the swatch tooltip. */
  const swatchTitle = (name: string): string => {
    const res = resolveSpot(name);
    switch (res.source) {
      case "host":
        return `${name} — host override`;
      case "codex":
        return `${name} — codex extracted`;
      case "pantone":
        return `${res.pantone_name ?? name} — Pantone reference`;
      case "curated":
        return `${name} — curated mapping`;
      case "hash":
      default:
        return `${name} — approximate (no reference data)`;
    }
  };

  /** Approximate sources merit a "~" badge next to the swatch. */
  const isApproximate = (name: string): boolean => {
    const res = resolveSpot(name);
    return res.source === "curated" || res.source === "hash";
  };

  // First-letter shorthand for the four CMYK process inks; full name
  // for any detected spot ink ("PANTONE 185 C" displays in full).
  const labelFor = (name: string): { abbr: string; full: string } => {
    const lower = name.toLowerCase();
    if (lower === "cyan") return { abbr: "C", full: "Cyan" };
    if (lower === "magenta") return { abbr: "M", full: "Magenta" };
    if (lower === "yellow") return { abbr: "Y", full: "Yellow" };
    if (lower === "black") return { abbr: "K", full: "Black" };
    return { abbr: name, full: name };
  };

  const isProcess = (name: string): boolean => {
    const n = name.toLowerCase();
    return n === "cyan" || n === "magenta" || n === "yellow" || n === "black";
  };

  if (hidden) return null;

  const monoFont =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

  // Floating tooltip on desktop, bottom sheet on mobile.
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
        maxHeight: "55vh",
        overflowY: "auto",
      }
    : {
        position: "absolute",
        left: position
          ? Math.min(position.x + 16, canvasWidth - 230)
          : 0,
        top: position
          ? Math.min(position.y + 16, canvasHeight - 140)
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
      {position && (sample || loading || error) && (
        <div style={readoutStyle}>
          {loading && (
            <div style={{ fontSize: 11, color: "#cbd5e1" }}>
              Sampling separations…
            </div>
          )}
          {error && !loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 600, color: "#fcd34d" }}>Densitometer</div>
              <div style={{ fontSize: 11, color: "#cbd5e1" }}>{error}</div>
            </div>
          )}
          {sample && !loading && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "#cbd5e1",
                  }}
                >
                  Densitometer
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  @{sample.dpi}dpi
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  columnGap: 12,
                  rowGap: 4,
                  marginBottom: 8,
                  fontFamily: monoFont,
                  fontSize: 11,
                }}
              >
                {sample.channels
                  .filter((ch) => isProcess(ch.name))
                  .map((ch) => {
                    const lbl = labelFor(ch.name);
                    return (
                      <div
                        key={ch.name}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                        title={lbl.full}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            border: "1px solid rgba(255, 255, 255, 0.3)",
                            backgroundColor: swatchFor(ch.name),
                          }}
                        />
                        <span style={{ width: 24, color: "#cbd5e1" }}>
                          {lbl.abbr}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {ch.percent.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
              </div>
              {sample.channels.some((ch) => !isProcess(ch.name)) && (
                <div
                  style={{
                    marginBottom: 8,
                    paddingTop: 6,
                    borderTop: "1px solid rgba(255, 255, 255, 0.1)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    fontFamily: monoFont,
                    fontSize: 11,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      color: "#94a3b8",
                    }}
                  >
                    Spots
                  </div>
                  {sample.channels
                    .filter((ch) => !isProcess(ch.name))
                    .map((ch) => (
                      <div
                        key={ch.name}
                        style={{ display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <span
                          style={{
                            display: "inline-block",
                            width: 10,
                            height: 10,
                            flexShrink: 0,
                            borderRadius: 2,
                            border: "1px solid rgba(255, 255, 255, 0.3)",
                            backgroundColor: swatchFor(ch.name),
                          }}
                          title={swatchTitle(ch.name)}
                        />
                        {isApproximate(ch.name) && (
                          <span
                            aria-hidden="true"
                            style={{
                              fontSize: 9,
                              color: "#94a3b8",
                              fontWeight: 700,
                            }}
                            title={swatchTitle(ch.name)}
                          >
                            ~
                          </span>
                        )}
                        <span
                          style={{
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#e2e8f0",
                          }}
                          title={swatchTitle(ch.name)}
                        >
                          {ch.name}
                        </span>
                        <span
                          style={{
                            fontVariantNumeric: "tabular-nums",
                            color: "#cbd5e1",
                          }}
                        >
                          {ch.percent.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              )}
              <div
                style={{
                  paddingTop: 6,
                  borderTop: "1px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontFamily: monoFont,
                    fontSize: 11,
                  }}
                >
                  <span style={{ color: "#cbd5e1" }}>TAC</span>
                  <span
                    style={{
                      fontVariantNumeric: "tabular-nums",
                      fontWeight: 700,
                      color: sample.limit_exceeded ? "#fb7185" : "#6ee7b7",
                    }}
                  >
                    {sample.tac.toFixed(1)}%
                  </span>
                </div>
                <div
                  style={{ textAlign: "right", fontSize: 10, color: "#94a3b8" }}
                >
                  {sample.limit_exceeded
                    ? `over ${sample.tac_limit}% limit`
                    : `under ${sample.tac_limit}% limit`}
                </div>
              </div>
            </>
          )}
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
