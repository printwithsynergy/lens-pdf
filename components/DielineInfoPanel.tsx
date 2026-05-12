"use client";

/**
 * Dieline info panel — built-in summary card for ``DielineResult``.
 *
 * Renders the detected dieline's source, confidence, spot name (when
 * present), and a table of per-region sizes in mm + inches. Hosts
 * drop this into their info-panel column the same way they'd drop
 * the FindingsSidebar in alongside the canvas.
 *
 * The component is opinionated about layout (a vertical card with a
 * header + a table) and uses brand-* / slate-* tokens; consumers
 * that need different chrome can reach the raw data via the
 * ``dieline`` prop they already pass to LoupePDF.
 *
 * @public
 */

import * as React from "react";

import type { DielineResult } from "../types";

export interface DielineInfoPanelProps {
  /** The DielineResult passed to ``<LoupePDF dieline={...}>``. */
  dieline: DielineResult | null | undefined;
  /** Optional CSS class for the wrapping ``<aside>``. */
  className?: string;
  /** Optional heading override. Default: ``"Dieline"``. */
  title?: string;
}

function formatMm(widthPts: number, heightPts: number): string {
  return `${(widthPts * 25.4 / 72).toFixed(2)} × ${(heightPts * 25.4 / 72).toFixed(2)} mm`;
}

function formatInches(widthPts: number, heightPts: number): string {
  return `${(widthPts / 72).toFixed(3)} × ${(heightPts / 72).toFixed(3)} in`;
}

export function DielineInfoPanel({
  dieline,
  className,
  title = "Dieline",
}: DielineInfoPanelProps): React.ReactElement | null {
  if (!dieline) return null;
  if (dieline.source === "missing") return null;
  const regions = dieline.regions ?? [];
  return (
    <aside
      className={
        className ??
        "rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200"
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-300">
          {title}
        </p>
        {dieline.multi_color ? (
          <span
            className="rounded bg-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-red-300"
            title="The dieline layer paints in more than one ink colour. Usually misplaced artwork."
          >
            multi-colour
          </span>
        ) : null}
      </div>
      <dl className="mb-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
        <dt className="text-slate-500">Source</dt>
        <dd className="font-mono text-slate-200">{dieline.source}</dd>
        {dieline.spot_name ? (
          <>
            <dt className="text-slate-500">Spot name</dt>
            <dd className="font-mono text-slate-200">{dieline.spot_name}</dd>
          </>
        ) : null}
        <dt className="text-slate-500">Confidence</dt>
        <dd className="font-mono text-slate-200">{dieline.confidence.toFixed(2)}</dd>
      </dl>
      {regions.length > 0 ? (
        <>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Regions · {regions.length}
          </p>
          <ul className="space-y-1.5">
            {regions.map((region, idx) => {
              const widthPts = region.x1 - region.x0;
              const heightPts = region.y1 - region.y0;
              const label = regions.length > 1 ? `Dieline ${idx + 1}` : "Dieline";
              return (
                <li
                  key={`die-region-${idx}`}
                  className="rounded border border-slate-800 bg-slate-950 px-2 py-1.5"
                >
                  <p className="text-[11px] font-medium text-slate-200">{label}</p>
                  <p className="font-mono text-[10px] text-slate-400">
                    {formatMm(widthPts, heightPts)}
                  </p>
                  <p className="font-mono text-[10px] text-slate-500">
                    {formatInches(widthPts, heightPts)}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="text-[11px] text-slate-500">No bounded regions detected.</p>
      )}
    </aside>
  );
}
