// tests/client-address.test.ts
// Unit tests for clientAddress (TASK-21g): the limiter must key on a value the
// VISITOR cannot control. Render appends the real IP to the END of
// X-Forwarded-For, so the leftmost entry is attacker-controlled.

import { describe, it, expect } from "vitest";
import type { IncomingMessage } from "node:http";
import {
  clientAddress,
  clientAddressDiagnostics,
  clientIpHeaderFromEnv,
  trustProxyFromEnv,
} from "../server/clientAddress.js";

/** Build a minimal IncomingMessage-like object with headers + socket address. */
function fakeReq(
  headers: Record<string, string | string[]>,
  remoteAddress: string | undefined = "198.51.100.1",
): IncomingMessage {
  // Header names are lower-cased by node:http; mirror that here.
  const lower: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    headers: lower,
    socket: { remoteAddress } as IncomingMessage["socket"],
  } as IncomingMessage;
}

describe("clientAddress — TRUST_PROXY unset", () => {
  it("uses the socket address and ignores all forwarding headers", () => {
    const req = fakeReq(
      {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "cf-connecting-ip": "1.2.3.4",
      },
      "198.51.100.7",
    );
    expect(clientAddress(req, { trustProxy: false })).toBe("198.51.100.7");
    // Even with a configured header name, an untrusted proxy means socket.
    expect(
      clientAddress(req, { trustProxy: false, clientIpHeader: "cf-connecting-ip" }),
    ).toBe("198.51.100.7");
  });

  it("falls back to 'unknown' when there is no socket address", () => {
    // Build a req with NO socket address (the helper's default would mask this).
    const req = {
      headers: {},
      socket: { remoteAddress: undefined } as IncomingMessage["socket"],
    } as IncomingMessage;
    expect(clientAddress(req, { trustProxy: false })).toBe("unknown");
  });
});

describe("clientAddress — TRUST_PROXY=1, rightmost XFF (no provider header)", () => {
  it("keys on the RIGHTMOST X-Forwarded-For entry, not the leftmost", () => {
    const req = fakeReq({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientAddress(req, { trustProxy: true })).toBe("10.0.0.1");
  });

  it("a spoofed leftmost entry does not change the chosen address", () => {
    const a = fakeReq({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    const b = fakeReq({ "x-forwarded-for": "203.0.113.77, 10.0.0.1" });
    expect(clientAddress(a, { trustProxy: true })).toBe(
      clientAddress(b, { trustProxy: true }),
    );
  });

  it("a single-entry XFF uses that entry", () => {
    const req = fakeReq({ "x-forwarded-for": "10.0.0.5" });
    expect(clientAddress(req, { trustProxy: true })).toBe("10.0.0.5");
  });

  it("trims whitespace around the rightmost entry", () => {
    const req = fakeReq({ "x-forwarded-for": "203.0.113.9 ,  10.0.0.9  " });
    expect(clientAddress(req, { trustProxy: true })).toBe("10.0.0.9");
  });

  it("falls back to the socket address when XFF is absent", () => {
    const req = fakeReq({}, "198.51.100.3");
    expect(clientAddress(req, { trustProxy: true })).toBe("198.51.100.3");
  });
});

describe("clientAddress — TRUST_PROXY=1 + CLIENT_IP_HEADER", () => {
  it("prefers the configured single-value provider header", () => {
    const req = fakeReq({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "cf-connecting-ip": "2.2.2.2",
    });
    expect(
      clientAddress(req, { trustProxy: true, clientIpHeader: "cf-connecting-ip" }),
    ).toBe("2.2.2.2");
  });

  it("falls back to the rightmost XFF when the provider header is absent", () => {
    const req = fakeReq({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(
      clientAddress(req, { trustProxy: true, clientIpHeader: "cf-connecting-ip" }),
    ).toBe("10.0.0.1");
  });

  it("the provider header is ignored entirely when TRUST_PROXY is unset", () => {
    const req = fakeReq(
      { "cf-connecting-ip": "2.2.2.2" },
      "198.51.100.8",
    );
    expect(
      clientAddress(req, { trustProxy: false, clientIpHeader: "cf-connecting-ip" }),
    ).toBe("198.51.100.8");
  });
});

describe("clientIpHeaderFromEnv / trustProxyFromEnv", () => {
  it("reads and lower-cases CLIENT_IP_HEADER", () => {
    expect(clientIpHeaderFromEnv({ CLIENT_IP_HEADER: "CF-Connecting-IP" })).toBe(
      "cf-connecting-ip",
    );
    expect(clientIpHeaderFromEnv({})).toBeUndefined();
    expect(clientIpHeaderFromEnv({ CLIENT_IP_HEADER: "  " })).toBeUndefined();
  });

  it("TRUST_PROXY is only true for exactly '1'", () => {
    expect(trustProxyFromEnv({ TRUST_PROXY: "1" })).toBe(true);
    expect(trustProxyFromEnv({ TRUST_PROXY: "true" })).toBe(false);
    expect(trustProxyFromEnv({})).toBe(false);
  });
});

describe("clientAddressDiagnostics", () => {
  it("collects only the forwarding headers, socket, and chosen address", () => {
    const req = fakeReq(
      {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "true-client-ip": "9.9.9.9",
        "cf-connecting-ip": "2.2.2.2",
        "x-real-ip": "3.3.3.3",
        // A header that MUST NOT be logged:
        authorization: "Bearer secret-token",
      },
      "198.51.100.1",
    );
    const diag = clientAddressDiagnostics(req, "10.0.0.1");
    expect(diag).toEqual({
      "x-forwarded-for": "203.0.113.9, 10.0.0.1",
      "true-client-ip": "9.9.9.9",
      "cf-connecting-ip": "2.2.2.2",
      "x-real-ip": "3.3.3.3",
      socket: "198.51.100.1",
      chosen: "10.0.0.1",
    });
    // No other headers leak in.
    expect(JSON.stringify(diag)).not.toContain("secret-token");
    expect(JSON.stringify(diag)).not.toContain("authorization");
  });
});
