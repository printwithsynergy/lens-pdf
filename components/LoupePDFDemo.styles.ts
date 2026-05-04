/**
 * Inlined styles for {@link LoupePDFDemo} / {@link LoupePDF}. Kept
 * outside the main component so the entrypoint focuses on viewer
 * behaviour, and so consumers reading the source aren't scrolling
 * past 270 lines of CSS-in-JS to find the React tree.
 *
 * Every helper accepts the resolved {@link ThemeTokens} so consumers
 * recolour the chrome by passing a `tokens` prop instead of editing
 * stylesheets. The viewer is zero-config — no Tailwind / CSS framework
 * needs to be wired into the host application.
 */

import type { CSSProperties } from "react";
import type { ThemeTokens } from "../plugin/services";

export function shellStyle(
  tokens: ThemeTokens,
  fullscreen: boolean,
): CSSProperties {
  const base: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    minHeight: 0,
    background: tokens.bg,
    color: tokens.fg,
    fontFamily: "system-ui, -apple-system, sans-serif",
    fontSize: 14,
    position: "relative",
    overflow: "hidden",
    colorScheme: "dark",
  };
  if (fullscreen) {
    return { ...base, position: "fixed", inset: 0, zIndex: 9999 };
  }
  return base;
}

export const topbarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 16px",
  borderBottom: "1px solid var(--lpd-border, #2b2138)",
  flexShrink: 0,
};

export const brandStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
  fontSize: 15,
  whiteSpace: "nowrap",
};

export const urlBarStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  minWidth: 0,
  gap: 6,
};

export function urlInputStyle(tokens: ThemeTokens): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    padding: "7px 10px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    color: tokens.fg,
    fontSize: 13,
    outline: "none",
  };
}

export function btnStyle(tokens: ThemeTokens): CSSProperties {
  return {
    padding: "7px 16px",
    borderRadius: 6,
    border: `1px solid ${tokens.accent}`,
    background: tokens.accent,
    color: "#fff",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
  };
}

export function ghostBtnStyle(tokens: ThemeTokens): CSSProperties {
  return {
    padding: "7px 14px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    color: tokens.fg,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
  };
}

export const layoutStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
};

export function sidebarStyle(tokens: ThemeTokens): CSSProperties {
  return {
    width: 280,
    flexShrink: 0,
    borderRight: `1px solid ${tokens.border}`,
    padding: 16,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
}

export const stageStyle: CSSProperties = {
  flex: 1,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: 24,
  gap: 12,
};

export function errorStyle(): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    background: "#7f1d1d",
    color: "#fecaca",
    fontSize: 13,
    flexShrink: 0,
  };
}

export function footerStyle(tokens: ThemeTokens): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    borderTop: `1px solid ${tokens.border}`,
    fontSize: 12,
    opacity: 0.7,
    flexShrink: 0,
  };
}

export const dropOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  fontSize: 24,
  fontWeight: 700,
  color: "#fff",
  pointerEvents: "none",
};

export const emptyStateStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 12,
  padding: 48,
  textAlign: "center",
  opacity: 0.85,
  margin: "auto",
};

export const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  cursor: "pointer",
  padding: "3px 0",
};

export const headingStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  opacity: 0.6,
  margin: "8px 0 4px",
};

export const exitFsStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 10001,
  padding: "4px 12px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.3)",
  background: "rgba(0,0,0,0.5)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

export const channelSwatchStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 3,
  border: "1px solid rgba(255, 255, 255, 0.18)",
  flexShrink: 0,
};

export const pageNavStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  padding: "6px 0",
};

export function pageNavBtnStyle(
  tokens: ThemeTokens,
  disabled: boolean,
): CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "transparent",
    color: tokens.fg,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.35 : 1,
    fontSize: 16,
    lineHeight: 1,
  };
}

export const stageInnerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
};

export function modeButtonGroupStyle(): CSSProperties {
  return {
    display: "flex",
    width: "100%",
    gap: 0,
  };
}

export function modeButtonStyle(
  tokens: ThemeTokens,
  active: boolean,
  position: "left" | "middle" | "right",
): CSSProperties {
  return {
    flex: 1,
    padding: "6px 8px",
    border: `1px solid ${active ? tokens.accent : tokens.border}`,
    background: active ? tokens.accent : "transparent",
    color: active ? "#fff" : tokens.fg,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    borderRadius:
      position === "left"
        ? "6px 0 0 6px"
        : position === "right"
          ? "0 6px 6px 0"
          : "0",
    marginLeft: position === "left" ? 0 : -1,
  };
}

export const preparingOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(14, 10, 20, 0.7)",
  fontSize: 13,
  zIndex: 50,
  color: "#cbd5e1",
};
