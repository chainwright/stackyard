// server/clientAddress.ts
// Resolve a stable client identity for rate limiting.
//
// The client IP must be a value the VISITOR cannot control, or the per-visitor
// rate limit is trivially bypassed. Render (and most proxies) APPEND the real
// client IP to the end of `X-Forwarded-For`; the leftmost entry is whatever the
// visitor sent, so keying on it lets a client rotate it per request for a fresh
// bucket each time (TASK-21g — observed live). So:
//
//   - TRUST_PROXY unset              → socket remote address (ignore all
//                                       forwarding headers).
//   - TRUST_PROXY=1 + CLIENT_IP_HEADER set and present
//                                     → that single-value header (a provider
//                                       header like cf-connecting-ip the proxy
//                                       sets and the client can't forge past it).
//   - TRUST_PROXY=1, header absent    → the RIGHTMOST X-Forwarded-For entry (the
//                                       one the nearest trusted proxy appended),
//                                       never the leftmost client-sent one.
//
// No external dependencies.

import type { IncomingMessage } from "node:http";

/** True when the deployment sits behind a trusted proxy (Render: TRUST_PROXY=1). */
export function trustProxyFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env["TRUST_PROXY"] === "1";
}

/** The configured provider IP header name (lower-cased), or undefined. */
export function clientIpHeaderFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env["CLIENT_IP_HEADER"];
  if (typeof raw !== "string") return undefined;
  const name = raw.trim().toLowerCase();
  return name.length > 0 ? name : undefined;
}

/** Normalise a possibly-array header to a single string value. */
function headerValue(
  req: IncomingMessage,
  name: string,
): string | undefined {
  const v = req.headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export interface ClientAddressOptions {
  /** Whether to trust forwarding headers at all (TRUST_PROXY=1). */
  trustProxy: boolean;
  /** Provider IP header name (lower-cased), if configured (CLIENT_IP_HEADER). */
  clientIpHeader?: string | undefined;
}

/**
 * The client identity for `req`. See the module header for the resolution
 * order. The returned value is non-empty (falls back to "unknown").
 */
export function clientAddress(
  req: IncomingMessage,
  options: ClientAddressOptions,
): string {
  if (options.trustProxy) {
    // 1. A trusted single-value provider header (cannot be forged past the proxy).
    if (options.clientIpHeader !== undefined) {
      const raw = headerValue(req, options.clientIpHeader);
      if (typeof raw === "string") {
        const value = raw.split(",")[0]?.trim();
        if (value !== undefined && value.length > 0) return value;
      }
    }

    // 2. The RIGHTMOST X-Forwarded-For entry (appended by the nearest proxy).
    const xff = headerValue(req, "x-forwarded-for");
    if (typeof xff === "string") {
      const parts = xff
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (parts.length > 0) return parts[parts.length - 1]!;
    }
  }

  // 3. No trusted proxy (or nothing usable): the socket address.
  return req.socket.remoteAddress ?? "unknown";
}

// ---------------------------------------------------------------------------
// Diagnostics (TASK-21g #2) — temporary, off by default.

/** The raw forwarding-header values we log when DEBUG_CLIENT_ADDR=1. */
export interface ClientAddressDiagnostics {
  "x-forwarded-for": string | undefined;
  "true-client-ip": string | undefined;
  "cf-connecting-ip": string | undefined;
  "x-real-ip": string | undefined;
  socket: string | undefined;
  chosen: string;
}

/**
 * Collect ONLY the forwarding headers and socket address (no body, no other
 * headers) plus the chosen limiter address, for a temporary diagnostic log.
 */
export function clientAddressDiagnostics(
  req: IncomingMessage,
  chosen: string,
): ClientAddressDiagnostics {
  return {
    "x-forwarded-for": headerValue(req, "x-forwarded-for"),
    "true-client-ip": headerValue(req, "true-client-ip"),
    "cf-connecting-ip": headerValue(req, "cf-connecting-ip"),
    "x-real-ip": headerValue(req, "x-real-ip"),
    socket: req.socket.remoteAddress,
    chosen,
  };
}
