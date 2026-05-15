import nunjucks from "nunjucks";
import path from "path";
import { fileURLToPath } from "url";
import type { RenderContext, Finding, AnnotatedPage } from "./renderTypes.js";
import { renderAnnotatedPage, renderFindingThumbnail } from "./pageAnnotator.js";
import { sourcePath, jobExists } from "./storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "templates");

let _env: nunjucks.Environment | null = null;

function getEnv(): nunjucks.Environment {
  if (_env) return _env;
  _env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TEMPLATES_DIR), {
    autoescape: true,
  });
  _env.addFilter("decode_svg_data_uri", (dataUri: string) => {
    try {
      const b64 = dataUri.split(",", 2)[1];
      const svg = Buffer.from(b64, "base64").toString("utf-8");
      return new nunjucks.runtime.SafeString(
        svg.replace("<svg ", '<svg class="header-logo" '),
      );
    } catch {
      return new nunjucks.runtime.SafeString("");
    }
  });
  _env.addFilter("dictsort", (obj: Record<string, unknown>) =>
    Object.entries(obj ?? {}).sort(([a], [b]) => a.localeCompare(b)),
  );
  return _env;
}

function computeHealthScore(summary: Record<string, number>) {
  const errors = summary.error_count ?? 0;
  const warnings = summary.warning_count ?? 0;
  const advisory = summary.advisory_count ?? 0;
  const score = Math.max(0, Math.min(100, Math.round(100 - errors * 10 - warnings * 3 - advisory * 0.5)));
  let grade = "F", color = "#ef4444";
  if (score >= 90) { grade = "A"; color = "#22c55e"; }
  else if (score >= 80) { grade = "B"; color = "#22c55e"; }
  else if (score >= 70) { grade = "C"; color = "#f59e0b"; }
  else if (score >= 60) { grade = "D"; color = "#ef4444"; }
  return { score, grade, color };
}

