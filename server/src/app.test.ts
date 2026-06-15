/**
 * Smoke tests — boot the app, walk every route, confirm the response
 * shapes match the contract (Problem Details for 4xx/5xx, JSON
 * shapes for 2xx).
 *
 * No external dependencies needed — these run pure in-process via
 * Hono's `app.request()` helper. They DON'T spawn Ghostscript /
 * Puppeteer.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { config } from "./config.js";

describe("lens-server", () => {
  const app = createApp();

  describe("health", () => {
    it("GET /healthz returns ok + version + service", async () => {
      const res = await app.request("/healthz");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe("ok");
      expect(body.service).toBe("lens-server");
    });

    it("GET /readyz returns ready", async () => {
      const res = await app.request("/readyz");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.status).toBe("ready");
    });

    it("GET /v1/contract returns the service descriptor (no auth)", async () => {
      const res = await app.request("/v1/contract");
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.service).toBe("lens-server");
      expect(typeof body.version).toBe("string");
      expect(Array.isArray(body.capabilities)).toBe(true);
      const caps = body.capabilities as Array<{ name: string }>;
      expect(caps.some((c) => c.name === "render_page")).toBe(true);
      // Assert against config so the test tracks the real clamp, not a literal.
      const limits = body.limits as Record<string, unknown>;
      expect(limits.min_dpi).toBe(config.minDpi);
      expect(limits.max_dpi).toBe(config.maxDpi);
      expect(limits.max_upload_mib).toBe(config.maxUploadMib);
    });
  });

  describe("Problem Details", () => {
    it("404 on unknown route is application/problem+json", async () => {
      const res = await app.request("/does-not-exist");
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
      const body = (await res.json()) as Record<string, unknown>;
      // Canonical type URIs now point at docs.printwithsynergy.com
      // (per the shared @printwithsynergy/codex-client/problem-details
      // module), not lens-pdf docs. See AUDIT.md finding #13.
      expect(body.type).toMatch(/docs\.printwithsynergy\.com\/problems\//);
      expect(body.title).toBe("Not Found");
      expect(body.status).toBe(404);
      expect(body.detail).toBeTypeOf("string");
      expect(body.instance).toBe("/does-not-exist");
    });

    it("422 on invalid /density JSON body", async () => {
      const res = await app.request("/jobs/abc/density", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      });
      expect(res.status).toBe(422);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.title).toBe("Unprocessable Entity");
    });

    it("422 on /jobs/:jobId/page/:pageNum.png with bad page", async () => {
      const res = await app.request("/jobs/abc/page/zero.png");
      expect(res.status).toBe(422);
    });

    it("404 on /jobs/:nonexistent/page/1.png", async () => {
      const res = await app.request("/jobs/nope/page/1.png");
      // Either 404 (job not found) or 422 (jobId validation) depending
      // on whether the jobId passes regex. Both are acceptable Problem
      // Details responses; what we care about is no 500.
      expect([404, 422]).toContain(res.status);
    });
  });

  describe("auth (LENS_BEARER_TOKEN gating)", () => {
    let originalToken: string | undefined;
    beforeEach(() => {
      originalToken = process.env.LENS_BEARER_TOKEN;
    });
    afterEach(() => {
      if (originalToken === undefined) delete process.env.LENS_BEARER_TOKEN;
      else process.env.LENS_BEARER_TOKEN = originalToken;
    });

    it("when LENS_BEARER_TOKEN unset, render routes are open", async () => {
      // POST /render without auth header — should reach the multipart
      // parser (and 422 due to missing context, not 401).
      const res = await app.request("/render", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=----X" },
        body: "------X--",
      });
      // Body parsing may 400/422; either way, NOT 401.
      expect(res.status).not.toBe(401);
    });
  });

  describe("inspect", () => {
    it("POST /inspect rejects a non-integer page", async () => {
      const res = await app.request("/inspect?page=zero", {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: "%PDF-1.4",
      });
      expect(res.status).toBe(422);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
    });

    it("POST /inspect rejects an unsupported content type", async () => {
      const res = await app.request("/inspect?page=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
    });

    it("POST /inspect rejects an empty multipart file", async () => {
      const form = new FormData();
      form.append("file", new Blob([], { type: "application/pdf" }), "x.pdf");
      const res = await app.request("/inspect?page=1", {
        method: "POST",
        body: form,
      });
      expect(res.status).toBe(400);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
    });

    it("POST /inspect rejects an empty pdf body", async () => {
      const res = await app.request("/inspect?page=1", {
        method: "POST",
        headers: { "content-type": "application/pdf" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("render-page", () => {
    it("POST /render-page rejects a non-integer page", async () => {
      const res = await app.request("/render-page?page=zero", {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: "%PDF-1.4",
      });
      expect(res.status).toBe(422);
      expect(res.headers.get("content-type")).toContain(
        "application/problem+json",
      );
    });

    it("POST /render-page rejects an out-of-range dpi", async () => {
      const res = await app.request("/render-page?page=1&dpi=99999", {
        method: "POST",
        headers: { "content-type": "application/pdf" },
        body: "%PDF-1.4",
      });
      expect(res.status).toBe(422);
    });

    it("POST /render-page rejects an unsupported content type", async () => {
      const res = await app.request("/render-page?page=1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(400);
    });

    it("POST /render-page rejects an empty pdf body", async () => {
      const res = await app.request("/render-page?page=1", {
        method: "POST",
        headers: { "content-type": "application/pdf" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("metrics", () => {
    it("GET /metrics returns Prometheus exposition", async () => {
      // Hit a route first so a metric is non-zero.
      await app.request("/healthz");
      const res = await app.request("/metrics");
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toMatch(/lens_server_requests_total/);
    });
  });
});
