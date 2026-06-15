/**
 * lens-server Hono app — middleware + route registration. Kept
 * separate from the entry (`./index.ts`) so tests can import the
 * app without starting a listener.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  httpRequestDurationSeconds,
  httpRequestsTotal,
  logger,
  registry,
} from "./observability.js";
import { internalError, notFound } from "./problemDetails.js";
import { health } from "./routes/health.js";
import { inspect } from "./routes/inspect.js";
import { pages } from "./routes/pages.js";
import { render } from "./routes/render.js";
import { renderPage } from "./routes/render-page.js";
import { sampling } from "./routes/sampling.js";
import { sources } from "./routes/sources.js";

export function createApp(): Hono {
  const app = new Hono();

  app.use(
    "/*",
    cors({
      origin: (origin) => origin ?? "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Authorization", "Content-Type", "X-Idempotency-Key"],
      exposeHeaders: ["X-Request-Id", "Cache-Tag"],
      maxAge: 86400,
    }),
  );

  // Structured request logging + Prometheus metrics. Runs around
  // every request, including 4xx/5xx.
  app.use("*", async (c, next) => {
    const start = performance.now();
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;
    await next();
    const status = c.res.status;
    const durationSeconds = (performance.now() - start) / 1000;
    httpRequestsTotal.inc({ method, path, status: String(status) });
    httpRequestDurationSeconds.observe({ method, path }, durationSeconds);
    logger.info(
      {
        method,
        path,
        status,
        durationMs: Math.round(durationSeconds * 1000),
      },
      "request",
    );
  });

  // Prometheus scrape endpoint — no auth (gateway scopes the route).
  app.get("/metrics", async (_c) => {
    const output = await registry.metrics();
    return new Response(output, {
      headers: { "Content-Type": registry.contentType },
    });
  });

  // Health (no auth)
  app.route("/", health);

  // Authenticated routes
  app.route("/", sources);
  app.route("/", pages);
  app.route("/", sampling);
  app.route("/", render);
  app.route("/", renderPage);
  app.route("/", inspect);

  app.notFound((c) => notFound(c, "Route not found."));

  app.onError((err, c) => {
    logger.error({ err: err.message, stack: err.stack }, "unhandled error");
    return internalError(c, err.message || "Internal error.");
  });

  return app;
}
