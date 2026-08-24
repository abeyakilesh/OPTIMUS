/**
 * The HTTP-call primitive SERVICE-fate capabilities need when the real
 * engine is a long-lived local server (OmniRoute's chat endpoint, and any
 * future n8n/harbor/Stirling-PDF absorption) rather than a one-shot process
 * (that's spawnProcess, tested separately). Runs against a real
 * `node:http` server on loopback — zero external dependency, runs in CI
 * with no extra environment setup.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createContext, PermissionDenied } from "../../kernel/permissions";
import { MemoryArtifactStore } from "../../kernel/artifacts";
import type { Isolation } from "../../kernel/sandbox";

function ctx(
  granted: readonly ("net:read" | "net:write")[] = [],
  isolation: Isolation = { allowedHosts: ["127.0.0.1", "localhost"] },
) {
  return createContext({
    capabilityId: "test.capability",
    granted,
    store: new MemoryArtifactStore(),
    isolation,
  });
}

let server: Server;
let baseUrl: string;
let lastRequest: { method?: string; url?: string; body: string } | undefined;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastRequest = { method: req.method, url: req.url, body };

      if (req.url === "/hang") return; // never responds — for the timeout test
      if (req.url === "/echo") {
        res.writeHead(200, { "Content-Type": "application/json", "X-Test": "yes" });
        res.end(JSON.stringify({ youSent: body, method: req.method }));
        return;
      }
      if (req.url === "/broken") {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("server error");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("netFetch — permission boundary", () => {
  it("refuses a GET without net:read granted", async () => {
    await expect(
      ctx([]).netFetch({ url: `${baseUrl}/`, timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(PermissionDenied);
  });

  it("refuses a POST without net:write granted", async () => {
    await expect(
      ctx(["net:read"]).netFetch({ url: `${baseUrl}/echo`, method: "POST", body: "x", timeoutMs: 2000 }),
    ).rejects.toBeInstanceOf(PermissionDenied);
  });

  it("net:read alone does not authorize a POST — the split is real, not decorative", async () => {
    await expect(
      ctx(["net:read"]).netFetch({ url: `${baseUrl}/echo`, method: "POST", body: "x", timeoutMs: 2000 }),
    ).rejects.toThrow(/net:write/);
  });
});

describe("netFetch — real HTTP I/O", () => {
  it("performs a real GET and returns status, headers, and body", async () => {
    const result = await ctx(["net:read"]).netFetch({ url: `${baseUrl}/echo`, timeoutMs: 5000 });
    expect(result.status).toBe(200);
    expect(result.headers["x-test"]).toBe("yes");
    expect(JSON.parse(result.body)).toEqual({ youSent: "", method: "GET" });
  });

  it("performs a real POST with a body — the server actually receives it", async () => {
    const result = await ctx(["net:write"]).netFetch({
      url: `${baseUrl}/echo`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world" }),
      timeoutMs: 5000,
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).method).toBe("POST");
    expect(lastRequest?.body).toBe(JSON.stringify({ hello: "world" }));
  });

  it("returns a non-2xx status without throwing", async () => {
    const result = await ctx(["net:read"]).netFetch({ url: `${baseUrl}/broken`, timeoutMs: 5000 });
    expect(result.status).toBe(500);
    expect(result.body).toBe("server error");
  });
});

describe("netFetch — timeout aborts a hung request (independent of the harness budget clock)", () => {
  it("aborts and reports timedOut instead of hanging forever", async () => {
    const started = Date.now();
    const result = await ctx(["net:read"]).netFetch({ url: `${baseUrl}/hang`, timeoutMs: 300 });
    const elapsed = Date.now() - started;

    expect(result.timedOut).toBe(true);
    expect(result.status).toBe(0);
    expect(elapsed).toBeLessThan(5000);
  });

  it("does not report timedOut for a request that completes in time", async () => {
    const result = await ctx(["net:read"]).netFetch({ url: `${baseUrl}/echo`, timeoutMs: 5000 });
    expect(result.timedOut).toBe(false);
  });
});

describe("netFetch — an unreachable host fails honestly", () => {
  it("rejects rather than hanging when nothing is listening", async () => {
    await expect(
      ctx(["net:read"]).netFetch({ url: "http://127.0.0.1:1", timeoutMs: 5000 }),
    ).rejects.toThrow();
  });
});
