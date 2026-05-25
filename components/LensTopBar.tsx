"use client";

import type { CSSProperties, ReactNode } from "react";
import type { ThemeTokens } from "../plugin/services";
import type { LensTopBarAction } from "./shellPlugins";
import { ghostBtnStyle } from "./LensPDFDemo.styles";

interface LensTopBarProps {
  tokens: ThemeTokens;
  isMobile: boolean;
  /** Brand label text (e.g., "LintPDF"). Hidden under ~480px to keep
   *  room for the action buttons on narrow screens. */
  brand?: string;
  /** Optional brand logo URL. Rendered to the left of the brand text. */
  brandLogoUrl?: string;
  /** Host-injected action buttons (Download, Back to demo, etc.). */
  actions?: ReadonlyArray<LensTopBarAction>;
  /** Slot content from `topbar` shell plugins. Rendered between the
   *  brand block and the action buttons (typically empty). */
  pluginNodes?: ReadonlyArray<ReactNode>;
  /** True when the mobile drawer is open — controls hamburger
   *  aria-expanded + lets the parent dim/hide the bar if it wants. */
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
    // Sticky inside the LensPDF flex column — stays visible while the
    // canvas scrolls. zIndex chosen to clear sticky overlay toolbars
    // (30) and canvas content but stay below the mobile drawer (141).
    position: "sticky",
    top: 0,
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

function brandStyle(tokens: ThemeTokens, hideText: boolean): CSSProperties {
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
    // Allow the brand to shrink before action buttons do
    flexShrink: 1,
    // Used to mark the text portion as hidden via CSS-in-JS
    // (display: none) when the viewport is narrower than the brand
    // breakpoint. We can't use real media queries here, so callers
    // pass `hideText` based on a window-width check upstream.
    ...(hideText ? { fontSize: 0 } : {}),
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

function actionsRowStyle(): CSSProperties {
  return {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    overflowX: "auto",
    // Hide horizontal scrollbar on overflow so the bar still looks
    // clean if a host adds many buttons — users can flick-scroll.
    scrollbarWidth: "none",
  };
}

function sortedActions(
  actions: ReadonlyArray<LensTopBarAction>,
): ReadonlyArray<LensTopBarAction> {
  return [...actions].sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100),
  );
}

export function LensTopBar({
  tokens,
  isMobile,
  brand,
  brandLogoUrl,
  actions,
  pluginNodes,
  mobileSidebarOpen,
  onToggleMobileSidebar,
}: LensTopBarProps) {
  const hasBrand = !!brand || !!brandLogoUrl;
  const orderedActions = actions && actions.length > 0 ? sortedActions(actions) : [];
  const ghost = ghostBtnStyle(tokens);

  return (
    <div style={rootStyle(tokens)} role="toolbar" aria-label="Viewer top bar">
      {isMobile && (
        <button
          type="button"
          aria-label="Open tools panel"
          aria-expanded={mobileSidebarOpen}
          onClick={onToggleMobileSidebar}
          style={hamburgerStyle(tokens)}
        >
          {"☰"}
        </button>
      )}

      {hasBrand && (
        <div style={brandStyle(tokens, false)}>
          {brandLogoUrl && (
            <img src={brandLogoUrl} alt="" style={logoStyle()} />
          )}
          {brand && <span>{brand}</span>}
        </div>
      )}

      {pluginNodes && pluginNodes.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {pluginNodes.map((node, i) => (
            <div key={i}>{node}</div>
          ))}
        </div>
      )}

      {orderedActions.length > 0 && (
        <div style={actionsRowStyle()}>
          {orderedActions.map((action) => {
            const commonStyle = ghost;
            if (action.href) {
              return (
                <a
                  key={action.id}
                  href={action.href}
                  download={action.download}
                  target={action.external ? "_blank" : undefined}
                  rel={action.external ? "noopener noreferrer" : undefined}
                  style={{ ...commonStyle, textDecoration: "none" }}
                >
                  {action.label}
                </a>
              );
            }
            return (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                style={commonStyle}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
