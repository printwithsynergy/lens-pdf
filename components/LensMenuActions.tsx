"use client";

import type { CSSProperties } from "react";
import type { ThemeTokens } from "../plugin/services";
import type { LensMenuAction } from "./shellPlugins";

interface LensMenuActionsProps {
  tokens: ThemeTokens;
  actions: ReadonlyArray<LensMenuAction>;
}

function rowStyle(): CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingBottom: 10,
    marginBottom: 10,
  };
}

function buttonStyle(tokens: ThemeTokens): CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "10px 12px",
    borderRadius: 6,
    border: `1px solid ${tokens.border}`,
    background: "rgba(255, 255, 255, 0.04)",
    color: tokens.fg,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    textDecoration: "none",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  };
}

function sortedActions(actions: ReadonlyArray<LensMenuAction>): ReadonlyArray<LensMenuAction> {
  return [...actions].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

export function LensMenuActions({ tokens, actions }: LensMenuActionsProps) {
  if (!actions.length) return null;
  const ordered = sortedActions(actions);
  const btn = buttonStyle(tokens);

  return (
    <div
      style={{
        ...rowStyle(),
        borderBottom: `1px solid ${tokens.border}`,
      }}
    >
      {ordered.map((action) => {
        if (action.href) {
          return (
            <a
              key={action.id}
              href={action.href}
              download={action.download}
              target={action.external ? "_blank" : undefined}
              rel={action.external ? "noopener noreferrer" : undefined}
              style={btn}
            >
              {action.label}
            </a>
          );
        }
        return (
          <button key={action.id} type="button" onClick={action.onClick} style={btn}>
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
