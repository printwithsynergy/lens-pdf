/**
 * Bearer auth — coarse service-to-service. Set `LENS_BEARER_TOKEN`
 * (existing env var, preserved from the previous Express server)
 * and every render route requires `Authorization: Bearer <token>`.
 * Unset → server runs unauthenticated and logs a warning at startup.
 *
 * This is intentionally *not* tenant-aware; tenant auth lives in the
 * gateway (synergy / platform), not here. That separation is why the
 * lens move out of synergy/apps/lens-server is clean — we keep the
 * service stateless + per-tenant logic stays upstream.
 */
import { createMiddleware } from "hono/factory";
import { config } from "./config.js";
import { logger } from "./observability.js";
import { unauthorized } from "./problemDetails.js";

if (!config.bearerToken) {
  logger.warn(
    "LENS_BEARER_TOKEN is not set; lens-server is running unauthenticated. Set it in any environment that's reachable beyond localhost.",
  );
}

export const requireAuth = createMiddleware(async (c, next) => {
  if (!config.bearerToken) {
    // Dev mode — no auth.
    return next();
  }
  const header = c.req.header("authorization") ?? "";
  const supplied = header.replace(/^Bearer\s+/i, "");
  // Constant-time compare to avoid leaking the token via timing.
  if (!constantTimeEquals(supplied, config.bearerToken)) {
    return unauthorized(c);
  }
  return next();
});

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
