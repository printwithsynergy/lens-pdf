/**
 * Liveness + readiness. Org convention (audit finding #15):
 *   /healthz — liveness
 *   /readyz  — readiness (here it's identical; lens-server has no
 *              downstream deps to check)
 *
 * No auth — these need to be reachable from k8s probes / Railway /
 * Cloudflare load balancers without credentials.
 */
import { Hono } from "hono";

export const health = new Hono();

health.get("/healthz", (c) => {
  return c.json({
    status: "ok",
    service: "lens-server",
    version: process.env.npm_package_version ?? "0.0.0",
  });
});

health.get("/readyz", (c) => {
  return c.json({ status: "ready" });
});
