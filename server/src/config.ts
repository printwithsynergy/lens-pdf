/**
 * Runtime config sourced from environment variables. The server is
 * deliberately thin — auth, rate limiting, multi-tenancy live one
 * layer up (your own gateway / proxy / app server).
 */

const env = (key: string, fallback?: string): string => {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${key}`);
};

export const config = {
  /** TCP port the HTTP server binds to. */
  port: Number(env("PORT", "3000")),
  /** Where job PDFs are stored on disk. Defaults to a tmpfs-friendly path. */
  jobsDir: env("LENS_JOBS_DIR", "/var/lib/lens-pdf/jobs"),
  /** Where rendered tiles are cached on disk. Cleared at process start. */
  cacheDir: env("LENS_CACHE_DIR", "/var/cache/lens-pdf"),
  /** Maximum PDF upload size in MiB. */
  maxUploadMib: Number(env("LENS_MAX_UPLOAD_MIB", "100")),
  /**
   * If set, ``Authorization: Bearer ${value}`` is required on every
   * request. This is a *coarse* check meant for single-tenant deploys
   * behind a private network. For multi-tenant or public-facing use,
   * put a real auth gateway in front.
   */
  bearerToken: process.env.LENS_BEARER_TOKEN ?? null,
  /** Path to the `gs` binary. */
  ghostscriptBin: env("GS_BIN", "gs"),
  /** Allowed render DPIs — clamps client-supplied values. */
  minDpi: 36,
  maxDpi: 600,
};
