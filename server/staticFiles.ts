// server/staticFiles.ts
// Serve the built Maker SPA from a build directory, safely.
//
// Security: the request path is attacker-controlled. We percent-decode it,
// reject a NUL byte, resolve it against the build root, and then confirm the
// resolved absolute path is STILL inside the root. Any path that escapes the
// root (`..`, encoded `%2e%2e`, backslashes, `..%2f` mixes, absolute paths) is
// refused with 403 and never reads a file from outside the root. We also only
// serve GET/HEAD; other methods on a non-/api path get 405.
//
// SPA fallback: `/` and extension-less paths (that are not under /api/) serve
// index.html so client-side routing works, but a request for a path WITH a file
// extension that does not exist returns 404 — a missing asset must not be masked
// by the SPA shell (which would serve HTML with a JS content-type expectation).
//
// No external dependencies.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { applySecurityHeaders } from "./securityHeaders.js";

// ---------------------------------------------------------------------------
// Content types

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

function contentTypeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Safe path resolution

export interface ResolvedPath {
  /** The absolute file path inside the root, or null if the request escaped it. */
  filePath: string | null;
  /** True when the (safe) request path had a file extension. */
  hasExtension: boolean;
}

/**
 * Resolve a URL pathname to an absolute file path inside `root`, or return
 * `null` when the path is unsafe or escapes the root.
 *
 * Steps: strip the query, percent-decode, reject NUL, normalise backslashes to
 * forward slashes, join under root, then verify the resolved path is still
 * within root (prefix check on the normalised absolute paths).
 */
export function resolveSafePath(root: string, urlPathname: string): ResolvedPath {
  const rootAbs = path.resolve(root);

  // Strip any query/hash already removed by the caller; take pathname only.
  let p = urlPathname;

  // Percent-decode. A malformed escape (e.g. a lone %) throws — treat as unsafe.
  try {
    p = decodeURIComponent(p);
  } catch {
    return { filePath: null, hasExtension: false };
  }

  // Reject a NUL byte outright (poison-null-byte).
  if (p.includes("\u0000")) {
    return { filePath: null, hasExtension: false };
  }

  // Normalise Windows-style separators so a backslash can't be used to escape.
  p = p.replace(/\\/g, "/");

  // Must be an absolute-style request path.
  if (!p.startsWith("/")) p = "/" + p;

  const hasExtension = path.extname(p) !== "";

  // Join under the root and fully resolve (collapses any ".." segments).
  const candidate = path.resolve(rootAbs, "." + p);

  // The resolved path must be the root itself or strictly inside it.
  if (candidate !== rootAbs && !candidate.startsWith(rootAbs + path.sep)) {
    return { filePath: null, hasExtension };
  }

  return { filePath: candidate, hasExtension };
}

// ---------------------------------------------------------------------------
// Serving

async function statFile(p: string): Promise<Stats | null> {
  try {
    const s = await stat(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  applySecurityHeaders(res);
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendFile(
  res: ServerResponse,
  method: string,
  filePath: string,
  size: number,
  cacheControl: string,
): void {
  applySecurityHeaders(res);
  res.writeHead(200, {
    "Content-Type": contentTypeFor(filePath),
    "Content-Length": size,
    "Cache-Control": cacheControl,
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

/** Cache-Control for a resolved file: immutable for hashed /assets/, else no-cache. */
function cacheControlFor(urlPathname: string): string {
  if (urlPathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  // index.html and other top-level files: always revalidate.
  return "no-cache";
}

export interface StaticServerOptions {
  /** Absolute or relative path to the build root (e.g. dist/maker). */
  root: string;
}

/**
 * Serve a static file for `req`/`res` from the build root, with SPA fallback.
 * The caller routes `/api/*` elsewhere; this handler owns everything else.
 *
 * Returns nothing — it always writes a response (file, index.html, 403, 404 or
 * 405).
 */
export async function serveStatic(
  req: IncomingMessage,
  res: ServerResponse,
  opts: StaticServerOptions,
): Promise<void> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    sendJson(res, 405, { ok: false, message: "Method not allowed." });
    return;
  }

  const rootAbs = path.resolve(opts.root);
  const urlPathname = (req.url ?? "/").split("?")[0]!.split("#")[0]!;
  const indexPath = path.join(rootAbs, "index.html");

  const resolved = resolveSafePath(rootAbs, urlPathname);
  if (resolved.filePath === null) {
    // Unsafe path (escaped the root). Never read anything outside root.
    sendJson(res, 403, { ok: false, message: "Not found." });
    return;
  }

  // A direct file hit (including "/" → index.html via the directory case).
  const direct = await statFile(resolved.filePath);
  if (direct !== null) {
    sendFile(res, method, resolved.filePath, direct.size, cacheControlFor(urlPathname));
    return;
  }

  // "/" or a directory path resolves to the root/dir itself (not a file). Serve
  // index.html for the directory case.
  if (urlPathname === "/" || urlPathname.endsWith("/")) {
    const idx = await statFile(indexPath);
    if (idx !== null) {
      sendFile(res, method, indexPath, idx.size, "no-cache");
      return;
    }
    sendJson(res, 404, { ok: false, message: "Not found." });
    return;
  }

  // SPA fallback: an extension-less path that is NOT under /api/ serves
  // index.html so client-side routing works. A path WITH an extension that is
  // missing is a real 404 (don't mask a missing asset with the shell).
  if (!resolved.hasExtension && !urlPathname.startsWith("/api/")) {
    const idx = await statFile(indexPath);
    if (idx !== null) {
      sendFile(res, method, indexPath, idx.size, "no-cache");
      return;
    }
  }

  sendJson(res, 404, { ok: false, message: "Not found." });
}
