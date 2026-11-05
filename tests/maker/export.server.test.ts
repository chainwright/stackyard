// tests/maker/export.server.test.ts
// Integration test for POST /api/export via the real createServer() (TASK-02).
//
// Boots the server on an ephemeral port and exercises the full request path.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "../../server/index.js";
import type { Server } from "node:http";
import type { Stack } from "../../src/shared/types.js";

// ---------------------------------------------------------------------------
// Fixtures

function validStack(): Stack {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Irish Rivers",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: "40000000-0000-4000-8000-000000000004",
            x: 0, y: 0, w: 800, h: 100,
            content: "Which is the longest river?",
          },
          {
            type: "button",
            id: "50000000-0000-4000-8000-000000000005",
            x: 40, y: 200, w: 320, h: 60,
            label: "Shannon",
            actions: [
              { type: "score", delta: 1 },
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
          {
            type: "button",
            id: "60000000-0000-4000-8000-000000000006",
            x: 440, y: 200, w: 320, h: 60,
            label: "Liffey",
            actions: [
              { type: "score", delta: 0 },
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
        ],
        actions: [],
      },
      {
        id: "30000000-0000-4000-8000-000000000003",
        kind: "end",
        elements: [
          {
            type: "field",
            id: "70000000-0000-4000-8000-000000000007",
            x: 300, y: 250, w: 200, h: 60,
            variable: "score",
          },
        ],
        actions: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Server lifecycle

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = createServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 3099;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

// ---------------------------------------------------------------------------
// Tests

describe("POST /api/export (integration)", () => {
  it("returns 200 text/html with a doctype body for a valid stack", async () => {
    const res = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stack: validStack() }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const text = await res.text();
    expect(text.startsWith("<!doctype html>")).toBe(true);
    expect(res.headers.get("content-disposition")).toContain("Irish-Rivers.html");
  });

  it("returns 422 JSON with a plain message for an invalid stack", async () => {
    const stack = validStack();
    stack.cards[1]!.kind = "story"; // no end card → invalid
    const res = await fetch(`${baseUrl}/api/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stack }),
    });
    expect(res.status).toBe(422);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { ok: boolean; message: string };
    expect(body.ok).toBe(false);
    expect(body.message.trim().length).toBeGreaterThan(0);
  });

  it("returns 405 for a GET on /api/export", async () => {
    const res = await fetch(`${baseUrl}/api/export`, { method: "GET" });
    expect(res.status).toBe(405);
  });
});
