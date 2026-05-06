export type LoupePDFTool =
  | "color-picker"
  | "densitometer"
  | "measure"
  | "annotate"
  | "tac-heatmap"
  | "separations"
  | "layers";

export const DEFAULT_LOUPE_PDF_TOOLS: ReadonlyArray<LoupePDFTool> = [
  "color-picker",
  "densitometer",
  "measure",
  "annotate",
  "tac-heatmap",
  "separations",
  "layers",
];
