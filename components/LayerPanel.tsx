"use client";

import { useCallback, useEffect, useState } from "react";
import type { LayerInfo } from "../types";
import { useViewerServices } from "../host";

interface LayerPanelProps {
  jobId: string;
  enabledLayers: Set<number>;
  onToggleLayer: (ocgIndex: number) => void;
  onSetAllLayers: (enabled: boolean) => void;
}

export function LayerPanel({
  jobId: _jobId,
  enabledLayers,
  onToggleLayer,
  onSetAllLayers,
}: LayerPanelProps) {
  const { layers: layerService } = useViewerServices();
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLayers = useCallback(async () => {
    try {
      const items = await layerService.listLayers();
      setLayers([...items]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load layers");
    } finally {
      setLoading(false);
    }
  }, [layerService]);

  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <svg className="h-6 w-6 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        <span className="text-xs text-slate-500">Loading layers</span>
      </div>
    );
  }

  if (error) {
    return <div className="p-3 text-xs text-destructive">{error}</div>;
  }

  if (layers.length === 0) {
    return (
      <div className="p-3 text-xs text-slate-400">
        This PDF has no optional content layers (OCGs).
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 text-slate-200">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Layers</h3>
        <div className="flex gap-1">
          <button
            onClick={() => onSetAllLayers(true)}
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            All On
          </button>
          <button
            onClick={() => onSetAllLayers(false)}
            className="rounded border border-white/10 px-2 py-0.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            All Off
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {layers.map((layer) => (
          <label
            key={layer.ocg_index}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-slate-200 hover:bg-slate-800"
          >
            <input
              type="checkbox"
              checked={enabledLayers.has(layer.ocg_index)}
              onChange={() => onToggleLayer(layer.ocg_index)}
              className="rounded border-white/10"
            />
            <span className="truncate text-xs">{layer.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
