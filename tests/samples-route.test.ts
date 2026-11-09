// tests/samples-route.test.ts
// TASK-30c: the live app serves the three sample lesson files from an allowlist,
// with a CSP built for an offline lesson file, and nothing else under /samples.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { Server } from "node:http";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createServer } from "../server/index.js";
import { SAMPLE_CSP, SAMPLE_NAMES } from "../server/samples.js";
import { CONTENT_SECURITY_POLICY } from "../server/securityHeaders.js";

let server: Server;
let port = 0;

beforeAll(async () => {
  server = createServer({ serveStatic: true, staticRoot: path.join(process.cwd(), "dist", "maker") });
  await new Promise<void>((r) => server.listen(0, r));
  const a = server.address();
  port = typeof a === "object" && a ? a.port : 0;
});
afterAll(() => server.close());

/** A raw request: the path goes out byte for byte (no URL normalisation). */
function raw(method: string, p: string): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: p }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("TASK-30c: /samples/<name>.html", () => {
  it("serves exactly the three committed files, byte for byte, as text/html with nosniff", async () => {
    expect([...SAMPLE_NAMES].sort()).toEqual(["irish-words.html", "times-tables.html", "vikings-in-ireland.html"]);
    for (const name of SAMPLE_NAMES) {
      const res = await raw("GET", `/samples/${name}`);
      expect(res.status, name).toBe(200);
      expect(res.headers["content-type"], name).toMatch(/^text\/html/);
      expect(res.headers["x-content-type-options"], name).toBe("nosniff");
      expect(res.body, name).toBe(readFileSync(path.join(process.cwd(), "samples", name), "utf8"));
      expect(Number(res.headers["content-length"]), name).toBe(statSync(path.join(process.cwd(), "samples", name)).size);
    }
  });

  it("the CSP is the strict offline-lesson one, and the Maker's own CSP is unchanged", async () => {
    const res = await raw("GET", "/samples/vikings-in-ireland.html");
    const csp = String(res.headers["content-security-policy"]);
    expect(csp).toBe(SAMPLE_CSP);
    for (const part of [
      "default-src 'none'",
      "script-src 'unsafe-inline'",
      "style-src 'unsafe-inline'",
      "font-src data:",
      "img-src data: blob:",
      "connect-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(csp, part).toContain(part);
    }
    // The Maker keeps its own policy (script-src 'self', no unsafe-inline scripts).
    const maker = await raw("GET", "/api/health");
    expect(maker.headers["content-security-policy"]).toBe(CONTENT_SECURITY_POLICY);
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("font-src 'self'");
  });

  it("HEAD returns the headers without a body; other methods are 405", async () => {
    const head = await raw("HEAD", "/samples/times-tables.html");
    expect(head.status).toBe(200);
    expect(head.body).toBe("");
    expect((await raw("POST", "/samples/times-tables.html")).status).toBe(405);
  });

  it.each([
    "/samples",
    "/samples/",
    "/samples/index.html",
    "/samples/Irish-Words.html", // case
    "/samples/irish-words.html/", // trailing slash
    "/samples/irish-words.html/extra",
    "/samples/irish-words",
    "/samples/../package.json",
    "/samples/..%2fpackage.json",
    "/samples/%2e%2e/package.json",
    "/samples/%2e%2e%2fpackage.json",
    "/samples/irish-words.html%00.png",
    "/samples//irish-words.html",
    "/samples/.%2e/.env",
    "/samples/..\\package.json",
    "/samples/irish%2dwords.html", // encoded hyphen: not a name in the list
    "/samples/vikings-in-ireland.html.bak",
    "/samples/.git/config",
  ])("404 (never a file, never the SPA shell) for %s", async (p) => {
    const res = await raw("GET", p);
    expect(res.status, p).toBe(404);
    expect(res.headers["content-type"], p).toMatch(/json/);
    expect(res.body, p).not.toContain("<html");
    expect(res.body, p).not.toContain("\"name\": \"stackyard\"");
  });

  it("a query string does not change what is served", async () => {
    const res = await raw("GET", "/samples/irish-words.html?../../package.json");
    expect(res.status).toBe(200);
    expect(res.body.startsWith("<!doctype html>")).toBe(true);
  });

  it("the served files really are self-contained: nothing in them could load from the network", () => {
    for (const name of SAMPLE_NAMES) {
      const html = readFileSync(path.join(process.cwd(), "samples", name), "utf8");
      expect(html, name).not.toMatch(/\b(?:src|href)\s*=\s*['"]?https?:\/\//i);
      expect(html, name).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i);
      expect(html, name).not.toMatch(/@import/i);
    }
  });

  it("render.yaml's build does not need to copy samples/: they are in the checkout the service runs from", () => {
    const render = readFileSync("render.yaml", "utf8");
    expect(render).toContain("startCommand: npm start");
    expect(statSync("samples").isDirectory()).toBe(true);
  });
});
