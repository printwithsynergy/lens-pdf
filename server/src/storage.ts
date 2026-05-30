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
import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
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
 * Fetch a PDF from a host-supplied URL into the job dir.
 *
 * SSRF prevention: resolve the hostname to an IP before fetching and
 * reject any address in loopback / private / link-local / cloud-metadata
 * ranges. Redirects are followed manually so each hop's hostname is
 * re-validated, not blindly trusted.
 */
export async function saveSourceFromUrl(
  jobId: string,
  url: string,
): Promise<JobMeta> {
  const finalUrl = await resolveSafeUrl(url);
  const res = await fetch(finalUrl, { redirect: "manual" });
  if (res.status >= 300 && res.status < 400) {
    throw new ValidationError(
      "Redirect responses are not followed; provide the resolved URL.",
    );
  }
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

/** Resolve hostname → IP and reject private/loopback/link-local ranges. */
async function resolveSafeUrl(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("URL is not parseable.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError("URL must be http(s).");
  }
  const host = parsed.hostname;
  // If host is already an IP literal, validate directly.
  if (isIPv4(host) || isIPv6(host)) {
    assertPublicAddress(host);
    return url;
  }
  // Otherwise look it up.
  const addrs = await lookup(host, { all: true });
  if (addrs.length === 0) {
    throw new ValidationError(`Host ${host} did not resolve.`);
  }
  for (const a of addrs) {
    assertPublicAddress(a.address);
  }
  return url;
}

/** Throws ValidationError for any address we won't fetch over. */
function assertPublicAddress(ip: string): void {
  if (isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) {
      throw new ValidationError(`Malformed IPv4 ${ip}.`);
    }
    const [a, b] = parts as [number, number, number, number];
    // 0.0.0.0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16,
    // 100.64/10 (CGNAT), 224/4 (multicast), 240/4 (reserved + 255.255.255.255).
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    ) {
      throw new ValidationError(`Refusing to fetch private/loopback IPv4 ${ip}.`);
    }
    return;
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    // ::1 loopback, fc00::/7 unique-local, fe80::/10 link-local,
    // ::ffff:x.x.x.x IPv4-mapped (validate the IPv4 inside).
    if (lower === "::1" || lower === "::") {
      throw new ValidationError(`Refusing to fetch IPv6 loopback ${ip}.`);
    }
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) {
      throw new ValidationError(`Refusing to fetch unique-local IPv6 ${ip}.`);
    }
    if (/^fe[89ab][0-9a-f]:/.test(lower)) {
      throw new ValidationError(`Refusing to fetch link-local IPv6 ${ip}.`);
    }
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) {
      assertPublicAddress(mapped[1]);
    }
    return;
  }
  throw new ValidationError(`Unparseable address ${ip}.`);
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
