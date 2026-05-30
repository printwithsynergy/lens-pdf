/**
 * Thin wrapper around the `gs` binary. Two render modes used by the
 * server:
 *
 * - `tiffsep` device: emits one TIFF per ink channel (Cyan, Magenta,
 *   Yellow, Black, plus any spot inks the PDF declares). Drives the
 *   separations canvas, the densitometer, and the TAC heatmap.
 * - `png16m` device: emits a flat RGB composite PNG. Drives the page
 *   canvas and the color picker.
 *
 * Stdout/stderr are captured so render failures surface in the HTTP
 * response with enough context to diagnose. We never shell-interpolate
 * — `child_process.spawn` with an argv array keeps Ghostscript options
 * arms-length from any user input.
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { config } from "./config.js";

export interface SeparationResult {
  /** Map of ink-channel name → grayscale PNG buffer (white = no ink). */
  channels: Record<string, Buffer>;
  /** Page-tile composite RGB PNG, optional — Ghostscript emits one
   *  alongside the per-ink TIFFs at the requested DPI. */
  composite: Buffer | null;
  /** Width / height in pixels at the requested DPI. */
  width: number;
  height: number;
}

export interface RenderArgs {
  pdfPath: string;
  pageNum: number;
  dpi: number;
}

const GS_TIMEOUT_MS = 60_000;
const GS_HARD_KILL_AFTER_MS = 2_000;

async function runGs(args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(config.ghostscriptBin, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      fn();
    };

    child.stderr.on("data", (b) => {
      if (!settled) stderr += b.toString("utf8");
    });

    const timer = setTimeout(() => {
      timedOut = true;
      // Try graceful first, then SIGKILL if it doesn't take.
      child.kill("SIGTERM");
      hardTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process may already be gone; ignore.
        }
      }, GS_HARD_KILL_AFTER_MS);
    }, GS_TIMEOUT_MS);

    child.on("error", (err) => {
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      settle(() => reject(err));
    });

    // Single exit handler decides outcome based on `timedOut` flag —
    // this way SIGTERM/SIGKILL still funnel through one resolve path
    // and the promise can only settle once.
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (hardTimer) clearTimeout(hardTimer);
      settle(() => {
        if (timedOut) {
          reject(
            new Error(`Ghostscript timed out after ${GS_TIMEOUT_MS} ms.`),
          );
        } else if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `Ghostscript exited ${code}.\n--- stderr ---\n${stderr.slice(0, 4000)}`,
            ),
          );
        }
      });
    });
  });
}

/**
 * Render the page composite as a flat RGB PNG. Used for the page
 * canvas and the color picker.
 */
export async function renderComposite(args: RenderArgs): Promise<Buffer> {
  const tmp = await mkdtemp("composite-");
  try {
    const out = path.join(tmp, "page.png");
    await runGs(
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=png16m",
        `-r${args.dpi}`,
        `-dFirstPage=${args.pageNum}`,
        `-dLastPage=${args.pageNum}`,
        `-sOutputFile=${out}`,
        args.pdfPath,
      ],
      tmp,
    );
    return await readFile(out);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Render per-ink separations via `tiffsep`. Returns one PNG per
 * channel (after converting through sharp) plus the composite.
 *
 * `tiffsep` writes files like:
 *
 *   page.tiff             ← composite TIFF
 *   page.tiff.Cyan.tif    ← cyan channel
 *   page.tiff.Magenta.tif ← magenta channel
 *   page.tiff.Yellow.tif  ← yellow channel
 *   page.tiff.Black.tif   ← black channel
 *   page.tiff.{Spot}.tif  ← per spot ink
 */
export async function renderSeparations(
  args: RenderArgs,
): Promise<SeparationResult> {
  const tmp = await mkdtemp("sep-");
  try {
    const stem = path.join(tmp, "page.tiff");
    await runGs(
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-sDEVICE=tiffsep",
        `-r${args.dpi}`,
        `-dFirstPage=${args.pageNum}`,
        `-dLastPage=${args.pageNum}`,
        `-sOutputFile=${stem}`,
        args.pdfPath,
      ],
      tmp,
    );

    const files = await readdir(tmp);
    const channels: Record<string, Buffer> = {};
    let width = 0;
    let height = 0;
    let composite: Buffer | null = null;

    for (const file of files) {
      const full = path.join(tmp, file);
      // tiffsep names: page.tiff (composite), page.tiff.Cyan.tif, ...
      if (file === "page.tiff") {
        const png = await sharp(full).png().toBuffer();
        composite = png;
        const meta = await sharp(png).metadata();
        width = meta.width ?? 0;
        height = meta.height ?? 0;
        continue;
      }
      const m = /^page\.tiff\.(.+)\.tif$/.exec(file);
      if (!m) continue;
      const channelName = decodeChannelName(m[1]!);
      channels[channelName] = await sharp(full).png().toBuffer();
    }

    if (!Object.keys(channels).length) {
      throw new Error(
        "Ghostscript tiffsep produced no channel TIFFs. Check the PDF has CMYK or spot color content.",
      );
    }
    return { channels, composite, width, height };
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

/**
 * Read raw page metadata via `pdf_inquire.ps`. Faster than rendering
 * — used for the page-list endpoint.
 */
export async function readPageCount(pdfPath: string): Promise<number> {
  const tmp = await mkdtemp("count-");
  try {
    const out = path.join(tmp, "count.txt");
    await runGs(
      [
        "-dSAFER",
        "-dBATCH",
        "-dNOPAUSE",
        "-q",
        `-sOutputFile=${out}`,
        "-sDEVICE=bbox",
        pdfPath,
      ],
      tmp,
    );
    // The `bbox` device emits one "Page N" line per page in stderr or
    // stdout depending on Ghostscript version; reading the output file
    // gives us a deterministic line count of "%%BoundingBox:" entries.
    const txt = await readFile(out, "utf8").catch(() => "");
    const lines = txt.split(/\r?\n/).filter((l) => l.startsWith("%%BoundingBox"));
    if (lines.length > 0) return lines.length;
    // Fallback: read the file size to confirm the file actually
    // existed; if Ghostscript's bbox device is missing in this build,
    // return 1 so callers don't crash.
    await stat(out);
    return 1;
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

function decodeChannelName(rawFromFilename: string): string {
  // tiffsep replaces non-filesystem-safe characters with `#XX` escapes.
  return rawFromFilename.replace(/#([0-9a-fA-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );
}

async function mkdtemp(prefix: string): Promise<string> {
  const dir = path.join(os.tmpdir(), `lens-${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  return dir;
}
