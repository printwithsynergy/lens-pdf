"use client";

import { useState } from "react";
import type { ViewerConfig } from "../types";
import { useViewerHost } from "../host";
import { ZoomControls } from "./ZoomControls";
import { hostFallbackClient } from "../../lib/host-fallback-client";

type ViewerMode = "normal" | "separation" | "layers" | "annotation" | "comparison" | "health" | "chain";
type MeasureMode = "none" | "color_picker" | "densitometer" | "ruler";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  config: ViewerConfig;
  viewerMode: ViewerMode;
  onToggleMode: (mode: ViewerMode) => void;
  measureMode: MeasureMode;
  onToggleMeasure: (mode: MeasureMode) => void;
  showTacHeatmap: boolean;
  onToggleTacHeatmap: () => void;
  showBoxOverlay: boolean;
  onToggleBoxOverlay: () => void;
  fileName?: string;
  findingSummary: { error: number; warning: number; advisory: number };
  zoom: number;
  onZoomChange: (zoom: number) => void;
  jobId: string;
  onExpandSheet: () => void;
  onOpenShare?: () => void;
  hasChain?: boolean;
}

/* ── Section with collapsible header ── */
function DrawerSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300"
      >
        <span>{title}</span>
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-1">{children}</div>}
    </div>
  );
}

/* ── Individual drawer item ── */
function DrawerItem({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
        {icon}
      </span>
      <span className={active ? "font-medium text-white" : ""}>{label}</span>
      {active && (
        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-400" />
      )}
    </button>
  );
}

/* ── Link item (for exports) ── */
function DrawerLink({
  label,
  icon,
  href,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  href: string;
  onClick: () => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-800"
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
        {icon}
      </span>
      <span>{label}</span>
      <svg className="ml-auto h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
      </svg>
    </a>
  );
}

/* ── SVG Icons ── */
const Icons = {
  findings: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  ),
  separations: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="9" cy="9" r="5" /><circle cx="15" cy="9" r="5" /><circle cx="12" cy="15" r="5" />
    </svg>
  ),
  layers: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  annotate: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  compare: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  ),
  heatmap: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2a7 7 0 00-2 13.75V18h4v-2.25A7 7 0 0012 2zM9 21h6" />
    </svg>
  ),
  boxes: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" strokeDasharray="3 2" />
    </svg>
  ),
  color_picker: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M16.5 3.5l4 4-10 10-4 1 1-4 10-10z" />
      <path d="M12.5 7.5l4 4" />
    </svg>
  ),
  densitometer: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" strokeOpacity="0.4" />
      <path d="M7 8l10 8" strokeOpacity="0.4" />
    </svg>
  ),
  ruler: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M2 12h20M6 8v8M10 9v6M14 8v8M18 9v6" />
    </svg>
  ),
  report: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
    </svg>
  ),
  download: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    </svg>
  ),
};

