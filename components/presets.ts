"use client";

import type { LensPDFShellPlugin } from "./shellPlugins";
import { createDefaultShellPlugins } from "./defaultShellPlugins";

export type LensPDFPresetKind = "demo" | "minimal";

/**
 * First-party presets shipped with LensPDF. Both preserve full feature
 * surface; hosts can still override by supplying custom shell plugins.
 */
export function pluginsForPreset(preset: LensPDFPresetKind): LensPDFShellPlugin[] {
  const defaults = createDefaultShellPlugins();
  if (preset === "minimal") {
    return defaults;
  }
  return defaults;
}

