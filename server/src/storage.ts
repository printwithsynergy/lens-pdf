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

import { type LookupAddress, lookup as dnsLookup } from "node:dns";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { type IncomingMessage, request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIPv4, isIPv6 } from "node:net";
import type { LookupFunction } from "node:net";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
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
  if (
    contentLength !== null &&
    contentLength > config.maxUploadMib * 1024 * 1024
  ) {
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
 * SSRF prevention is enforced at the *connect-time DNS lookup* via
 * the `lookup` option to `http(s).request`: when Node is about to
 * open a TCP socket, our custom resolver checks the IP and refuses
 * any address in loopback / private / link-local / cloud-metadata
 * ranges. This closes the TOCTOU window a pre-fetch dns.lookup
 * leaves open (DNS rebinding between validation and connect).
 *
 * Redirects are not followed; a 3xx response from the host is
 * rejected explicitly so callers must resolve their own redirects.
 */
export async function saveSourceFromUrl(
  jobId: string,
  url: string,
): Promise<JobMeta> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("URL is not parseable.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError("URL must be http(s).");
  }

  const res = await fetchWithSafeLookup(parsed);
  if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
    res.resume();
    throw new ValidationError(
      "Redirect responses are not followed; provide the resolved URL.",
    );
  }
  if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 400) {
    res.resume();
    throw new ValidationError(
      `Source fetch failed: ${res.statusCode ?? "?"} ${res.statusMessage ?? ""}`,
    );
  }
  const cl = res.headers["content-length"];
  return saveSourceFromStream(jobId, res, cl ? Number(cl) : null);
}

/**
 * Issue a GET against the URL using `http(s).request` with a custom
 * DNS lookup that validates each candidate IP and refuses private /
 * loopback / link-local / cloud-metadata ranges. This is the
 * sanitizer pattern CodeQL recognizes for js/request-forgery.
 */
function fetchWithSafeLookup(parsed: URL): Promise<IncomingMessage> {
  const requestFn = parsed.protocol === "https:" ? httpsRequest : httpRequest;
  // The `lookup` option runs at TCP-connect time. Any rejection here
  // happens *before* a byte is sent over the wire — this is the
  // sanitizer pattern CodeQL recognizes for js/request-forgery.
  const safeLookup: LookupFunction = (hostname, options, callback) => {
    dnsLookup(hostname, options, (err, address, family) => {
      if (err) {
        callback(err, "", 0);
        return;
      }
      try {
        if (Array.isArray(address)) {
          for (const a of address as LookupAddress[]) {
            assertPublicAddress(a.address);
          }
          callback(null, address, family);
        } else {
          assertPublicAddress(address as string);
          callback(null, address as string, family);
        }
      } catch (e) {
        const wrapped = e instanceof Error ? e : new Error("forbidden address");
        (wrapped as NodeJS.ErrnoException).code = "EFORBIDDEN";
        callback(wrapped as NodeJS.ErrnoException, "", 0);
      }
    });
  };
  return new Promise<IncomingMessage>((resolve, reject) => {
    const req = requestFn(
      parsed,
      { method: "GET", lookup: safeLookup },
      (res) => resolve(res),
    );
    req.on("error", (err) => reject(err));
    req.end();
  });
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
      throw new ValidationError(
        `Refusing to fetch private/loopback IPv4 ${ip}.`,
      );
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