export function MobileDrawer({
  isOpen,
  onClose,
  config,
  viewerMode,
  onToggleMode,
  measureMode,
  onToggleMeasure,
  showTacHeatmap,
  onToggleTacHeatmap,
  showBoxOverlay,
  onToggleBoxOverlay,
  fileName,
  findingSummary,
  zoom,
  onZoomChange,
  jobId,
  onExpandSheet,
  onOpenShare,
  hasChain,
}: MobileDrawerProps) {
  const { apiBase, readOnly } = useViewerHost();

  const handlePanelMode = (fn: () => void) => {
    fn();
    onExpandSheet();
    onClose();
  };

  const handleTool = (fn: () => void) => {
    fn();
    onClose();
  };

  const reportBase = apiBase.replace(/\/viewer\/.*$/, "/reports/" + jobId);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 left-0 z-[60] w-[280px] bg-slate-900 shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-white/[0.06] px-4">
          <span className="text-sm font-bold text-white">
            {config.anonymous
              ? "Preflight Report"
              : config.brand_name || hostFallbackClient()}
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto" style={{ height: "calc(100% - 48px)" }}>
          {/* Findings summary */}
          <div className="border-b border-white/[0.06] px-4 py-3">
            {fileName && (
              <div className="mb-1 truncate text-xs text-slate-400">{fileName}</div>
            )}
            <div className="flex gap-3 text-xs font-medium">
              <span className="text-red-400">{findingSummary.error} errors</span>
              <span className="text-amber-400">{findingSummary.warning} warnings</span>
              <span className="text-blue-400">{findingSummary.advisory} info</span>
            </div>
          </div>

          {/* ── View Modes ── */}
          <DrawerSection title="View" defaultOpen>
            <DrawerItem
              label="Health Report"
              icon={Icons.report}
              active={viewerMode === "health"}
              onClick={() => handlePanelMode(() => onToggleMode("health"))}
            />
            {hasChain && (
              <DrawerItem
                label="Approval Chain"
                icon={(
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                active={viewerMode === "chain"}
                onClick={() => handlePanelMode(() => onToggleMode("chain"))}
              />
            )}
            <DrawerItem
              label="Findings"
              icon={Icons.findings}
              active={viewerMode === "normal"}
              onClick={() => handlePanelMode(() => onToggleMode("normal"))}
            />
            {config.enable_separations && (
              <DrawerItem
                label="Ink Separations"
                icon={Icons.separations}
                active={viewerMode === "separation"}
                onClick={() => handlePanelMode(() => onToggleMode("separation"))}
              />
            )}
            {config.enable_layers && (
              <DrawerItem
                label="PDF Layers"
                icon={Icons.layers}
                active={viewerMode === "layers"}
                onClick={() => handlePanelMode(() => onToggleMode("layers"))}
              />
            )}
          </DrawerSection>

          {/* ── Review (hidden in read-only mode) ── */}
          {!readOnly && (config.enable_annotations || config.enable_comparison) && (
            <DrawerSection title="Review" defaultOpen>
              {config.enable_annotations && (
                <DrawerItem
                  label="Annotations"
                  icon={Icons.annotate}
                  active={viewerMode === "annotation"}
                  onClick={() => handlePanelMode(() => onToggleMode("annotation"))}
                />
              )}
              {config.enable_comparison && (
                <DrawerItem
                  label="Compare Versions"
                  icon={Icons.compare}
                  active={viewerMode === "comparison"}
                  onClick={() => handlePanelMode(() => onToggleMode("comparison"))}
                />
              )}
            </DrawerSection>
          )}

          {/* ── Analysis Tools ── */}
          <DrawerSection title="Analysis Tools" defaultOpen>
            {config.enable_tac_heatmap && (
              <DrawerItem
                label="TAC Heatmap"
                icon={Icons.heatmap}
                active={showTacHeatmap}
                onClick={() => handleTool(onToggleTacHeatmap)}
              />
            )}
            <DrawerItem
              label="Trim / Bleed Boxes"
              icon={Icons.boxes}
              active={showBoxOverlay}
              onClick={() => handleTool(onToggleBoxOverlay)}
            />
            {config.enable_measurement && (
              <>
                <DrawerItem
                  label="Color Picker"
                  icon={Icons.color_picker}
                  active={measureMode === "color_picker"}
                  onClick={() => handleTool(() => onToggleMeasure("color_picker"))}
                />
                <DrawerItem
                  label="Densitometer (C/M/Y/K + TAC)"
                  icon={Icons.densitometer}
                  active={measureMode === "densitometer"}
                  onClick={() => handleTool(() => onToggleMeasure("densitometer"))}
                />
                <DrawerItem
                  label="Ruler"
                  icon={Icons.ruler}
                  active={measureMode === "ruler"}
                  onClick={() => handleTool(() => onToggleMeasure("ruler"))}
                />
              </>
            )}
          </DrawerSection>

          {/* ── Zoom ── */}
          <DrawerSection title="Zoom" defaultOpen={false}>
            <div className="px-3 py-2">
              <ZoomControls zoom={zoom} onZoomChange={onZoomChange} compact dark />
            </div>
          </DrawerSection>

          {/* ── Share & Export ── */}
          {(onOpenShare || config.enable_html_report_link || config.enable_download) && (
            <DrawerSection title="Share &amp; Export" defaultOpen={false}>
              {onOpenShare && (
                <DrawerItem
                  label="Email Share"
                  icon={(
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  )}
                  active={false}
                  onClick={() => handleTool(onOpenShare)}
                />
              )}
              {config.enable_html_report_link && (
                <DrawerLink
                  label="View HTML Report"
                  icon={Icons.report}
                  href={`${reportBase}/html`}
                  onClick={onClose}
                />
              )}
              {config.enable_download && (
                <DrawerLink
                  label="Download PDF"
                  icon={Icons.download}
                  href={`${reportBase}/download`}
                  onClick={onClose}
                />
              )}
            </DrawerSection>
          )}
        </div>
      </div>
    </>
  );
}
