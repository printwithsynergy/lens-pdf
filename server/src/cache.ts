/**
 * Tiny in-memory LRU keyed by a stable render fingerprint. Backs both
 * the page-tile and per-channel raster routes — Ghostscript is slow,
 * so even a small cache makes the second click on a page snappy.
 *
 * Production deployments should swap this for Redis / a CDN; the
 * cache layer sits behind a single `getOrRender` helper so subbing it
 * is a one-file change.
 */

import type { SeparationResult } from "./ghostscript.js";

const MAX_ENTRIES = 256;
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

type Entry<T> = { value: T; touched: number };

class LRU<T> {
  private map = new Map<string, Entry<T>>();

  get(key: string): T | null {
    const e = this.map.get(key);
    if (!e) return null;
    if (Date.now() - e.touched > MAX_AGE_MS) {
      this.map.delete(key);
      return null;
    }
    // Move to end (most-recently-used)
    this.map.delete(key);
    e.touched = Date.now();
    this.map.set(key, e);
    return e.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, touched: Date.now() });
    while (this.map.size > MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  invalidate(prefix: string): void {
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) this.map.delete(key);
    }
  }
}

export const compositeCache = new LRU<Buffer>();
export const separationsCache = new LRU<SeparationResult>();

export function jobCacheKey(
  jobId: string,
  ...parts: (string | number)[]
): string {
  return `${jobId}|${parts.join("|")}`;
}

export function invalidateJob(jobId: string): void {
  compositeCache.invalidate(`${jobId}|`);
  separationsCache.invalidate(`${jobId}|`);
}
