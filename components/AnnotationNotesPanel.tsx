"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { isUnwired, logUnwiredHide, useViewerHost, useViewerServices } from "../host";
import type { AnnotationEntry } from "../plugin/services";

interface AnnotationNotesPanelProps {
  refreshKey?: number;
  storageScopeKey?: string;
  onJumpToPage?: (pageNum: number) => void;
  indexedAnnotations?: Array<{
    number: number;
    pageNum: number;
    objectType: string;
  }>;
}

const cardStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.02)",
  color: "#e2e8f0",
};

const labelStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(148,163,184,0.95)",
  fontWeight: 600,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 72,
  resize: "vertical",
  background: "rgba(15, 23, 42, 0.45)",
  color: "#f8fafc",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 6,
  padding: "8px 10px",
  fontSize: 12,
  lineHeight: 1.45,
  boxSizing: "border-box",
};

const selectStyle: CSSProperties = {
  ...textareaStyle,
  minHeight: 36,
  resize: "none",
};

export function AnnotationNotesPanel({
  refreshKey,
  storageScopeKey,
  onJumpToPage,
  indexedAnnotations = [],
}: AnnotationNotesPanelProps) {
  const { debug } = useViewerHost();
  const { annotations: annotationService } = useViewerServices();
  const hidden = isUnwired(annotationService);
  const [entries, setEntries] = useState<AnnotationEntry[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>("");
  const [notesByAnnotationId, setNotesByAnnotationId] = useState<
    Record<string, string>
  >({});

  const storageKey = useMemo(
    () =>
      `loupe-pdf:annotation-notes:${storageScopeKey ?? "default-document"}`,
    [storageScopeKey],
  );

  useEffect(() => {
    if (hidden) {
      if (debug) logUnwiredHide("AnnotationNotesPanel", "annotations");
      return;
    }
    let cancelled = false;
    (async () => {
      const list = await annotationService.list();
      if (cancelled) return;
      const sorted = [...list].sort((a, b) => {
        if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
        return a.updatedAt.localeCompare(b.updatedAt);
      });
      setEntries(sorted);
      setSelectedAnnotationId((prev) =>
        prev && sorted.some((entry) => entry.id === prev)
          ? prev
          : (sorted[0]?.id ?? ""),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [annotationService, hidden, debug, refreshKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        generalNotes?: string;
        notesByAnnotationId?: Record<string, string>;
      };
      setGeneralNotes(parsed.generalNotes ?? "");
      setNotesByAnnotationId(parsed.notesByAnnotationId ?? {});
    } catch {
      // Ignore malformed persisted note payloads.
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      generalNotes,
      notesByAnnotationId,
    });
    window.localStorage.setItem(storageKey, payload);
  }, [storageKey, generalNotes, notesByAnnotationId]);

  if (hidden) return null;

  const selectedNote = selectedAnnotationId
    ? notesByAnnotationId[selectedAnnotationId] ?? ""
    : "";

  const targets =
    indexedAnnotations.length > 0
      ? indexedAnnotations.map((row) => ({
          id: `obj-${row.number}`,
          pageNum: row.pageNum,
          label: `#${row.number} · ${row.objectType}`,
        }))
      : entries.map((entry, idx) => ({
          id: `entry-${entry.id}`,
          pageNum: entry.pageNum,
          label: `#${idx + 1} · Page ${entry.pageNum}`,
        }));

  const selectedTarget =
    targets.find((target) => target.id === selectedAnnotationId) ?? null;

  useEffect(() => {
    if (targets.length === 0) {
      if (selectedAnnotationId) setSelectedAnnotationId("");
      return;
    }
    if (!selectedAnnotationId || !targets.some((t) => t.id === selectedAnnotationId)) {
      setSelectedAnnotationId(targets[0]!.id);
    }
  }, [targets, selectedAnnotationId]);

  return (
    <div style={cardStyle}>
      <div style={labelStyle}>General notes</div>
      <textarea
        value={generalNotes}
        onChange={(e) => setGeneralNotes(e.target.value)}
        placeholder="Overall notes about this proof..."
        style={textareaStyle}
      />

      <div style={labelStyle}>Annotation-linked note</div>
      {targets.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: "rgba(226,232,240,0.62)",
            fontStyle: "italic",
          }}
        >
          Add at least one annotation on the page to link notes by number.
        </div>
      ) : (
        <>
          <select
            value={selectedAnnotationId}
            onChange={(e) => setSelectedAnnotationId(e.target.value)}
            style={selectStyle}
          >
            {targets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
          {selectedAnnotationId && selectedTarget && (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={{
                  border: "1px solid rgba(96,165,250,0.45)",
                  background: "transparent",
                  color: "#93c5fd",
                  borderRadius: 6,
                  fontSize: 11,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
                onClick={() => {
                  onJumpToPage?.(selectedTarget.pageNum);
                }}
              >
                Jump to annotation page
              </button>
            </div>
          )}
          <textarea
            value={selectedNote}
            onChange={(e) => {
              const val = e.target.value;
              const key = selectedAnnotationId;
              if (!key) return;
              setNotesByAnnotationId((prev) => ({ ...prev, [key]: val }));
            }}
            placeholder="Note linked to this annotation number..."
            style={textareaStyle}
          />
        </>
      )}
    </div>
  );
}

