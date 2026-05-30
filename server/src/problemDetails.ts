import {
  PROBLEM_CONTENT_TYPE,
  type ProblemDetails,
  buildProblem,
  problems,
} from "@printwithsynergy/codex-client/problem-details";
/**
 * Hono adapters over the shared RFC 7807 Problem Details builders
 * that live in `@printwithsynergy/codex-client/problem-details`.
 *
 * The org rule (audit finding #13 — "things shared by all live in
 * codex") makes the data shape + canonical type URIs + builders the
 * shared module's responsibility. This file owns the framework glue:
 * Hono `Context` -> `Response` with the right body, status, and
 * `Content-Type: application/problem+json`.
 *
 * Call sites in `routes/*` keep the same import surface
 * (`unauthorized(c, "...")`, `notFound(c, "...")`, etc.) — only the
 * implementation moves to delegate to the shared package.
 */
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export { PROBLEM_CONTENT_TYPE, type ProblemDetails };

/** Emit a Problem Details response from a Hono context. */
export function problem(
  c: Context,
  status: ContentfulStatusCode,
  title: string,
  detail: string,
  extras: Record<string, unknown> = {},
): Response {
  const body = buildProblem(status, title, detail, {
    instance: new URL(c.req.url).pathname,
    extras,
  });
  return c.body(JSON.stringify(body), status, {
    "content-type": PROBLEM_CONTENT_TYPE,
  });
}

// ---------------------------------------------------------------------------
// Convenience wrappers — delegate to the shared module's `problems.*`
// builders, then emit via Hono. Call sites stay identical to the pre-
// migration surface.
// ---------------------------------------------------------------------------

function emit(c: Context, body: ProblemDetails): Response {
  const withInstance: ProblemDetails = {
    ...body,
    instance: new URL(c.req.url).pathname,
  };
  return c.body(
    JSON.stringify(withInstance),
    body.status as ContentfulStatusCode,
    { "content-type": PROBLEM_CONTENT_TYPE },
  );
}

export const badRequest = (c: Context, detail: string) =>
  emit(c, problems.badRequest(detail));

export const unauthorized = (
  c: Context,
  detail = "Missing or invalid credentials.",
) => emit(c, problems.unauthorized(detail));

export const notFound = (c: Context, detail = "Resource not found.") =>
  emit(c, problems.notFound(detail));

export const unprocessable = (c: Context, detail: string, errors?: unknown) =>
  emit(
    c,
    problems.unprocessable(
      detail,
      errors !== undefined ? { extras: { errors } } : undefined,
    ),
  );

export const gatewayTimeout = (c: Context, detail: string) =>
  emit(c, problems.gatewayTimeout(detail));

export const internalError = (c: Context, detail = "Internal server error.") =>
  emit(c, problems.internal(detail));

// ---------------------------------------------------------------------------
// Binary body helper — Hono v4's `c.body` BufferSource overload doesn't
// accept Node's Buffer directly even though runtime supports it.
// Construct the Response directly; carry over the headers Hono
// accumulated via `c.header(...)`.
// ---------------------------------------------------------------------------

export function bytesResponse(
  c: Context,
  bytes: Buffer,
  status: ContentfulStatusCode = 200,
): Response {
  return new Response(bytes, {
    status,
    headers: c.res.headers,
  });
}
