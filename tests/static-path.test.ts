// tests/static-path.test.ts
// Unit tests for resolveSafePath (TASK-21a): the attacker-controlled request
// path must never resolve outside the build root.

import { describe, it, expect } from "vitest";
import path from "node:path";
import { resolveSafePath } from "../server/staticFiles.js";

const ROOT = path.resolve("/srv/app/dist/maker");

function escapes(urlPathname: string): boolean {
  return resolveSafePath(ROOT, urlPathname).filePath === null;
}

describe("resolveSafePath", () => {
  it("accepts normal paths inside the root", () => {
    const r = resolveSafePath(ROOT, "/assets/main-abc123.js");
    expect(r.filePath).toBe(path.join(ROOT, "assets", "main-abc123.js"));
    expect(r.hasExtension).toBe(true);
  });

  it("maps '/' to the root itself (served as index.html by the handler)", () => {
    const r = resolveSafePath(ROOT, "/");
    expect(r.filePath).toBe(ROOT);
    expect(r.hasExtension).toBe(false);
  });

  it("rejects plain .. traversal", () => {
    expect(escapes("/../package.json")).toBe(true);
    expect(escapes("/../../etc/passwd")).toBe(true);
  });

  it("rejects percent-encoded .. traversal", () => {
    expect(escapes("/%2e%2e/package.json")).toBe(true);
    expect(escapes("/%2E%2E/package.json")).toBe(true);
  });

  it("rejects mixed encoded-slash traversal", () => {
    expect(escapes("/assets/..%2f..%2fpackage.json")).toBe(true);
    expect(escapes("/assets/%2e%2e%2f%2e%2e%2fpackage.json")).toBe(true);
  });

  it("rejects backslash traversal variants", () => {
    expect(escapes("/..\\package.json")).toBe(true);
    expect(escapes("/%2e%2e%5cpackage.json")).toBe(true);
  });

  it("rejects a NUL byte", () => {
    expect(escapes("/index.html%00.png")).toBe(true);
    expect(escapes("/\u0000")).toBe(true);
  });

  it("rejects a malformed percent-escape", () => {
    expect(escapes("/%")).toBe(true);
    expect(escapes("/%zz")).toBe(true);
  });

  it("an extension-less in-root path resolves (SPA candidate) with hasExtension false", () => {
    const r = resolveSafePath(ROOT, "/some/deep/route");
    expect(r.filePath).toBe(path.join(ROOT, "some", "deep", "route"));
    expect(r.hasExtension).toBe(false);
  });
});
