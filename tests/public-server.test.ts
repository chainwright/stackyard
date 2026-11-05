// tests/public-server.test.ts
// Integration tests for the ONE public web service (TASK-21): static Maker
// serving + safe path resolution, SPA fallback, /api 404, health, the
// per-client rate limit, and the global daily budget. A real node:http server
// on an ephemeral port per server; a throwaway build root on disk.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createServer } from "../server/index.js";
import type { Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Spy on the model gateway so the daily-cap test can prove no model call is
// made once the cap is hit. The real generate() imports these.
vi.mock("../server/llmGateway.js", async () => {
  const actual = await vi.importActual<typeof import("../server/llmGateway.js")>(
    "../server/llmGateway.js",
  );
  return {
    ...actual,
    // Throwing LlmUnavailableError would also trigger the fallback, so to be
    // unambiguous we record the call and then behave as "unavailable".
    call: vi.fn(async () => {
      throw new actual.LlmUnavailableError("spy: no network in test");
    }),
    callStream: vi.fn(async function* () {
      throw new actual.LlmUnavailableError("spy: no network in test");
    }),
  };
});

import * as gateway from "../server/llmGateway.js";
const callSpy = vi.mocked(gateway.call);
const callStreamSpy = vi.mocked(gateway.callStream);

// ---------------------------------------------------------------------------
// A throwaway build root on disk: index.html + a hashed asset. A sentinel file
// lives OUTSIDE the root (one level up) so traversal attempts have a real
// target to try (and must never reach).

let workDir: string;
let staticRoot: string;

beforeAll(() => {
  workDir = mkdtempSync(path.join(tmpdir(), "stackyard-pub-"));
  staticRoot = path.join(workDir, "dist", "maker");
  mkdirSync(path.join(staticRoot, "assets"), { recursive: true });
  writeFileSync(path.join(staticRoot, "index.html"), "<!doctype html><title>Maker</title><body>APP</body>");
  writeFileSync(path.join(staticRoot, "assets", "main-abc123.js"), "console.log('hashed asset');");
  // Sentinel OUTSIDE the root: a traversal that escaped would read this.
  writeFileSync(path.join(workDir, "dist", "SECRET.txt"), "TOP-SECRET-OUTSIDE-ROOT");
  writeFileSync(path.join(workDir, "SECRET-ROOT.txt"), "TOP-SECRET-ABOVE-DIST");
});

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Server lifecycle helper

async function startServer(
  config: Parameters<typeof createServer>[0],
): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer(config);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

// ===========================================================================
// a) Static serving + traversal

describe("static Maker serving (TASK-21a)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    ({ server, baseUrl } = await startServer({
      serveStatic: true,
      staticRoot,
      generateRatePer10Min: 100_000,
      generateDailyCap: 1_000_000,
    }));
  });
  afterAll(() => server.close());

  it("serves index.html at / with no-cache and security headers", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    const csp = res.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'none'");
    expect(await res.text()).toContain("APP");
  });

  it("serves a hashed asset with the immutable cache header and correct type", async () => {
    const res = await fetch(`${baseUrl}/assets/main-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/javascript");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(await res.text()).toContain("hashed asset");
  });

  it("HEAD returns headers but no body", async () => {
    const res = await fetch(`${baseUrl}/assets/main-abc123.js`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/javascript");
    expect((await res.text()).length).toBe(0);
  });

  it("a non-GET/HEAD method on a static path is 405", async () => {
    const res = await fetch(`${baseUrl}/`, { method: "DELETE" });
    expect(res.status).toBe(405);
  });

  it.each([
    "/../package.json",
    "/../SECRET-ROOT.txt",
    "/../SECRET.txt",
    "/%2e%2e/SECRET.txt",
    "/%2e%2e/%2e%2e/SECRET-ROOT.txt",
    "/assets/..%2f..%2fSECRET.txt",
    "/assets/..%2f..%2f..%2fSECRET-ROOT.txt",
    "/..%5cSECRET.txt",
    "/index.html%00.png",
  ])("traversal %s never returns a file outside the root", async (attack) => {
    const res = await fetch(`${baseUrl}${attack}`);
    // Either refused (403) or a clean 404 — but NEVER the secret content.
    expect([403, 404]).toContain(res.status);
    const body = await res.text();
    expect(body).not.toContain("TOP-SECRET");
  });

  it("SPA fallback: an extension-less, non-/api path serves index.html", async () => {
    const res = await fetch(`${baseUrl}/some/client/route`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
    expect(await res.text()).toContain("APP");
  });

  it("a missing asset WITH an extension is a real 404 (not the SPA shell)", async () => {
    const res = await fetch(`${baseUrl}/assets/does-not-exist.js`);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain("APP");
  });

  it("an unknown /api/* path stays JSON 404, never the SPA shell", async () => {
    const res = await fetch(`${baseUrl}/api/nope`);
    expect(res.status).toBe(404);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(false);
  });
});

// ===========================================================================
// b) Health

describe("GET /api/health (TASK-21b)", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    callSpy.mockClear();
    callStreamSpy.mockClear();
    ({ server, baseUrl } = await startServer({ serveStatic: true, staticRoot }));
  });
  afterAll(() => server.close());

  it("returns 200 {ok:true} and makes no model call", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
    expect(callSpy).not.toHaveBeenCalled();
    expect(callStreamSpy).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// c) Rate limit

describe("per-client rate limit on /api/generate (TASK-21c)", () => {
  async function gen(baseUrl: string, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ prompt: "a quiz about the water cycle" }),
    });
  }

  it("the (limit+1)th request from one client is 429 with Retry-After", async () => {
    const { server, baseUrl } = await startServer({
      staticRoot,
      generateRatePer10Min: 6,
      generateDailyCap: 1_000_000,
    });
    try {
      for (let i = 0; i < 6; i++) {
        const r = await gen(baseUrl);
        expect(r.status, `request ${i + 1}`).not.toBe(429);
        await r.text();
      }
      const blocked = await gen(baseUrl);
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
      const body = (await blocked.json()) as { ok: boolean; message: string };
      expect(body.ok).toBe(false);
      expect(body.message).toContain("Lots of people are building");
    } finally {
      server.close();
    }
  });

  it("X-Forwarded-For is IGNORED unless TRUST_PROXY is on (all share the socket id)", async () => {
    // trustProxy OFF: differing X-Forwarded-For does NOT create new clients, so
    // the limit still trips after `limit` requests.
    const { server, baseUrl } = await startServer({
      staticRoot,
      trustProxy: false,
      generateRatePer10Min: 2,
      generateDailyCap: 1_000_000,
    });
    try {
      await (await gen(baseUrl, { "X-Forwarded-For": "1.1.1.1" })).text();
      await (await gen(baseUrl, { "X-Forwarded-For": "2.2.2.2" })).text();
      const blocked = await gen(baseUrl, { "X-Forwarded-For": "3.3.3.3" });
      expect(blocked.status).toBe(429);
    } finally {
      server.close();
    }
  });

  it("with TRUST_PROXY on, a different X-Forwarded-For is a different client", async () => {
    const { server, baseUrl } = await startServer({
      staticRoot,
      trustProxy: true,
      generateRatePer10Min: 2,
      generateDailyCap: 1_000_000,
    });
    try {
      // Client A uses up its allowance.
      await (await gen(baseUrl, { "X-Forwarded-For": "10.0.0.1" })).text();
      await (await gen(baseUrl, { "X-Forwarded-For": "10.0.0.1" })).text();
      const aBlocked = await gen(baseUrl, { "X-Forwarded-For": "10.0.0.1" });
      expect(aBlocked.status).toBe(429);
      // Client B is unaffected.
      const bOk = await gen(baseUrl, { "X-Forwarded-For": "10.0.0.2" });
      expect(bOk.status).not.toBe(429);
      await bOk.text();
    } finally {
      server.close();
    }
  });

  it("the window expiring lets the same client through again (injected clock)", async () => {
    let t = 1_000_000;
    const { server, baseUrl } = await startServer({
      staticRoot,
      trustProxy: true,
      generateRatePer10Min: 1,
      generateDailyCap: 1_000_000,
      now: () => t,
    });
    try {
      await (await gen(baseUrl, { "X-Forwarded-For": "9.9.9.9" })).text();
      const blocked = await gen(baseUrl, { "X-Forwarded-For": "9.9.9.9" });
      expect(blocked.status).toBe(429);
      // Advance past the 10-minute window.
      t += 10 * 60 * 1000 + 1;
      const allowed = await gen(baseUrl, { "X-Forwarded-For": "9.9.9.9" });
      expect(allowed.status).not.toBe(429);
      await allowed.text();
    } finally {
      server.close();
    }
  });
});

// ===========================================================================
// d) Daily budget

describe("global daily budget on /api/generate (TASK-21d)", () => {
  async function genStream(baseUrl: string): Promise<unknown[]> {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({ prompt: "a quiz about the moon" }),
    });
    const text = await res.text();
    return text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as unknown);
  }

  it("after the cap, the model gateway is NOT called and a fallback deck is served", async () => {
    callSpy.mockClear();
    callStreamSpy.mockClear();
    // Cap of 0 → every request is over budget from the first call.
    const { server, baseUrl } = await startServer({
      staticRoot,
      generateRatePer10Min: 100_000,
      generateDailyCap: 0,
    });
    try {
      const lines = await genStream(baseUrl);
      // Neither model entry point was touched.
      expect(callSpy).not.toHaveBeenCalled();
      expect(callStreamSpy).not.toHaveBeenCalled();
      // We got a real ready-made deck, streamed through to done, flagged as fallback.
      const start = lines.find((l) => (l as { type: string }).type === "start") as
        | { type: string; isFallback: boolean }
        | undefined;
      expect(start?.isFallback).toBe(true);
      const done = lines.find((l) => (l as { type: string }).type === "done") as
        | { type: string; stack: { cards: unknown[] }; isFallback: boolean }
        | undefined;
      expect(done).toBeDefined();
      expect(done!.isFallback).toBe(true);
      expect(done!.stack.cards.length).toBeGreaterThan(1);
    } finally {
      server.close();
    }
  });

  it("the daily counter resets at UTC midnight (injected clock)", async () => {
    callSpy.mockClear();
    callStreamSpy.mockClear();
    let t = new Date("2026-05-01T23:59:00Z").getTime();
    // Cap of 1: the first real request spends it; the second is forced to fallback.
    const { server, baseUrl } = await startServer({
      staticRoot,
      generateRatePer10Min: 100_000,
      generateDailyCap: 1,
      now: () => t,
    });
    try {
      // First request: within budget → a real model call is attempted (the spy
      // throws LlmUnavailable, which falls back, but the gateway WAS called).
      await (await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "a quiz about rivers" }),
      })).text();
      expect(callSpy).toHaveBeenCalledTimes(1);

      // Second request same day: over budget → NO further model call.
      await (await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "a quiz about rivers" }),
      })).text();
      expect(callSpy).toHaveBeenCalledTimes(1); // unchanged

      // Cross UTC midnight: budget resets, so a model call is attempted again.
      t = new Date("2026-05-02T00:00:30Z").getTime();
      await (await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "a quiz about rivers" }),
      })).text();
      expect(callSpy).toHaveBeenCalledTimes(2);
    } finally {
      server.close();
    }
  });
});
