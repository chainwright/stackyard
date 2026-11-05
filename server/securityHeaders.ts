// server/securityHeaders.ts
// Security headers applied to EVERY response (static, API, 404).
//
// The CSP is written to the one thing the built Maker actually needs:
//   - script-src 'self'            — the Maker's JS is same-origin hashed bundles
//   - style-src 'self' 'unsafe-inline' — Vite injects a same-origin stylesheet,
//       and the editor sets a few inline styles (element positions, fit scale),
//       so inline styles must be allowed; styles cannot run code, so this does
//       not weaken script protection
//   - font-src 'self'              — the two woff2 subsets are same-origin assets
//   - img-src 'self' data:         — inlined images and any data: URIs in-app
//   - connect-src 'self'           — fetch() to /api/* only
//   - frame-ancestors 'none'       — the app may not be framed (clickjacking)
//   - base-uri 'none', object-src 'none', form-action 'self'
//
// Verified by loading the real built Maker from the server (see TASK-21 gate):
// the SPA boots, fonts load, and generate/export fetches work under this CSP.

import type { ServerResponse } from "node:http";

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

/** Set the shared security headers on `res`. Call before writeHead. */
export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Content-Security-Policy", CSP);
}

/** Exposed for tests. */
export const CONTENT_SECURITY_POLICY = CSP;
