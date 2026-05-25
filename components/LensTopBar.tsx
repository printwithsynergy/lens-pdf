"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ThemeTokens } from "../plugin/services";

interface LensTopBarProps {
  tokens: ThemeTokens;
  isMobile: boolean;
  /** Brand label text (e.g., "LintPDF"). */
  brand?: string;
  /** Optional brand logo URL. Rendered to the left of the brand text. */
  brandLogoUrl?: string;
  /** Slot content from `topbar` shell plugins. Rendered to the right
   *  of the brand block (typically empty). */
  pluginNodes?: ReadonlyArray<ReactNode>;
  /** True when the mobile drawer is open — controls hamburger
   *  `aria-expanded`. */
  mobileSidebarOpen: boolean;
  /** Toggle for the mobile drawer. Only invoked on mobile. */
  onToggleMobileSidebar: () => void;
}

function rootStyle(tokens: ThemeTokens): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    background: tokens.bg,
    borderBottom: `1px solid ${tokens.border}`,
    flexShrink: 0,
    minHeight: 48,
    // `position: relative` — the shell wrapper has `overflow:
    // hidden` so sticky would degrade to relative anyway, and on
    // iOS Safari a sticky element inside an overflow:hidden parent
    // has been observed to misroute touch events away from sibling
    // scroll containers. Keep it simple.
    position: "relative",
    zIndex: 50,
  };
}

function hamburgerStyle(tokens: ThemeTokens): CSSProperties {
  return {
    flexShrink: 0,
    width: 40,
    height: 40,
    borderRadius: 8,
    border: `1px solid ${tokens.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    color: tokens.fg,
    cursor: "pointer",
    fontSize: 20,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };
}

function brandBlockStyle(tokens: ThemeTokens): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: tokens.fg,
    fontWeight: 600,
    fontSize: 14,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    minWidth: 0,
    flexShrink: 1,
  };
}

function logoStyle(): CSSProperties {
  return {
    width: 22,
    height: 22,
    borderRadius: 4,
    objectFit: "contain",
    flexShrink: 0,
  };
}

export function LensTopBar({
  tokens,
  isMobile,
  brand,
  brandLogoUrl,
  pluginNodes,
  mobileSidebarOpen,
  onToggleMobileSidebar,
}: LensTopBarProps) {
  const hasBrand = !!brand || !!brandLogoUrl;

  return (
    <div style={rootStyle(tokens)} role="toolbar" aria-label="Viewer top bar">
      {isMobile && (
        <button
          type="button"
          aria-label="Open tools menu"
          aria-expanded={mobileSidebarOpen}
          onClick={onToggleMobileSidebar}
          style={hamburgerStyle(tokens)}
        >
          {"☰"}
        </button>
      )}

      {hasBrand && (
        <div style={brandBlockStyle(tokens)}>
          {brandLogoUrl && (
            <img src={brandLogoUrl} alt="" style={logoStyle()} />
          )}
          {brand && <span>{brand}</span>}
        </div>
      )}

      {pluginNodes && pluginNodes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
          {pluginNodes.map((node, i) => (
            <div key={i}>{node}</div>
          ))}
        </div>
      )}
    </div>
  );
}
