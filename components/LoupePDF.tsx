"use client";

/**
 * `<LoupePDF>` — drop-in production viewer.
 *
 * One mount, every viewer-only feature wired by default:
 *
 * ```tsx
 * import { LoupePDF } from "@printwithsynergy/loupe-pdf";
 * import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
 *
 * <LoupePDF pdfUrl="/proofs/abc.pdf" workerSrc={pdfWorkerSrc} />
 * ```
 *
 * Production hosts can plug in their own preflight engine without
 * forking the viewer:
 *
 * ```tsx
 * <LoupePDF
 *   pdfUrl="/proofs/abc.pdf"
 *   workerSrc={pdfWorkerSrc}
 *   items={findings}            // OverlayItem[] from your engine
 *   selectedItem={selected}
 *   onItemSelect={setSelected}
 *   dieline={dielineForCurrentPage}
 *   showBoxOverlays              // trim / bleed / crop popovers
 *   tools={["color-picker", "annotate", "tac-heatmap", "separations"]}
 *   onPageChange={setCurrentPage}
 *   tokens={{ accent: "#e50c6a" }}
 * />
 * ```
 *
 * Identical to {@link LoupePDFDemo} except the upload chrome (URL bar,
 * file picker, drag-and-drop, empty state) is hidden — `pdfUrl` is the
 * single required prop, and changing it swaps the loaded document.
 *
 * @public
 */

import { useCallback, useMemo, useState } from "react";
import { ViewerHostContext, ViewerServicesContext } from "../host";
import { darkThemeTokens, type ThemeTokens, type ViewerServices } from "../plugin/services";
import type { OverlayItem } from "../plugin/types";
import type { DielineResult } from "../types";
import { shellStyle } from "./LoupePDFDemo.styles";
import { LoupePDFViewerShell } from "./LoupePDFViewerShell";
import type { LoupePDFPresetKind } from "./presets";
import type { LoupePDFShellPlugin } from "./shellPlugins";
import { useIsMobile } from "./useIsMobile";
import { useLoupeViewerController } from "./useLoupeViewerController";
import type { LoupePDFTool } from "./viewerTools";

/**
 * Props for {@link LoupePDF}. Identical to {@link LoupePDFDemoProps}
 * except `pdfUrl` is required (replaces `initialPdfUrl`) and the
 * upload-chrome props (`maxFileSize`) are hidden.
 *
 * @public
 */
export interface LoupePDFProps {
  pdfUrl: string;
  workerSrc?: string;
  services?: ViewerServices;
  tokens?: Partial<ThemeTokens>;
  className?: string;
  tools?: ReadonlyArray<LoupePDFTool>;
  initialZoom?: number;
  initialPage?: number;
  tacLimit?: number;
  items?: readonly OverlayItem[];
  selectedItem?: OverlayItem | null;
  onItemSelect?: (item: OverlayItem | null) => void;
  dieline?: DielineResult | null;
  showBoxOverlays?: boolean;
  cropToTrim?: boolean;
  onPageChange?: (page: number) => void;
  onZoomChange?: (zoom: number) => void;
  onError?: (message: string) => void;
  preset?: LoupePDFPresetKind;
  plugins?: ReadonlyArray<LoupePDFShellPlugin>;
}

/**
 * Drop-in production viewer. See {@link LoupePDFProps} for the full
 * prop surface.
 *
 * @public
 */
export function LoupePDF({
  pdfUrl,
  workerSrc,
  services,
  tokens: tokenOverrides,
  className,
  tools,
  initialZoom = 80,
  initialPage = 1,
  tacLimit = 300,
  items = [],
  selectedItem,
  onItemSelect,
  dieline,
  showBoxOverlays = false,
  cropToTrim = false,
  onPageChange,
  onZoomChange,
  onError,
  preset = "minimal",
  plugins = [],
}: LoupePDFProps) {
  const tokens = useMemo(
    () => ({ ...darkThemeTokens, ...tokenOverrides }),
    [tokenOverrides],
  );
  const [internalSelected, setInternalSelected] = useState<OverlayItem | null>(null);
  const effectiveSelected = onItemSelect ? (selectedItem ?? null) : internalSelected;
  const handleItemClick = useCallback(
    (item: OverlayItem) => {
      if (onItemSelect) onItemSelect(item);
      else setInternalSelected(item);
    },
    [onItemSelect],
  );
  const isMobile = useIsMobile();

  const controller = useLoupeViewerController({
    pdfUrl,
    workerSrc,
    services,
    tools: tools ?? [
      "color-picker",
      "densitometer",
      "measure",
      "annotate",
      "tac-heatmap",
      "separations",
      "layers",
    ],
    initialPage,
    initialZoom,
    tacLimit,
    tokens,
    isMobile,
    preset,
    plugins,
    onPageChange,
    onZoomChange,
    onError,
  });

  return (
    <ViewerHostContext.Provider value={controller.hostValue}>
      {controller.services ? (
        <ViewerServicesContext.Provider value={controller.services}>
          <div className={className} style={shellStyle(tokens, false)}>
            <LoupePDFViewerShell
              controller={controller}
              tokens={tokens}
              isMobile={isMobile}
              pdfUrl={pdfUrl}
              cropToTrim={cropToTrim}
              showBoxOverlays={showBoxOverlays}
              tacLimit={tacLimit}
              dieline={dieline ?? null}
              overlayItems={items}
              effectiveSelected={effectiveSelected}
              onOverlayItemClick={handleItemClick}
            />
          </div>
        </ViewerServicesContext.Provider>
      ) : (
        <div className={className} style={shellStyle(tokens, false)}>
          <LoupePDFViewerShell
            controller={controller}
            tokens={tokens}
            isMobile={isMobile}
            pdfUrl={pdfUrl}
            cropToTrim={cropToTrim}
            showBoxOverlays={showBoxOverlays}
            tacLimit={tacLimit}
            dieline={dieline ?? null}
            overlayItems={items}
            effectiveSelected={effectiveSelected}
            onOverlayItemClick={handleItemClick}
          />
        </div>
      )}
    </ViewerHostContext.Provider>
  );
}
