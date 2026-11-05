// tests/maker/export.route.test.ts
// Unit tests for the POST /api/export handler (TASK-01).
//
// Strategy: call handleExport directly with mock IncomingMessage /
// ServerResponse objects. The real exporter is used for the success and
// validation paths (it reads the pre-built player IIFE from disk, which the
// test runner builds first via `npm run build:player`).

import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { handleExport } from "../../server/routes/export.js";
import type { Stack } from "../../src/shared/types.js";

// ---------------------------------------------------------------------------
// Mock request / response

function mockReq(method: string, body: string): IncomingMessage {
  const stream = Readable.from([Buffer.from(body, "utf-8")]) as unknown as IncomingMessage;
  stream.method = method;
  stream.url = "/api/export";
  return stream;
}

interface CapturedResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function mockRes(): { res: ServerResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { status: 0, headers: {}, body: "" };
  const res = {
    headersSent: false,
    writeHead(status: number, headers?: Record<string, string>) {
      captured.status = status;
      if (headers) {
        for (const [k, v] of Object.entries(headers)) {
          captured.headers[k.toLowerCase()] = String(v);
        }
      }
      (this as { headersSent: boolean }).headersSent = true;
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) {
        captured.body += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      }
      return this;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

// ---------------------------------------------------------------------------
// Fixtures — a minimal valid stack (all IDs valid UUID v4).

function validStack(): Stack {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Vikings Quiz",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: "40000000-0000-4000-8000-000000000004",
            x: 40, y: 40, w: 720, h: 120,
            content: "Where did the Vikings build a town in 841?",
          },
          {
            type: "button",
            id: "50000000-0000-4000-8000-000000000005",
            x: 40, y: 200, w: 340, h: 80,
            label: "Dublin",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
          {
            type: "button",
            id: "60000000-0000-4000-8000-000000000006",
            x: 420, y: 200, w: 340, h: 80,
            label: "Cork",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
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
            x: 40, y: 40, w: 720, h: 80,
            variable: "score",
          },
        ],
        actions: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests

describe("handleExport — method and body validation", () => {
  it("returns 405 for a non-POST request", async () => {
    const { res, captured } = mockRes();
    await handleExport(mockReq("GET", ""), res);
    expect(captured.status).toBe(405);
    const b = JSON.parse(captured.body) as { ok: boolean };
    expect(b.ok).toBe(false);
  });

  it("returns 400 JSON for an unparseable body", async () => {
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", "not json {{"), res);
    expect(captured.status).toBe(400);
    expect(captured.headers["content-type"]).toContain("application/json");
    const b = JSON.parse(captured.body) as { ok: boolean };
    expect(b.ok).toBe(false);
  });

  it("returns 400 JSON when the body has no object stack", async () => {
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", JSON.stringify({ notStack: 1 })), res);
    expect(captured.status).toBe(400);
    const b = JSON.parse(captured.body) as { ok: boolean; message: string };
    expect(b.ok).toBe(false);
    expect(b.message.trim().length).toBeGreaterThan(0);
  });
});

describe("handleExport — validation failure", () => {
  it("returns 422 JSON with a plain message and no HTML for an invalid stack", async () => {
    const stack = validStack();
    // Turn the only end card into a story card → zero end cards (invalid).
    stack.cards[1]!.kind = "story";

    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", JSON.stringify({ stack })), res);

    expect(captured.status).toBe(422);
    expect(captured.headers["content-type"]).toContain("application/json");
    const b = JSON.parse(captured.body) as { ok: boolean; message: string };
    expect(b.ok).toBe(false);
    // Plain language — no raw code, no "<!doctype", no "stack" wording.
    expect(b.message).not.toContain("<!doctype");
    expect(b.message).not.toContain("end-card-count");
    expect(b.message.toLowerCase()).not.toContain("stack");
    expect(b.message.trim().length).toBeGreaterThan(0);
  });
});

describe("handleExport — success", () => {
  it("returns 200 text/html with a doctype body and a safe filename", async () => {
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", JSON.stringify({ stack: validStack() })), res);

    expect(captured.status).toBe(200);
    expect(captured.headers["content-type"]).toContain("text/html");
    expect(captured.body.startsWith("<!doctype html>")).toBe(true);

    const disposition = captured.headers["content-disposition"] ?? "";
    expect(disposition).toContain("attachment");
    const match = disposition.match(/filename="([^"]+)"/);
    expect(match).not.toBeNull();
    const filename = match![1]!;
    expect(filename.endsWith(".html")).toBe(true);
    // "Vikings Quiz" → "Vikings-Quiz.html"
    expect(filename).toBe("Vikings-Quiz.html");
    // Only safe characters before the .html suffix.
    expect(filename.replace(/\.html$/, "")).toMatch(/^[A-Za-z0-9-]+$/);
  });
});

describe("handleExport — security", () => {
  it("never places the LLM API key in any response body", async () => {
    const SENTINEL = "sk-export-route-secret-42";
    const previous = process.env["STACKYARD_LLM_API_KEY"];
    process.env["STACKYARD_LLM_API_KEY"] = SENTINEL;
    try {
      const { res, captured } = mockRes();
      await handleExport(mockReq("POST", JSON.stringify({ stack: validStack() })), res);
      expect(captured.body).not.toContain(SENTINEL);
    } finally {
      if (previous === undefined) delete process.env["STACKYARD_LLM_API_KEY"];
      else process.env["STACKYARD_LLM_API_KEY"] = previous;
    }
  });
});
