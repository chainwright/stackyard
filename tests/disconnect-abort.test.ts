// tests/disconnect-abort.test.ts
// TASK-22 b/n (J4 M1/M3): closing the connection mid-stream must abort the
// upstream model call. The route listens on `res` close (not `req`, which fires
// as soon as the body is read). This drives a REAL server over HTTP with a mock
// upstream callStream that trickles output, destroys the client mid-stream, and
// asserts the upstream's AbortSignal fired.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A controllable upstream: callStream yields one chunk, then waits forever
// until its signal aborts. We record whether the signal aborted.
const upstream = {
  sawSignal: undefined as AbortSignal | undefined,
  aborted: false,
};

vi.mock("../server/llmGateway.js", async () => {
  const actual = await vi.importActual<typeof import("../server/llmGateway.js")>(
    "../server/llmGateway.js",
  );
  return {
    ...actual,
    callStream: vi.fn(async function* (_messages: unknown, options?: { signal?: AbortSignal }) {
      upstream.sawSignal = options?.signal;
      // Emit the stack header + one card so the client starts receiving, then
      // wait until the signal aborts (a hung/slow model).
      yield '{"kind":"stack","id":"11111111-1111-4111-8111-111111111111","title":"T","theme":{"background":"#fff","foreground":"#000","font":"sans-serif"}}\n';
      await new Promise<void>((resolve) => {
        const sig = options?.signal;
        if (sig) {
          if (sig.aborted) { upstream.aborted = true; resolve(); return; }
          sig.addEventListener("abort", () => { upstream.aborted = true; resolve(); });
        }
        // Safety timeout so a failing test can't hang the suite.
        setTimeout(resolve, 3000);
      });
    }),
  };
});

import { createServer } from "../server/index.js";
import http from "node:http";
import type { Server } from "node:http";

let server: Server;
let port: number;

beforeEach(async () => {
  upstream.sawSignal = undefined;
  upstream.aborted = false;
  server = createServer({ generateRatePer10Min: 100_000, generateDailyCap: 1_000_000 });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  port = typeof addr === "object" && addr !== null ? addr.port : 0;
});

afterEach(() => {
  server.close();
});

describe("client disconnect aborts the upstream model call (TASK-22 b)", () => {
  it("destroying the request mid-stream aborts the upstream callStream signal", async () => {
    await new Promise<void>((resolve, reject) => {
      const reqNode = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/generate",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
        },
        (res) => {
          // Once the first bytes arrive, the upstream is mid-stream — destroy
          // the client connection to simulate the teacher closing the tab.
          res.once("data", () => {
            reqNode.destroy();
            // Give the server a tick to see the socket close and abort.
            setTimeout(resolve, 150);
          });
          res.on("error", () => {});
        },
      );
      reqNode.on("error", () => {
        // A destroyed request surfaces an error on the client side — expected.
      });
      reqNode.write(JSON.stringify({ prompt: "a quiz about the water cycle" }));
      reqNode.end();
      setTimeout(() => reject(new Error("timed out")), 4000);
    });

    expect(upstream.sawSignal, "callStream should receive a signal").toBeDefined();
    expect(upstream.aborted, "the upstream signal should abort on disconnect").toBe(true);
  });
});
