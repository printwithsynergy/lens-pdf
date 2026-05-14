"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { LayerInfo } from "../types";
import {
  logUnwiredHide,
  useFallbackMode,
  useViewerHost,
  useViewerServices,
} from "../host";

interface LayerPanelProps {
  jobId: string;
  enabledLayers: Set<number>;
  onToggleLayer: (ocgIndex: number) => void;
  onSetAllLayers: (enabled: boolean) => void;
}

const FLATTENED_LAYER_INDEX = -1;
const FLATTENED_LAYER: LayerInfo = {
  name: "Artwork (flattened PDF)",
  ocg_index: FLATTENED_LAYER_INDEX,
  default_on: true,
  synthetic: true,
  kind: "flattened-artwork",
};

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: 8,
  fontSize: 12,
  color: "#e2e8f0",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const headerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  color: "#f8fafc",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  gap: 6,
};

const allButtonStyle: CSSProperties = {
  background: "transparent",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 4,
  color: "#cbd5e1",
  fontSize: 11,
  padding: "2px 6px",
  cursor: "pointer",
};

const layerListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const layerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "4px 6px",
  borderRadius: 4,
  cursor: "pointer",
  color: "#e2e8f0",
  fontSize: 12,
  background: "transparent",
  transition: "background 0.12s ease",
};

const layerNameStyle: CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const messageStyle: CSSProperties = {
  margin: 0,
  padding: "8px 6px",
  fontSize: 12,
  color: "rgba(226,232,240,0.55)",
  fontStyle: "italic",
};

const errorStyle: CSSProperties = {
  ...messageStyle,
  color: "#fca5a5",
  fontStyle: "normal",
};

const loadingRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 6px",
  fontSize: 12,
  color: "rgba(226,232,240,0.55)",
  fontStyle: "italic",
};

const spinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.18)",
  borderTopColor: "rgba(255,255,255,0.65)",
  animation: "lens-pdf-layer-spin 0.85s linear infinite",
};

const SPINNER_KEYFRAMES = `@keyframes lens-pdf-layer-spin {
  to { transform: rotate(360deg); }
}`;

export function LayerPanel({
  jobId: _jobId,
  enabledLayers,
  onToggleLayer,
  onSetAllLayers,
}: LayerPanelProps) {
  const { layers: layerService } = useViewerServices();
  const { debug, pdfFallback } = useViewerHost();
  const mode = useFallbackMode(layerService);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const displayLayers = layers.length > 0 ? layers : [FLATTENED_LAYER];
  const showingSyntheticFallback =
    displayLayers.length === 1 && displayLayers[0]?.synthetic === true;

  const fetchLayers = useCallback(async () => {
    try {
      const items =
        mode === "fallback" && pdfFallback
          ? await pdfFallback.listLayers()
          : await layerService.listLayers();
      setLayers([...items]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load layers");
    } finally {
      setLoading(false);
    }
  }, [layerService, pdfFallback, mode]);

  useEffect(() => {
    if (mode === "hidden") {
      if (debug) logUnwiredHide("LayerPanel", "layers");
      return;
    }
    fetchLayers();
  }, [fetchLayers, mode, debug]);

  if (mode === "hidden") return null;

  if (loading) {
    return (
      <>
        <style>{SPINNER_KEYFRAMES}</style>
        <div style={loadingRowStyle}>
          <span aria-hidden style={spinnerStyle} />
          <span>Loading layers…</span>
        </div>
      </>
    );
  }

  if (error) {
    return <div style={errorStyle}>{error}</div>;
  }

  return (
    <div style={containerStyle}>
      <div style={headerRowStyle}>
        <h3 style={headerTitleStyle}>Layers ({displayLayers.length})</h3>
        <div style={headerActionsStyle}>
          <button
            type="button"
            onClick={() => onSetAllLayers(true)}
            style={allButtonStyle}
            title="Show every layer"
          >
            All on
          </button>
          <button
            type="button"
            onClick={() => onSetAllLayers(false)}
            style={allButtonStyle}
            title="Hide every layer"
          >
            All off
          </button>
        </div>
      </div>
      {showingSyntheticFallback && (
        <p style={messageStyle}>
          No optional-content groups (OCGs) were found, so this row represents
          the flattened page artwork. Many exported PDFs are flat.
        </p>
      )}

      <div style={layerListStyle}>
        {displayLayers.map((layer) => (
          <label
            key={layer.ocg_index}
            style={layerRowStyle}
            title={`Toggle "${layer.name}"`}
          >
            <input
              type="checkbox"
              checked={enabledLayers.has(layer.ocg_index)}
              onChange={() => onToggleLayer(layer.ocg_index)}
            />
            <span style={layerNameStyle}>{layer.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
