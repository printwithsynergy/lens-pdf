"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnnotationEntry } from "../plugin/services";
import { isUnwired, logUnwiredHide, useViewerHost, useViewerServices } from "../host";

interface AnnotationThreadProps {
  jobId: string;
  currentUserEmail?: string;
  onJumpToPage?: (pageNum: number) => void;
}

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
      <div className="flex flex-col items-center justify-center gap-2 p-6">
        <svg className="h-6 w-6 animate-spin text-slate-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        <span className="text-xs text-slate-500">Loading annotations</span>
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">
        No annotations yet. Toggle annotation mode to start marking up the PDF.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 text-slate-200">
      <h3 className="text-sm font-semibold text-white">Annotations</h3>
      {annotations.map((a) => (
        <div
          key={a.id}
          className="flex items-start justify-between rounded border border-slate-700 p-2 text-xs"
        >
          <div className="flex-1">
            <div className="font-medium text-slate-200">
              {a.authorName ?? a.authorEmail}
            </div>
            <div className="text-slate-400">
              Page {a.pageNum} &middot;{" "}
              {new Date(a.updatedAt).toLocaleString()}
            </div>
            <button
              onClick={() => onJumpToPage?.(a.pageNum)}
              className="mt-1 text-primary underline hover:no-underline"
            >
              Jump to page
            </button>
          </div>
          {!readOnly && currentUserEmail && a.authorEmail === currentUserEmail && (
            <button
              onClick={() => handleDelete(a.id)}
              className="ml-2 shrink-0 rounded px-1.5 py-0.5 text-xs text-destructive hover:bg-destructive/10"
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
