"use client";

/**
 * Findings sidebar — built-in component for hosts that pass
 * ``items`` (OverlayItems) to LensPDF and want a polished list of
 * findings alongside the canvas.
 *
 * Behaviour out of the box:
 *
 * - Splits items into "Located in viewer" (clickable, drawn on the
 *   canvas) and "Informational" (no bbox, surfaced separately) via
 *   ``splitFindingsByLocation`` so consumers never have to write
 *   the predicate themselves.
 * - Each group has a collapsible header with a count chip.
 * - Severity filter pills (all / error / warning / advisory / info)
 *   along the top.
 * - Item buttons fire ``onSelect`` so the host can sync canvas
 *   highlight + page jump.
 *
 * The component is intentionally opinionated about layout (vertical
 * sidebar, dark / brand palette honoured via Lens's existing
 * ThemeTokens). Hosts that need a totally different chrome should
 * import the underlying helpers and roll their own.
 *
 * @public
 */

import * as React from "react";
import { useMemo, useState } from "react";

import type { DecisionRecord, DecisionType, OverlayItem } from "../plugin";
import { splitFindingsByLocation } from "../plugin";

type Tier = NonNullable<OverlayItem["tier"]>;
type TierFilter = Tier | "all";

const TIER_TONE: Record<Tier, { wrap: string; chip: string }> = {
  error: {
    wrap: "border-red-700/60 bg-red-900/30 text-red-200",
    chip: "border-red-700/60 bg-red-900/30 text-red-200",
  },
  warning: {
    wrap: "border-amber-700/60 bg-amber-900/30 text-amber-200",
    chip: "border-amber-700/60 bg-amber-900/30 text-amber-200",
  },
  advisory: {
    wrap: "border-sky-700/60 bg-sky-900/30 text-sky-200",
    chip: "border-sky-700/60 bg-sky-900/30 text-sky-200",
  },
  info: {
    wrap: "border-slate-700 bg-slate-800 text-slate-300",
    chip: "border-slate-700 bg-slate-800 text-slate-300",
  },
  neutral: {
    wrap: "border-slate-700 bg-slate-800 text-slate-400",
    chip: "border-slate-700 bg-slate-800 text-slate-400",
  },
};

function tierLabel(t: OverlayItem["tier"] | undefined): Tier {
  return t ?? "info";
}

export interface FindingsSidebarProps {
  /** All findings — both located and informational. Pass the same
   *  superset you'd pass to ``<LensPDF items={...}>``. */
  items: readonly OverlayItem[];
  /** Current canvas selection, if any. Drives the highlighted row. */
  selected?: OverlayItem | null;
  /** Fires when the user clicks a located item. Hosts typically
   *  forward this to LensPDF's ``selectedItem`` prop so the canvas
   *  jumps + tooltips the matching bbox. */
  onSelect?: (item: OverlayItem | null) => void;
  /** Optional title shown in the sidebar header. Default:
   *  ``"Preflight findings"`` — adapter authors mapping other
   *  engines (callas, PitStop, Acrobat) can override. */
  title?: string;
  /** Optional filename caption rendered under the title. */
  filename?: string;
  /** Width class applied to the aside; defaults to ``w-80``. */
  widthClass?: string;
  /**
   * Active decisions keyed by finding id. Populate from
   * ``GET /api/v1/jobs/{id}/decisions`` — the sidebar shows approval
   * state badges and a Revoke action when a decision is active.
   */
  decisions?: Record<string, DecisionRecord>;
  /**
   * Fires when the user clicks Approve / Waive / Reject / Suppress on a
   * finding row. The host calls the lint-pdf decisions API and re-fetches
   * decisions to update this prop.
   */
  onDecide?: (item: OverlayItem, type: DecisionType, notes?: string) => void;
  /**
   * When true, spell-check findings (type === "spell_check") are hidden
   * from the list. The canvas squiggles hide simultaneously via LensPDF's
   * spellingHidden state. Default false.
   */
  hideSpelling?: boolean;
  /** Fires when the user clicks the Spelling toggle pill. */
  onToggleSpelling?: () => void;
}

