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

import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { config } from "./config.js";

export interface JobMeta {
  jobId: string;
  sourcePath: string;
  registeredAt: string;
}

export interface AnnotationNoteRecord {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnnotationRecord {
  id: string;
  jobId: string;
  pageNum: number;
  authorEmail: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  fabricJson?: unknown;
  number?: number | null;
  linkedNotes?: AnnotationNoteRecord[];
  metadata?: Record<string, unknown>;
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

function annotationsPath(jobId: string): string {
  return path.join(jobDir(jobId), "annotations.json");
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

export async function listAnnotations(jobId: string): Promise<AnnotationRecord[]> {
  assertValidJobId(jobId);
  const rows = await readAnnotationStore(jobId);
  return rows.sort((a, b) => {
    if (a.pageNum !== b.pageNum) return a.pageNum - b.pageNum;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export async function getAnnotationById(
  jobId: string,
  annotationId: string,
): Promise<AnnotationRecord | null> {
  const rows = await readAnnotationStore(jobId);
  return rows.find((row) => row.id === annotationId) ?? null;
}

export async function createAnnotation(
  jobId: string,
  input: {
    pageNum: number;
    authorEmail: string;
    authorName: string | null;
    fabricJson?: unknown;
    number?: number | null;
    linkedNotes?: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<AnnotationRecord> {
  assertPositiveInt(input.pageNum, "pageNum");
  assertAuthorEmail(input.authorEmail);
  const now = new Date().toISOString();
  const row: AnnotationRecord = {
    id: randomUUID(),
    jobId,
    pageNum: input.pageNum,
    authorEmail: input.authorEmail.trim().toLowerCase(),
    authorName: input.authorName ?? null,
    createdAt: now,
    updatedAt: now,
    fabricJson: input.fabricJson,
    number: input.number ?? null,
    linkedNotes: normalizeLinkedNotes(input.linkedNotes),
    metadata: input.metadata ?? {},
  };
  const rows = await readAnnotationStore(jobId);
  rows.push(row);
  await writeAnnotationStore(jobId, rows);
  return row;
}

export async function updateAnnotation(
  jobId: string,
  annotationId: string,
  patch: {
    pageNum?: number;
    authorEmail?: string;
    authorName?: string | null;
    fabricJson?: unknown;
    number?: number | null;
    linkedNotes?: unknown;
    metadata?: Record<string, unknown>;
  },
): Promise<AnnotationRecord | null> {
  const rows = await readAnnotationStore(jobId);
  const index = rows.findIndex((row) => row.id === annotationId);
  if (index < 0) return null;
  const prev = rows[index]!;
  if (patch.pageNum !== undefined) assertPositiveInt(patch.pageNum, "pageNum");
  if (patch.authorEmail !== undefined) assertAuthorEmail(patch.authorEmail);
  const next: AnnotationRecord = {
    ...prev,
    ...(patch.pageNum !== undefined ? { pageNum: patch.pageNum } : {}),
    ...(patch.authorEmail !== undefined
      ? { authorEmail: patch.authorEmail.trim().toLowerCase() }
      : {}),
    ...(patch.authorName !== undefined ? { authorName: patch.authorName } : {}),
    ...(patch.fabricJson !== undefined ? { fabricJson: patch.fabricJson } : {}),
    ...(patch.number !== undefined ? { number: patch.number ?? null } : {}),
    ...(patch.linkedNotes !== undefined
      ? { linkedNotes: normalizeLinkedNotes(patch.linkedNotes) }
      : {}),
    ...(patch.metadata !== undefined ? { metadata: patch.metadata } : {}),
    updatedAt: new Date().toISOString(),
  };
  rows[index] = next;
  await writeAnnotationStore(jobId, rows);
  return next;
}

export async function deleteAnnotation(
  jobId: string,
  annotationId: string,
): Promise<boolean> {
  const rows = await readAnnotationStore(jobId);
  const next = rows.filter((row) => row.id !== annotationId);
  if (next.length === rows.length) return false;
  await writeAnnotationStore(jobId, next);
  return true;
}

export async function saveAnnotationForPage(
  jobId: string,
  pageNum: number,
  authorEmail: string,
  authorName: string | null,
  fabricJson: unknown,
): Promise<AnnotationRecord> {
  assertPositiveInt(pageNum, "pageNum");
  assertAuthorEmail(authorEmail);
  const rows = await readAnnotationStore(jobId);
  const normalizedEmail = authorEmail.trim().toLowerCase();
  const index = rows.findIndex(
    (row) => row.pageNum === pageNum && row.authorEmail === normalizedEmail,
  );
  const now = new Date().toISOString();
  if (index >= 0) {
    const prev = rows[index]!;
    const next: AnnotationRecord = {
      ...prev,
      authorName,
      fabricJson,
      updatedAt: now,
    };
    rows[index] = next;
    await writeAnnotationStore(jobId, rows);
    return next;
  }
  const created: AnnotationRecord = {
    id: randomUUID(),
    jobId,
    pageNum,
    authorEmail: normalizedEmail,
    authorName,
    createdAt: now,
    updatedAt: now,
    fabricJson,
    linkedNotes: [],
    metadata: {},
  };
  rows.push(created);
  await writeAnnotationStore(jobId, rows);
  return created;
}

export async function getAnnotationForPage(
  jobId: string,
  pageNum: number,
  authorEmail: string,
): Promise<AnnotationRecord | null> {
  assertPositiveInt(pageNum, "pageNum");
  assertAuthorEmail(authorEmail);
  const rows = await readAnnotationStore(jobId);
  const normalizedEmail = authorEmail.trim().toLowerCase();
  return (
    rows.find(
      (row) => row.pageNum === pageNum && row.authorEmail === normalizedEmail,
    ) ?? null
  );
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

async function readAnnotationStore(jobId: string): Promise<AnnotationRecord[]> {
  const filePath = annotationsPath(jobId);
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const rows: AnnotationRecord[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const rec = row as Partial<AnnotationRecord>;
      if (
        typeof rec.id !== "string" ||
        typeof rec.pageNum !== "number" ||
        typeof rec.authorEmail !== "string" ||
        typeof rec.createdAt !== "string" ||
        typeof rec.updatedAt !== "string"
      ) {
        continue;
      }
      rows.push({
        id: rec.id,
        jobId,
        pageNum: rec.pageNum,
        authorEmail: rec.authorEmail,
        authorName: rec.authorName ?? null,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
        fabricJson: rec.fabricJson,
        number: rec.number ?? null,
        linkedNotes: normalizeLinkedNotes(rec.linkedNotes),
        metadata:
          rec.metadata && typeof rec.metadata === "object"
            ? (rec.metadata as Record<string, unknown>)
            : {},
      });
    }
    return rows;
  } catch {
    return [];
  }
}

async function writeAnnotationStore(
  jobId: string,
  rows: AnnotationRecord[],
): Promise<void> {
  await mkdir(jobDir(jobId), { recursive: true });
  const filePath = annotationsPath(jobId);
  const tempPath = `${filePath}.tmp-${randomUUID()}`;
  const body = JSON.stringify(rows, null, 2);
  await writeFile(tempPath, body, "utf8");
  await rename(tempPath, filePath);
  void unlink(tempPath).catch(() => {});
}

function normalizeLinkedNotes(
  value: unknown,
): AnnotationNoteRecord[] {
  if (!Array.isArray(value)) return [];
  const notes: AnnotationNoteRecord[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const note = row as Partial<AnnotationNoteRecord>;
    if (typeof note.text !== "string") continue;
    const now = new Date().toISOString();
    notes.push({
      id:
        typeof note.id === "string" && note.id.trim().length > 0
          ? note.id
          : randomUUID(),
      text: note.text,
      createdAt:
        typeof note.createdAt === "string" && note.createdAt.length > 0
          ? note.createdAt
          : now,
      updatedAt:
        typeof note.updatedAt === "string" && note.updatedAt.length > 0
          ? note.updatedAt
          : now,
    });
  }
  return notes;
}

function assertPositiveInt(value: unknown, name: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new ValidationError(`${name} must be a positive integer.`);
  }
}

function assertAuthorEmail(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.includes("@")) {
    throw new ValidationError("authorEmail must be a valid email string.");
  }
}

export class ValidationError extends Error {
  readonly httpStatus = 400;
}