function deduplicateFindings(findings: Finding[]): Finding[] {
  const groups = new Map<string, Finding & { _count: number }>();
  for (const f of findings) {
    const key = `${f.inspection_id}:${f.page_num ?? 0}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { ...f, _count: 1 });
    } else {
      existing._count++;
    }
  }
  return Array.from(groups.values()).map(({ _count, ...f }) => ({
    ...f,
    message: _count > 1 ? `${f.message} (+${_count - 1} similar on this page)` : f.message,
  }));
}

export async function renderHtml(ctx: RenderContext, jobId?: string): Promise<Buffer> {
  const { result_json, branding, detail_level = "standard", summary_page = "prepend" } = ctx;
  const { summary, metadata, findings = [] } = result_json;

  const severityOrder: Record<string, number> = { error: 0, warning: 1, advisory: 2 };
  const sortedFindings = [...findings].sort(
    (a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3),
  );
  const topFindings = sortedFindings.slice(0, 10);

  // Build findings_by_page map
  const findingsByPage = new Map<number, Finding[]>();
  for (const f of findings) {
    const page = f.page_num ?? 0;
    if (!findingsByPage.has(page)) findingsByPage.set(page, []);
    findingsByPage.get(page)!.push(f);
  }

  // Annotated page screenshots (standard + comprehensive only)
  const annotatedPages: Record<number, AnnotatedPage> = {};
  let renderFailed = false;
  const pageThumbnails: string[] = [];

  if (jobId && detail_level !== "executive") {
    if (await jobExists(jobId)) {
      const pdfPath = sourcePath(jobId);
      const { readFile } = await import("fs/promises");
      let pdfBytes: Buffer | null = null;
      try {
        pdfBytes = await readFile(pdfPath);
      } catch {
        renderFailed = true;
      }

      if (pdfBytes) {
        // Render annotated pages in parallel (cap at 20)
        const pageNums = Array.from(findingsByPage.keys())
          .filter((n) => n >= 1)
          .sort((a, b) => a - b)
          .slice(0, 20);

        await Promise.allSettled(
          pageNums.map(async (pageNum) => {
            try {
              const result = await renderAnnotatedPage(
                pdfPath, pdfBytes!, pageNum, findingsByPage.get(pageNum)!, 150,
              );
              annotatedPages[pageNum] = result;
            } catch {
              // page annotation failed; skip
            }
          }),
        );
        if (pageNums.length > 0 && Object.keys(annotatedPages).length === 0) renderFailed = true;

        // Per-finding thumbnails
        await Promise.allSettled(
          findings.map(async (f) => {
            if ((f.page_num ?? 0) < 1) { f.thumbnail_base64 = ""; return; }
            try {
              f.thumbnail_base64 = await renderFindingThumbnail(
                pdfPath, pdfBytes!, f.page_num!, f, 120,
              );
            } catch {
              f.thumbnail_base64 = "";
            }
          }),
        );

        // Page thumbnail grid for summary page
        if (summary_page !== "off") {
          const pageCount = Math.min(result_json.summary?.page_count ?? 0, 12);
          const thumbResults = await Promise.allSettled(
            Array.from({ length: pageCount }, (_, i) =>
              renderAnnotatedPage(pdfPath, pdfBytes!, i + 1, [], 72),
            ),
          );
          for (const r of thumbResults) {
            pageThumbnails.push(r.status === "fulfilled" ? r.value.image_base64 : "");
          }
        }
      }
    } else {
      renderFailed = true;
    }
  }

  // Comprehensive ink data
  const inkSeparations: unknown[] = [];
  const inkTacByPage: [number, unknown][] = [];
  const colorScoreBreakdown: [string, number][] = [];

  if (detail_level === "comprehensive") {
    for (const f of findings) {
      const iid = f.inspection_id;
      const details = (f.details ?? {}) as Record<string, unknown>;
      if (iid === "LPDF_INK_002") {
        inkSeparations.push({
          name: details.separation_name ?? "",
          pages_used: details.pages_used ?? [],
          max_value: details.max_value ?? 0,
          event_count: details.event_count ?? 0,
        });
      } else if (iid === "LPDF_INK_001") {
        const page = f.page_num ?? 0;
        if (page > 0) {
          inkTacByPage.push([page, { max_tac: details.max_tac ?? 0, tac_limit: details.tac_limit ?? 0, sample_count: details.sample_count ?? 0 }]);
        }
      }
    }
    const breakdown = metadata.color_score_breakdown ?? {};
    for (const [k, v] of Object.entries(breakdown)) {
      colorScoreBreakdown.push([k, v]);
    }
  }

  // Color summary info
  const colorSpaces = new Set<string>();
  const spotColors: string[] = [];
  let maxTac = 0;
  for (const f of findings) {
    const details = (f.details ?? {}) as Record<string, unknown>;
    if (f.inspection_id === "LPDF_INK_002") {
      const n = String(details.separation_name ?? "");
      if (n && !["Cyan","Magenta","Yellow","Black"].includes(n)) spotColors.push(n);
    }
    if (f.inspection_id === "LPDF_INK_001") {
      const mt = Number(details.max_tac ?? 0);
      if (mt > maxTac) maxTac = mt;
    }
    if (f.inspection_id === "LPDF_COLOR_014") {
      const cs = details.color_spaces;
      if (Array.isArray(cs)) cs.forEach((c) => colorSpaces.add(String(c)));
    }
  }
  const summaryColorInfo = {
    color_spaces: colorSpaces.size > 0 ? Array.from(colorSpaces).sort() : ["DeviceCMYK"],
    spot_colors: spotColors.slice(0, 6),
    max_tac: Math.round(maxTac * 10) / 10,
  };

  const deduped = deduplicateFindings(findings);
  const allFindingsSorted = deduped.sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3) ||
      (a.page_num ?? 0) - (b.page_num ?? 0),
  );

  const passed = summary?.passed ?? true;
  const health = computeHealthScore(summary as unknown as Record<string, number>);

  const templateCtx = {
    result: {
      job_id: result_json.job_id ?? "",
      profile_id: result_json.profile_id ?? "",
      findings,
      duration_ms: result_json.duration_ms ?? 0,
    },
    summary,
    metadata,
    findings_by_page: Object.fromEntries(
      Array.from(findingsByPage.entries()).sort(([a], [b]) => a - b),
    ),
    pass_fail: passed ? "PASS" : "FAIL",
    badge_color: passed ? "#22c55e" : "#ef4444",
    brand: branding ?? null,
    annotated_pages: annotatedPages,
    render_failed: renderFailed,
    color_quality_score: metadata?.color_quality_score ?? null,
    color_quality_grade: metadata?.color_quality_grade ?? null,
    file_name: result_json.file_name ?? metadata?.file_name ?? "",
    generated_at: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC",
    detail_level,
    top_findings: topFindings,
    all_findings_sorted: allFindingsSorted,
    ink_separations: inkSeparations,
    ink_tac_by_page: inkTacByPage,
    ink_inventory: {},
    color_score_breakdown: colorScoreBreakdown,
    summary_page,
    page_thumbnails: pageThumbnails,
    health,
    summary_color_info: summaryColorInfo,
    epm: result_json.epm ?? null,
  };

  const html = getEnv().render("report.njk", templateCtx);
  return Buffer.from(html, "utf-8");
}

export async function renderPdf(ctx: RenderContext, jobId?: string): Promise<Buffer> {
  const htmlBuf = await renderHtml(ctx, jobId);
  const html = htmlBuf.toString("utf-8");

  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuf = await page.pdf({ format: "A4", printBackground: true });
    return Buffer.from(pdfBuf);
  } finally {
    await browser.close();
  }
}
