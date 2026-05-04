"use client";

import { useEffect, useState } from "react";

/**
 * Single-source mobile breakpoint matcher used by the demo / drop-in
 * viewer to decide whether to render touch-first chrome (slide-in
 * tools drawer, bottom-sheet readouts) instead of the desktop
 * sidebar / floating-tooltip layout.
 *
 * The default breakpoint matches Tailwind's `md` (768 px). Pass a
 * custom value to override per-component.
 *
 * SSR-safe: returns `false` on the server (assumes desktop) so the
 * first paint matches the static HTML, then re-evaluates on mount.
 *
 * @public
 */
export function useIsMobile(maxWidthPx = 767): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [maxWidthPx]);
  return isMobile;
}
