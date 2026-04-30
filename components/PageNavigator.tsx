"use client";

import { useEffect, useRef } from "react";
import type { PageInfo, ViewerFinding } from "../../types";
import { THUMBNAIL_DPI, useViewerApi } from "../../types";

interface PageNavigatorProps {
  pages: PageInfo[];
  currentPage: number;
  findings: ViewerFinding[];
  jobId: string;
  onPageChange: (page: number) => void;
  /** When true, render as a horizontal strip (for left panel header). */
  horizontal?: boolean;
}

export function PageNavigator({
  pages,
  currentPage,
  findings,
  jobId: _jobId,
  onPageChange,
  horizontal,
}: PageNavigatorProps) {
  const { apiBase } = useViewerApi();
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: horizontal ? "nearest" : "nearest",
      inline: horizontal ? "center" : undefined,
      behavior: "smooth",
    });
  }, [currentPage, horizontal]);

  const findingsPerPage = new Map<number, { errors: number; warnings: number }>();
  for (const f of findings) {
    if (f.page_num) {
      const curr = findingsPerPage.get(f.page_num) ?? { errors: 0, warnings: 0 };
      if (f.severity === "error") curr.errors++;
      else if (f.severity === "warning") curr.warnings++;
      findingsPerPage.set(f.page_num, curr);
    }
  }

  if (horizontal) {
    return (
      <>
        {pages.map((page) => {
          const isActive = page.page_num === currentPage;
          const counts = findingsPerPage.get(page.page_num);
          return (
            <button
              key={page.page_num}
              ref={isActive ? activeRef : undefined}
              onClick={() => onPageChange(page.page_num)}
              className={`relative shrink-0 rounded border p-0.5 transition-colors ${
                isActive
                  ? "border-blue-500 ring-2 ring-blue-500/30"
                  : "border-white/[0.06] hover:border-slate-500"
              }`}
              style={{ width: 56 }}
            >
              <img
                src={`${apiBase}/pages/${page.page_num}/tile?dpi=${THUMBNAIL_DPI}`}
                alt={`Page ${page.page_num}`}
                className="w-full rounded"
                loading="lazy"
              />
              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] text-white">
                {page.page_num}
              </span>
              {counts && (
                <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                  {counts.errors > 0 && (
                    <span className="rounded-full bg-red-500 px-1 text-[8px] text-white">
                      {counts.errors}
                    </span>
                  )}
                  {counts.warnings > 0 && (
                    <span className="rounded-full bg-amber-500 px-1 text-[8px] text-white">
                      {counts.warnings}
                    </span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-2">
      <div className="mb-1 text-xs font-medium text-muted-foreground">
        Pages ({pages.length})
      </div>
      {pages.map((page) => {
        const isActive = page.page_num === currentPage;
        const counts = findingsPerPage.get(page.page_num);
        return (
          <button
            key={page.page_num}
            ref={isActive ? activeRef : undefined}
            onClick={() => onPageChange(page.page_num)}
            className={`relative rounded border p-0.5 transition-colors ${
              isActive
                ? "border-primary ring-2 ring-primary/30"
                : "border-border hover:border-primary/50"
            }`}
          >
            <img
              src={`${apiBase}/pages/${page.page_num}/tile?dpi=${THUMBNAIL_DPI}`}
              alt={`Page ${page.page_num}`}
              className="w-full rounded"
              loading="lazy"
            />
            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px] text-white">
              {page.page_num}
            </span>
            {counts && (
              <div className="absolute right-0.5 top-0.5 flex gap-0.5">
                {counts.errors > 0 && (
                  <span className="rounded-full bg-destructive px-1 text-[9px] text-white">
                    {counts.errors}
                  </span>
                )}
                {counts.warnings > 0 && (
                  <span className="rounded-full bg-warning px-1 text-[9px] text-white">
                    {counts.warnings}
                  </span>
                )}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
