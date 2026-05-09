/**
 * Per-job filesystem layout. Each job is a directory under `jobsDir`:
 *
 *   jobs/
 *   └── {jobId}/
 *       ├── source.pdf
 *       ├── pages.json   # cached page metadata
 *       └── …
 *
 * The cache directory is separate so it can sit on a faster disk /
 * tmpfs without inflating the source-of-truth dir.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { config } from "./config.js";

export interface JobMeta {
  jobId: string;
  sourcePath: string;
  registeredAt: string;
}

const JOB_ID_RX = /^[a-zA-Z0-9_-]{1,128}$/;

export function assertValidJobId(jobId: string): void {
  if (!JOB_ID_RX.test(jobId)) {
    throw new ValidationError(
      `Invalid jobId. Allowed: 1-128 chars of [a-zA-Z0-9_-].`,
    );
  }
}

export function jobDir(jobId: string): string {
  assertValidJobId(jobId);
  return path.join(config.jobsDir, jobId);
}

export function sourcePath(jobId: string): string {
  return path.join(jobDir(jobId), "source.pdf");
}

export async function ensureJobsDir(): Promise<void> {
  await mkdir(config.jobsDir, { recursive: true });
  await mkdir(config.cacheDir, { recursive: true });
}

/**
 * Save an uploaded PDF body to the job dir. Refuses bodies larger than
 * the configured limit; refuses anything that doesn't look like a PDF.
 */
export async function saveSourceFromStream(
  jobId: string,
  body: Readable,
  contentLength: number | null,
): Promise<JobMeta> {
  if (contentLength !== null && contentLength > config.maxUploadMib * 1024 * 1024) {
    throw new ValidationError(
      `PDF too large (${(contentLength / 1024 / 1024).toFixed(1)} MiB > ${config.maxUploadMib} MiB).`,
    );
  }
  await mkdir(jobDir(jobId), { recursive: true });
  const dest = sourcePath(jobId);
  await pipeline(body, createWriteStream(dest));
  await assertLooksLikePdf(dest);
  const meta: JobMeta = {
    jobId,
    sourcePath: dest,
    registeredAt: new Date().toISOString(),
  };
  await writeFile(path.join(jobDir(jobId), "meta.json"), JSON.stringify(meta));
  return meta;
}

/**
 * Fetch a PDF from a host-supplied URL into the job dir. The host is
 * responsible for the URL itself being safe to fetch — we don't second-
 * guess private IP addresses, redirects, or signed-URL handling.
 */
export async function saveSourceFromUrl(
  jobId: string,
  url: string,
): Promise<JobMeta> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ValidationError(
      `Source fetch failed: ${res.status} ${res.statusText}`,
    );
  }
  if (!res.body) throw new ValidationError("Source response had no body.");
  const cl = res.headers.get("content-length");
  return saveSourceFromStream(
    jobId,
    Readable.fromWeb(res.body as never),
    cl ? Number(cl) : null,
  );
}

export async function jobExists(jobId: string): Promise<boolean> {
  try {
    await stat(sourcePath(jobId));
    return true;
  } catch {
    return false;
  }
}

async function assertLooksLikePdf(filePath: string): Promise<void> {
  const fd = await readFile(filePath, { encoding: null });
  // PDF magic header. The spec allows up to 1024 bytes of leading
  // garbage but in practice every renderer expects the marker in the
  // first few bytes.
  const head = fd.subarray(0, 1024).toString("latin1");
  if (!head.includes("%PDF-")) {
    throw new ValidationError("Uploaded body does not appear to be a PDF.");
  }
}

export class ValidationError extends Error {
  readonly httpStatus = 400;
}
