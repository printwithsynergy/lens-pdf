"use client";

import type { LoupePDFShellPlugin } from "./shellPlugins";
import { createDefaultShellPlugins } from "./defaultShellPlugins";

export type LoupePDFPresetKind = "demo" | "minimal";

/**
 * First-party presets shipped with LoupePDF. Both preserve full feature
 * surface; hosts can still override by supplying custom shell plugins.
 */
export function pluginsForPreset(preset: LoupePDFPresetKind): LoupePDFShellPlugin[] {
  const defaults = createDefaultShellPlugins();
  if (preset === "minimal") {
    return defaults;
  }
  return defaults;
}

