// server/clientAddress.ts
// Resolve a stable client identity for rate limiting.
//
// Behind Render's proxy the real client address is in `X-Forwarded-For`
// (comma-separated; the first entry is the original client). But a header can
// be spoofed, so we trust it ONLY when TRUST_PROXY is enabled — otherwise a
// client could set X-Forwarded-For to a random value per request and sidestep
// the per-client limit entirely. When not trusting the proxy, we use the socket
// remote address.

import type { IncomingMessage } from "node:http";

/** True when the deployment sits behind a trusted proxy (Render: TRUST_PROXY=1). */
export function trustProxyFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["TRUST_PROXY"] === "1";
}

/**
 * The client identity for `req`.
 *
 * @param trustProxy  When true, use the first `X-Forwarded-For` address if
 *                    present. When false, ignore the header entirely.
 */
export function clientAddress(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = req.headers["x-forwarded-for"];
    const raw = Array.isArray(xff) ? xff[0] : xff;
    if (typeof raw === "string") {
      const first = raw.split(",")[0]?.trim();
      if (first !== undefined && first.length > 0) return first;
    }
  }
  return req.socket.remoteAddress ?? "unknown";
}
