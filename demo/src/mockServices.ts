import type { ViewerServices } from "@printwithsynergy/loupe-pdf/plugin";
import { defaultThemeTokens, noopI18n, noopTelemetry } from "@printwithsynergy/loupe-pdf/plugin";

/**
 * Fully-mocked services used in the demo's "Full mock" mode. Returns
 * fake data for every protocol so every component renders something
 * — the goal is to exercise the wired-but-empty vs wired-with-data
 * paths, not to look pretty.
 */
export const mockServices: ViewerServices = {
  pageImages: {
    // 1x1 transparent PNG so the page tile actually loads but doesn't
    // fight the demo's dark background.
    getPageImageUrl: () =>
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkAAIAAAoAAv/lxKUAAAAASUVORK5CYII=",
  },
  layers: {
    getLayerImageUrl: () => "",
    listLayers: async () => [
      { name: "Background", ocg_index: 0, default_on: true },
      { name: "CutContour", ocg_index: 1, default_on: true },
      { name: "Notes", ocg_index: 2, default_on: false },
    ],
  },
  separations: {
    getChannelImageUrl: () => "",
  },
  tacHeatmap: {
    getHeatmapImageUrl: () => "",
    listRuns: async () => [],
  },
  colorSample: {
    sampleAt: async ({ pdfX, pdfY }) => ({
      x: pdfX,
      y: pdfY,
      rgb: [50, 100, 200],
      hex: "#3264c8",
      tac: 142.7,
    }),
  },
  densitometer: {
    sampleAt: async ({ pdfX, pdfY, tacLimit }) => ({
      x: pdfX,
      y: pdfY,
      dpi: 300,
      channels: [
        { name: "Cyan", percent: 62.3 },
        { name: "Magenta", percent: 18.1 },
        { name: "Yellow", percent: 4.7 },
        { name: "Black", percent: 91.5 },
      ],
      tac: 176.6,
      tac_limit: tacLimit,
      limit_exceeded: false,
    }),
  },
  annotations: {
    list: async () => [],
    getForPage: async () => null,
    saveForPage: async () => {},
    remove: async () => {},
  },
  reports: {
    getHtmlReportUrl: () => "/mock/report.html",
    getPdfDownloadUrl: () => "/mock/report.pdf",
  },
  telemetry: noopTelemetry,
  i18n: noopI18n,
  tokens: defaultThemeTokens,
};
