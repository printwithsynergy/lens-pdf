/**
 * pino structured logger + prom-client metrics for lens-server. No
 * `@synergy/*` deps — everything lives here so lens-server stays
 * independently shippable.
 *
 * Env:
 *   LENS_LOG_LEVEL   default "info"
 *   LENS_LOG_PRETTY  "1" → pino-pretty (dev), unset → JSON (prod)
 */
import pino from "pino";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

// Conditionally include `transport` so `exactOptionalPropertyTypes`
// (when enabled) doesn't reject `transport: undefined`.
const pinoOptions: pino.LoggerOptions = {
  level: process.env.LENS_LOG_LEVEL ?? "info",
};
if (process.env.LENS_LOG_PRETTY === "1") {
  pinoOptions.transport = {
    target: "pino-pretty",
    options: { colorize: true },
  };
}
export const logger = pino(pinoOptions);

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "lens_server_requests_total",
  help: "HTTP requests served by lens-server.",
  labelNames: ["method", "path", "status"],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: "lens_server_request_duration_seconds",
  help: "End-to-end HTTP request duration, in seconds.",
  labelNames: ["method", "path"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60],
  registers: [registry],
});

export const renderRequestsTotal = new Counter({
  name: "lens_server_renders_total",
  help: "Renderer invocations by tool + format + outcome.",
  labelNames: ["tool", "format", "outcome"],
  registers: [registry],
});
