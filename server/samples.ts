// server/samples.ts
// Serve the three committed sample lesson files at /samples/<name>.html
// (TASK-30c). A judge or a teacher can open a real living file from the live app
// without generating anything, and see the Teacher tab one click away.
//
// Security
//   - ALLOWLIST: exactly three names. The URL is only ever looked up in this
//     list; no part of it reaches the filesystem. `..`, encoded dots, other
//     cases, query tricks and sub-paths are simply "not in the list" → 404.
//   - The files are self-contained (inline script and style, data: fonts and
//     images) and must make NO network request, so they get their own strict CSP
//     instead of the Maker's. The Maker's CSP is unchanged.

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";

/** The only files served, by exact URL name. */
export const SAMPLE_NAMES: ReadonlySet<string> = new Set([
  "irish-words.html",
  "times-tables.html",
  "vikings-in-ireland.html",
]);

/** CSP for an offline lesson file: nothing may load or connect; inline code runs. */
export const SAMPLE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "img-src data: blob:",
  "connect-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** True when `pathname` is under /samples (so the static server must never see it). */
export function isSamplesPath(pathname: string): boolean {
  return pathname === "/samples" || pathname.startsWith("/samples/");
}

function notFound(res: ServerResponse): void {
  const body = JSON.stringify({ ok: false, message: "Not found." });
  res.writeHead(404, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "X-Content-Type-Options": "nosniff",
  });
  res.end(body);
}

/**
 * Handle a /samples/* request. `dir` is the directory that holds the files
 * (default: ./samples). Only GET and HEAD are served.
 */
export async function serveSample(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  dir: string = path.resolve(process.cwd(), "samples"),
): Promise<void> {
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "X-Content-Type-Options": "nosniff" });
    res.end();
    return;
  }

  // Exact allowlist lookup. The name is taken from OUR set, not from the URL.
  const wanted = pathname.startsWith("/samples/") ? pathname.slice("/samples/".length) : "";
  const name = [...SAMPLE_NAMES].find((n) => n === wanted);
  if (name === undefined) {
    notFound(res);
    return;
  }

  const file = path.join(dir, name);
  let size: number;
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    size = s.size;
  } catch {
    notFound(res);
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": size,
    "Content-Security-Policy": SAMPLE_CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-cache",
  });
  if (method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}