/**
 * Sticky vertical sidebar for the LensPDF viewer.
 */
export function FindingsSidebar({
  items,
  selected = null,
  onSelect,
  title = "Preflight findings",
  filename,
  widthClass = "w-80",
  decisions,
  onDecide,
  hideSpelling = false,
  onToggleSpelling,
}: FindingsSidebarProps): React.ReactElement {
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [locatedOpen, setLocatedOpen] = useState(true);
  const [infoOpen, setInfoOpen] = useState(true);

  const allItems = useMemo(
    () =>
      Array.from(items ?? []).filter(
        (it) => !hideSpelling || it.type !== "spell_check",
      ),
    [items, hideSpelling],
  );

  const tierCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const it of allItems) {
      const t = tierLabel(it.tier);
      counts[t] = (counts[t] ?? 0) + 1;
    }
    return counts;
  }, [allItems]);

  const visible = useMemo(
    () =>
      tierFilter === "all"
        ? allItems
        : allItems.filter((i) => tierLabel(i.tier) === tierFilter),
    [allItems, tierFilter],
  );

  const { located, informational } = useMemo(
    () => splitFindingsByLocation(visible),
    [visible],
  );

  const total = allItems.length;
  const tierOrder: TierFilter[] = ["all", "error", "warning", "advisory", "info"];

  return (
    <aside
      className={`${widthClass} hidden shrink-0 flex-col border-r border-slate-800 bg-slate-900/60 text-slate-100 md:flex`}
    >
      <div className="border-b border-slate-800 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-300">
          {title}
        </p>
        {filename ? (
          <p className="mt-1 truncate text-xs text-slate-500" title={filename}>
            {filename}
          </p>
        ) : null}
        {total > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tierOrder.map((tier) => {
              const count = tier === "all" ? total : tierCounts[tier] ?? 0;
              if (tier !== "all" && count === 0) return null;
              const active = tierFilter === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => setTierFilter(tier)}
                  className={
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition " +
                    (active
                      ? "border-brand-400 bg-brand-900/40 text-brand-100"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-brand-500/60 hover:text-brand-200")
                  }
                >
                  {tier === "all" ? "All" : tier}
                  <span className="ml-1 text-slate-500">{count}</span>
                </button>
              );
            })}
            {/* Spelling toggle — only shown when there are spell_check items */}
            {Array.from(items ?? []).some((it) => it.type === "spell_check") && (
              <button
                type="button"
                onClick={onToggleSpelling}
                className={
                  "rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition " +
                  (hideSpelling
                    ? "border-slate-700 bg-slate-800 text-slate-500"
                    : "border-amber-700/60 bg-amber-900/20 text-amber-300 hover:border-amber-500/60")
                }
                title={hideSpelling ? "Show spelling findings" : "Hide spelling findings"}
              >
                {hideSpelling ? "Spelling off" : "✓ Spelling"}
              </button>
            )}
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {total === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">
            No findings on this PDF.
          </p>
        ) : null}

        {located.length > 0 ? (
          <SectionHeader
            label="Located in viewer"
            count={located.length}
            tone="brand"
            open={locatedOpen}
            onToggle={() => setLocatedOpen((v) => !v)}
          />
        ) : null}
        {locatedOpen && located.length > 0 ? (
          <ul className="divide-y divide-slate-800">
            {located.map((item) => {
              const tier = tierLabel(item.tier);
              const isSelected = selected?.id === item.id;
              const decision = decisions?.[item.id];
              const hasActiveDecision = decision?.is_active === true;
              return (
                <li key={item.id} className="group">
                  <button
                    type="button"
                    onClick={() => onSelect?.(item)}
                    className={
                      "flex w-full flex-col items-start gap-1 px-4 py-3 text-left text-xs transition " +
                      (isSelected ? "bg-brand-900/40" : "hover:bg-slate-900/80") +
                      (hasActiveDecision ? " opacity-60" : "")
                    }
                  >
                    <FindingRowHeader item={item} tier={tier} decision={decision} />
                    <span className="text-slate-200">
                      {item.label ?? item.description ?? item.code ?? "Finding"}
                    </span>
                  </button>
                  {/* Decision action buttons — shown on row hover */}
                  {onDecide && (
                    <div className="flex gap-1 border-t border-slate-800/60 px-4 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {hasActiveDecision ? (
                        <span className="text-[10px] text-emerald-400">
                          ✓ {decision.decision_type.charAt(0).toUpperCase() + decision.decision_type.slice(1)}
                          {" · "}
                          <button
                            type="button"
                            className="underline hover:text-white"
                            onClick={() => onDecide(item, "suppress")}
                          >
                            Revoke
                          </button>
                        </span>
                      ) : (
                        <>
                          <DecideButton label="Approve" type="button" onClick={() => onDecide(item, "approve")} color="emerald" />
                          <DecideButton label="Waive" type="button" onClick={() => onDecide(item, "waive")} color="amber" />
                          <DecideButton label="Reject" type="button" onClick={() => onDecide(item, "reject")} color="red" />
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}

        {informational.length > 0 ? (
          <SectionHeader
            label="Informational"
            count={informational.length}
            tone="muted"
            open={infoOpen}
            onToggle={() => setInfoOpen((v) => !v)}
          />
        ) : null}
        {infoOpen && informational.length > 0 ? (
          <ul className="divide-y divide-slate-800">
            {informational.map((item) => {
              const tier = tierLabel(item.tier);
              return (
                <li
                  key={item.id}
                  className="cursor-default px-4 py-3 text-xs"
                  title="No bounding box on this finding — not clickable in the viewer."
                >
                  <FindingRowHeader item={item} tier={tier} />
                  <span className="mt-1 block text-slate-300">
                    {item.label ?? item.description ?? item.code ?? "Finding"}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </aside>
  );
}

function FindingRowHeader({
  item,
  tier,
  decision,
}: {
  item: OverlayItem;
  tier: Tier;
  decision?: DecisionRecord;
}): React.ReactElement {
  return (
    <div className="flex w-full items-center gap-2">
      <span
        className={
          "rounded-full border px-2 py-0.5 text-[10px] font-medium " + TIER_TONE[tier].chip
        }
      >
        {tier}
      </span>
      {item.code ? (
        <span className="truncate font-mono text-[11px] text-slate-400">{item.code}</span>
      ) : null}
      {decision?.is_active && (
        <span className="rounded-full bg-emerald-900/40 px-1.5 py-0.5 text-[10px] text-emerald-400">
          ✓ {decision.decision_type}
        </span>
      )}
      <span className="ml-auto shrink-0 text-[11px] text-slate-500">p{item.page}</span>
    </div>
  );
}

function DecideButton({
  label,
  onClick,
  color,
}: {
  label: string;
  type: "button";
  onClick: () => void;
  color: "emerald" | "amber" | "red";
}): React.ReactElement {
  const cls =
    color === "emerald"
      ? "border-emerald-700/60 text-emerald-400 hover:bg-emerald-900/30"
      : color === "amber"
        ? "border-amber-700/60 text-amber-400 hover:bg-amber-900/30"
        : "border-red-700/60 text-red-400 hover:bg-red-900/30";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[10px] transition ${cls}`}
    >
      {label}
    </button>
  );
}

function SectionHeader({
  label,
  count,
  tone,
  open,
  onToggle,
}: {
  label: string;
  count: number;
  tone: "brand" | "muted";
  open: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const color = tone === "brand" ? "text-brand-300" : "text-slate-400";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center gap-2 border-y border-slate-800 bg-slate-900/80 px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider transition hover:bg-slate-900 ${color}`}
    >
      <span
        aria-hidden="true"
        className={`inline-block w-2 text-center transition-transform ${open ? "rotate-90" : ""}`}
      >
        ▶
      </span>
      <span>
        {label} · {count}
      </span>
    </button>
  );
}
