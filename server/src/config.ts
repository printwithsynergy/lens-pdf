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

type AuthMode = "internal" | "bearer" | "api-key" | "hybrid";

function normalizeAuthMode(value: string): AuthMode {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "internal" ||
    normalized === "bearer" ||
    normalized === "api-key" ||
    normalized === "hybrid"
  ) {
    return normalized;
  }
  throw new Error(
    `Invalid LOUPE_AUTH_MODE '${value}'. Expected one of: internal, bearer, api-key, hybrid.`,
  );
}

export const config = {
  /** TCP port the HTTP server binds to. */
  port: Number(env("PORT", "3000")),
  /** Where job PDFs are stored on disk. Defaults to a tmpfs-friendly path. */
  jobsDir: env("LOUPE_JOBS_DIR", "/var/lib/loupe-pdf/jobs"),
  /** Where rendered tiles are cached on disk. Cleared at process start. */
  cacheDir: env("LOUPE_CACHE_DIR", "/var/cache/loupe-pdf"),
  /** Maximum PDF upload size in MiB. */
  maxUploadMib: Number(env("LOUPE_MAX_UPLOAD_MIB", "100")),
  /**
   * Auth strategy for API routes:
   * - internal: trusted-network only (no explicit token check)
   * - bearer: require Authorization Bearer token
   * - api-key: require x-api-key
   * - hybrid: allow trusted-internal OR bearer/api-key
   */
  authMode: normalizeAuthMode(env("LOUPE_AUTH_MODE", "internal")),
  /**
   * Bearer secret used by `bearer` and `hybrid` modes.
   */
  bearerToken: process.env.LOUPE_BEARER_TOKEN ?? null,
  /**
   * API-key secret used by `api-key` and `hybrid` modes.
   */
  apiKey: process.env.LOUPE_API_KEY ?? null,
  /**
   * Optional explicit internal-call secret. When set, internal-mode checks
   * require the header `x-loupe-internal-token: <token>`.
   */
  internalToken: process.env.LOUPE_INTERNAL_TOKEN ?? null,
  /**
   * Default hosted viewer base URL for generated links.
   */
  viewerBaseUrl: env("LOUPE_VIEWER_BASE_URL", "https://loupepdf.com/demo"),
  /** Path to the `gs` binary. */
  ghostscriptBin: env("GS_BIN", "gs"),
  /** Allowed render DPIs — clamps client-supplied values. */
  minDpi: 36,
  maxDpi: 600,
};
