/**
 * Contract descriptor — `GET /v1/contract`.
 *
 * Org convention (cross-stack audit): every HTTP engine exposes
 * `/healthz` + `/readyz` + `/v1/contract`. This is the lens-server
 * raster/inspect sidecar's machine-readable surface descriptor — its
 * version, the capabilities (routes) it serves, and the render limits
 * a caller must respect (DPI clamp + max upload). No auth: synergy and
 * platform poll it unauthenticated to discover the surface, same as the
 * `/healthz` + `/readyz` probes.
 */
import { Hono } from "hono";
import { config } from "../config.js";

/** Server version, surfaced in `/v1/contract` (same source + fallback as `/healthz`). */
export const SERVICE_VERSION = process.env.npm_package_version ?? "0.0.0";

export const contract = new Hono();

contract.get("/v1/contract", (c) => {
  return c.json({
    service: "lens-server",
    version: SERVICE_VERSION,
    // The stateless endpoints synergy's lens.* nodes call, plus the
    // stateful job-based viewer surface. Method + path are the wire
    // contract a host integrates against.
    capabilities: [
      { name: "inspect", method: "POST", path: "/inspect" },
      { name: "render", method: "POST", path: "/render" },
      { name: "render_page", method: "POST", path: "/render-page" },
      { name: "source_upload", method: "POST", path: "/jobs/:jobId/source" },
      {
        name: "page_image",
        method: "GET",
        path: "/jobs/:jobId/page/:pageNum.png",
      },
      { name: "channels", method: "GET", path: "/jobs/:jobId/channels" },
      {
        name: "channel_image",
        method: "GET",
        path: "/jobs/:jobId/channel/:channelName.png",
      },
      { name: "density", method: "POST", path: "/jobs/:jobId/density" },
      { name: "color_sample", method: "GET", path: "/jobs/:jobId/color" },
      { name: "tac", method: "GET", path: "/jobs/:jobId/tac.png" },
    ],
    limits: {
      min_dpi: config.minDpi,
      max_dpi: config.maxDpi,
      max_upload_mib: config.maxUploadMib,
    },
  });
});
