"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { AnnotationEntry } from "../plugin/services";
import {
  isUnwired,
  logUnwiredHide,
  useViewerHost,
  useViewerServices,
} from "../host";

interface AnnotationThreadProps {
  jobId: string;
  currentUserEmail?: string;
  onJumpToPage?: (pageNum: number) => void;
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 10,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  background: "rgba(255,255,255,0.02)",
  fontSize: 12,
  color: "#e2e8f0",
};

const emptyStyle: CSSProperties = {
  ...containerStyle,
  alignItems: "flex-start",
  fontSize: 12,
  fontStyle: "italic",
  color: "rgba(226,232,240,0.55)",
};

const loadingRowStyle: CSSProperties = {
  ...containerStyle,
  alignItems: "center",
  flexDirection: "row",
  gap: 8,
  fontStyle: "italic",
  color: "rgba(226,232,240,0.55)",
};

const itemStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 8,
  padding: 8,
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.04)",
};

const itemBodyStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const authorStyle: CSSProperties = {
  fontWeight: 600,
  color: "#f1f5f9",
};

const metaStyle: CSSProperties = {
  fontSize: 11,
  color: "rgba(148,163,184,0.9)",
};

const jumpButtonStyle: CSSProperties = {
  marginTop: 4,
  background: "transparent",
  border: 0,
  padding: 0,
  color: "#60a5fa",
  fontSize: 11,
  cursor: "pointer",
  textDecoration: "underline",
  alignSelf: "flex-start",
};

const deleteButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  padding: "2px 6px",
  fontSize: 11,
  color: "#fca5a5",
  background: "transparent",
  border: "1px solid rgba(248,113,113,0.35)",
  borderRadius: 4,
  cursor: "pointer",
};

const spinnerStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: "50%",
  border: "2px solid rgba(255,255,255,0.18)",
  borderTopColor: "rgba(255,255,255,0.65)",
  animation: "loupe-pdf-annotation-spin 0.85s linear infinite",
};

const SPINNER_KEYFRAMES = `@keyframes loupe-pdf-annotation-spin {
  to { transform: rotate(360deg); }
}`;

export function AnnotationThread({
  jobId: _jobId,
  currentUserEmail,
  onJumpToPage,
}: AnnotationThreadProps) {
  const { readOnly, debug } = useViewerHost();
  const { annotations: annotationService } = useViewerServices();
  const hidden = isUnwired(annotationService);
  const [annotations, setAnnotations] = useState<AnnotationEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await annotationService.list();
      setAnnotations([...data]);
    } finally {
      setLoading(false);
    }
  }, [annotationService]);

  useEffect(() => {
    if (hidden) {
      if (debug) logUnwiredHide("AnnotationThread", "annotations");
      return;
    }
    load();
  }, [load, hidden, debug]);

  const handleDelete = useCallback(
    async (annotationId: string) => {
      await annotationService.remove(annotationId);
      setAnnotations((prev) => prev.filter((a) => a.id !== annotationId));
    },
    [annotationService],
  );

  if (hidden) return null;

  if (loading) {
    return (
      <>
        <style>{SPINNER_KEYFRAMES}</style>
        <div style={loadingRowStyle}>
          <span aria-hidden style={spinnerStyle} />
          <span>Loading annotations…</span>
        </div>
      </>
    );
  }

  if (annotations.length === 0) {
    return (
      <div style={emptyStyle}>
        No annotations yet. Toggle the annotation tool to start marking up the
        PDF.
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {annotations.map((a) => (
        <div key={a.id} style={itemStyle}>
          <div style={itemBodyStyle}>
            <div style={authorStyle}>{a.authorName ?? a.authorEmail}</div>
            <div style={metaStyle}>
              Page {a.pageNum} · {new Date(a.updatedAt).toLocaleString()}
            </div>
            <button
              type="button"
              onClick={() => onJumpToPage?.(a.pageNum)}
              style={jumpButtonStyle}
            >
              Jump to page
            </button>
          </div>
          {!readOnly &&
            currentUserEmail &&
            a.authorEmail === currentUserEmail && (
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                style={deleteButtonStyle}
                title="Delete annotation"
              >
                Delete
              </button>
            )}
        </div>
      ))}
    </div>
  );
}
