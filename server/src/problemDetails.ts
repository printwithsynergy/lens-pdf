/**
 * RFC 7807 Problem Details — the org-decided error envelope across
 * the printwithsynergy HTTP services (audit finding #13). Every 4xx/
 * 5xx response from lens-server emits this shape with the spec
 * media type `application/problem+json`.
 *
 * The canonical shape:
 *
 *   {
 *     "type":     "https://github.com/printwithsynergy/lens-pdf/...",
 *     "title":    "Brief, human-readable summary",
 *     "status":   400,
 *     "detail":   "Specific explanation of *this* occurrence",
 *     "instance": "/jobs/abc/source"     // optional
 *   }
 *
 * Callers can extend with custom fields (e.g. `errors` for Zod
 * validation issues, `code` for a machine-readable subtype).
 *
 * **MIGRATION PLAN (Phase D of the cross-stack audit, AUDIT.md #13):**
 * the framework-agnostic builder + types + canonical `type:` URI
 * fragments will move to `@printwithsynergy/codex-client/problem-details`
 * so every TS service (lens-server, synergy, platform) imports the
 * same source of truth. The Hono-flavored `c.body(...)` wrappers
 * stay here. When that lands, this file becomes a thin re-export +
 * Hono adapters; the call sites in routes/* don't change.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Media type per RFC 7807 §3. */
export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/** Canonical Problem Details shape + room for extension fields. */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  [extension: string]: unknown;
}

/** Base URL for `type` URIs. Each rule gets a stable fragment. */
const TYPE_BASE =
  "https://github.com/printwithsynergy/lens-pdf/tree/main/server#";

function makeType(slug: string): string {
  return `${TYPE_BASE}${slug}`;
}

/** Emit a Problem Details response from a Hono context. */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  detail: string,
  extras: Record<string, unknown> = {},
): Response {
  const body: ProblemDetails = {
    type: makeType(slugFor(status)),
    title,
    status,
    detail,
    instance: new URL(c.req.url).pathname,
    ...extras,
  };
  return c.body(JSON.stringify(body), status, {
    "content-type": PROBLEM_CONTENT_TYPE,
  });
}

function slugFor(status: number): string {
  switch (status) {
    case 400:
      return "bad-request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not-found";
    case 409:
      return "conflict";
    case 422:
      return "unprocessable-entity";
    case 429:
      return "too-many-requests";
    case 500:
      return "internal-error";
    case 502:
      return "bad-gateway";
    case 503:
      return "service-unavailable";
    case 504:
      return "gateway-timeout";
    default:
      return `status-${status}`;
  }
}

// ---------------------------------------------------------------------------
// Helpers for the most common cases. Keeping the call sites small.
// ---------------------------------------------------------------------------

export const badRequest = (c: Context, detail: string) =>
  problem(c, 400, "Bad Request", detail);

export const unauthorized = (
  c: Context,
  detail = "Missing or invalid credentials.",
) => problem(c, 401, "Unauthorized", detail);

export const notFound = (c: Context, detail = "Resource not found.") =>
  problem(c, 404, "Not Found", detail);

export const unprocessable = (c: Context, detail: string, errors?: unknown) =>
  problem(
    c,
    422,
    "Unprocessable Entity",
    detail,
    errors !== undefined ? { errors } : {},
  );

export const gatewayTimeout = (c: Context, detail: string) =>
  problem(c, 504, "Gateway Timeout", detail);

export const internalError = (c: Context, detail = "Internal server error.") =>
  problem(c, 500, "Internal Server Error", detail);

// ---------------------------------------------------------------------------
// Binary body helper — Hono's `c.body()` overloads don't accept Node's
// Buffer directly even though runtime supports it. Pass a fresh
// Uint8Array view of the same memory (zero-copy) so the type checker
// is happy and we don't allocate.
// ---------------------------------------------------------------------------

export function bytesResponse(
  c: Context,
  bytes: Buffer,
  status: ContentfulStatusCode = 200,
): Response {
  // Hono v4's `c.body` BufferSource overload doesn't accept the wider
  // `Uint8Array<ArrayBufferLike>` type that Node's Buffer currently
  // resolves to in @types/node. Construct the Response directly with
  // the buffer; runtime fetch accepts it just fine. We carry over the
  // headers Hono accumulated via `c.header(...)`.
  return new Response(bytes, {
    status,
    headers: c.res.headers,
  });
}
