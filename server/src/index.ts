#!/usr/bin/env node
/**
 * lens-server entry. Wraps the Hono app in @hono/node-server's
 * listener, ensures job dirs exist, registers graceful-shutdown
 * handlers.
 *
 * Env (see config.ts for defaults):
 *   PORT               default 3000
 *   LENS_BEARER_TOKEN  if set, every render route requires this token
 *   LENS_LOG_LEVEL     default "info"
 *   LENS_LOG_PRETTY    "1" → pino-pretty (dev)
 *   LENS_SHUTDOWN_DEADLINE_MS  default 10000
 */
import { type ServerType, serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { logger } from "./observability.js";
import { closeBrowser } from "./reportRenderer.js";
import { ensureJobsDir } from "./storage.js";

let server: ServerType | null = null;

await ensureJobsDir();
const app = createApp();
server = serve(
  { fetch: app.fetch, port: config.port, hostname: "0.0.0.0" },
  () => {
    logger.info(
      { port: config.port, version: process.env.npm_package_version },
      "lens-server started",
    );
  },
);

// Graceful shutdown — stop accepting connections, drain in-flight,
// close the Puppeteer browser singleton, then exit. Hard deadline
// at LENS_SHUTDOWN_DEADLINE_MS so a stuck handler can't keep the
// process alive forever.
const SHUTDOWN_DEADLINE_MS = Number.parseInt(
  process.env.LENS_SHUTDOWN_DEADLINE_MS ?? "10000",
  10,
);
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down lens-server");

  const force = setTimeout(() => {
    logger.error("shutdown deadline exceeded; forcing exit");
    process.exit(1);
  }, SHUTDOWN_DEADLINE_MS);
  force.unref();

  const finish = async (): Promise<void> => {
    try {
      await closeBrowser();
    } catch (err) {
      logger.error({ err }, "error closing Puppeteer browser");
    }
    process.exit(0);
  };

  if (server) {
    server.close((err) => {
      if (err) logger.error({ err }, "error closing http server");
      void finish();
    });
  } else {
    void finish();
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
