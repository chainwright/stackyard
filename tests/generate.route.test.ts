// tests/generate.route.test.ts
// Integration tests for POST /api/generate.
//
// Strategy:
//   - Stub stackGenerator.generate so no real LLM calls are made.
//   - Spin up a real node:http server on an ephemeral port per test file.
//   - Use node:http.request (or fetch) to exercise the full request path.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer } from "../server/index.js";
import type { Server } from "node:http";
import type { GenerateSuccess, GenerateError } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Module mock — replace stackGenerator with a controllable stub

vi.mock("../server/stackGenerator.js", () => {
  return {
    generate: vi.fn(),
  };
});

import * as generator from "../server/stackGenerator.js";
const generateMock = vi.mocked(generator.generate);

// ---------------------------------------------------------------------------
// Helpers

/** A minimal valid Stack that passes validate(). */
function validStack() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Irish Rivers Quiz",
    theme: {
      background: "#ffffff",
      foreground: "#000000",
      font: "sans-serif",
    },
    cards: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "story",
        elements: [
          {
            type: "text",
            id: "33333333-3333-4333-8333-333333333333",
            x: 0,
            y: 0,
            w: 800,
            h: 100,
            content: "Welcome",
          },
          {
            type: "button",
            id: "44444444-4444-4444-8444-444444444444",
            x: 300,
            y: 460,
            w: 200,
            h: 60,
            label: "Start",
            actions: [
              { type: "goto", cardId: "55555555-5555-4555-8555-555555555555" },
            ],
          },
        ],
        actions: [],
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: "66666666-6666-4666-8666-666666666666",
            x: 0,
            y: 0,
            w: 800,
            h: 100,
            content: "Which is the longest river?",
          },
          {
            type: "button",
            id: "77777777-7777-4777-8777-777777777777",
            x: 40,
            y: 200,
            w: 320,
            h: 60,
            label: "Shannon",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
              { type: "goto", cardId: "88888888-8888-4888-8888-888888888888" },
            ],
          },
          {
            type: "button",
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            x: 440,
            y: 200,
            w: 320,
            h: 60,
            label: "Liffey",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
              { type: "goto", cardId: "88888888-8888-4888-8888-888888888888" },
            ],
          },
        ],
        actions: [],
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        kind: "end",
        elements: [
          {
            type: "field",
            id: "99999999-9999-4999-8999-999999999999",
            x: 300,
            y: 250,
            w: 200,
            h: 60,
            variable: "score",
          },
        ],
        actions: [],
      },
    ],
  };
}

/** POST JSON to the server and return { status, body }. */
async function post(
  baseUrl: string,
  path: string,
  body: unknown
): Promise<{ status: number; body: unknown }> {
  const payload = JSON.stringify(body);
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
  });
  const json: unknown = await res.json();
  return { status: res.status, body: json };
}

/** POST asking for NDJSON; return the status, content-type, and parsed lines. */
async function postStream(
  baseUrl: string,
  path: string,
  body: unknown
): Promise<{ status: number; contentType: string; lines: unknown[] }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/x-ndjson",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const lines = text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as unknown);
  return {
    status: res.status,
    contentType: res.headers.get("Content-Type") ?? "",
    lines,
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
  const port =
    typeof addr === "object" && addr !== null ? addr.port : 3099;
  baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  generateMock.mockReset();
});

// ---------------------------------------------------------------------------
// Tests

describe("POST /api/generate — request validation", () => {
  it("returns 400 for an empty prompt", async () => {
    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "",
    });
    expect(status).toBe(400);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it("returns 400 for a whitespace-only prompt", async () => {
    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "   ",
    });
    expect(status).toBe(400);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it("returns 400 for a prompt longer than 500 characters", async () => {
    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "a".repeat(501),
    });
    expect(status).toBe(400);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it("returns 400 for a missing prompt field", async () => {
    const { status, body } = await post(baseUrl, "/api/generate", {});
    expect(status).toBe(400);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it("returns 400 for a non-string prompt", async () => {
    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: 42,
    });
    expect(status).toBe(400);
    expect((body as { ok: boolean }).ok).toBe(false);
  });

  it("400 error messages are plain language (no stack traces)", async () => {
    const { body } = await post(baseUrl, "/api/generate", { prompt: "" });
    const b = body as { ok: boolean; message: string };
    expect(b.message).not.toMatch(/Error:/);
    expect(b.message).not.toMatch(/\bat\b.*:\d+:\d+/); // no stack trace frames
    expect(b.message.trim().length).toBeGreaterThan(0);
  });
});

describe("POST /api/generate — successful generation", () => {
  it("returns 200 with ok, stack, isFallback on success", async () => {
    const successResult: GenerateSuccess = {
      ok: true,
      stack: validStack() as unknown as import("../src/shared/types.js").Stack,
      isFallback: false,
    };
    generateMock.mockResolvedValue(successResult);

    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "a five-card quiz about Irish rivers",
    });

    expect(status).toBe(200);
    const b = body as { ok: boolean; stack: unknown; isFallback: boolean };
    expect(b.ok).toBe(true);
    expect(b.stack).toBeDefined();
    expect(b.isFallback).toBe(false);
  });

  it("response body contains exactly ok, stack, isFallback — no extra fields", async () => {
    const successResult: GenerateSuccess = {
      ok: true,
      stack: validStack() as unknown as import("../src/shared/types.js").Stack,
      isFallback: false,
    };
    generateMock.mockResolvedValue(successResult);

    const { body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about Vikings",
    });

    const keys = Object.keys(body as Record<string, unknown>);
    expect(keys.sort()).toEqual(["isFallback", "ok", "stack"].sort());
  });

  it("returns 200 with isFallback: true for fallback stacks", async () => {
    const fallbackResult: GenerateSuccess = {
      ok: true,
      stack: validStack() as unknown as import("../src/shared/types.js").Stack,
      isFallback: true,
    };
    generateMock.mockResolvedValue(fallbackResult);

    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about the moon",
    });

    expect(status).toBe(200);
    expect((body as { isFallback: boolean }).isFallback).toBe(true);
  });
});

describe("POST /api/generate — generator error", () => {
  it("returns 422 when the generator returns ok: false", async () => {
    const errorResult: GenerateError = {
      ok: false,
      message:
        "We couldn't build your set of cards. Try rephrasing your description and have another go.",
    };
    generateMock.mockResolvedValue(errorResult);

    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about something",
    });

    expect(status).toBe(422);
    const b = body as { ok: boolean; message: string };
    expect(b.ok).toBe(false);
    expect(typeof b.message).toBe("string");
    expect(b.message.trim().length).toBeGreaterThan(0);
  });
});

describe("POST /api/generate — unexpected errors", () => {
  it("returns 500 on an unexpected throw from the generator", async () => {
    generateMock.mockRejectedValue(new Error("Totally unexpected"));

    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about dinosaurs",
    });

    expect(status).toBe(500);
    const b = body as { ok: boolean; message: string };
    expect(b.ok).toBe(false);
    // Must NOT expose internal error
    expect(b.message).not.toContain("Totally unexpected");
  });
});

describe("POST /api/generate — progressive (NDJSON) delivery", () => {
  it("streams start, one card per card, then done when Accept is NDJSON", async () => {
    const stack = validStack();
    generateMock.mockResolvedValue({
      ok: true,
      stack: stack as unknown as import("../src/shared/types.js").Stack,
      isFallback: false,
    });

    const { status, contentType, lines } = await postStream(baseUrl, "/api/generate", {
      prompt: "a quiz about Irish rivers",
    });

    expect(status).toBe(200);
    expect(contentType).toContain("application/x-ndjson");
    expect((lines[0] as { type: string }).type).toBe("start");
    const cardLines = lines.filter((l) => (l as { type: string }).type === "card");
    expect(cardLines.length).toBe(stack.cards.length);
    expect((lines[lines.length - 1] as { type: string }).type).toBe("done");
  });

  it("streams a single error line when the generator returns ok:false", async () => {
    generateMock.mockResolvedValue({
      ok: false,
      message: "We couldn't build your set of cards. Try rephrasing and have another go.",
    });

    const { status, lines } = await postStream(baseUrl, "/api/generate", {
      prompt: "a quiz about nothing",
    });

    expect(status).toBe(200); // HTTP 200; the stream carries the failure
    expect(lines).toHaveLength(1);
    expect((lines[0] as { type: string }).type).toBe("error");
  });

  it("still rejects an empty prompt with 400 even when NDJSON is requested", async () => {
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({ prompt: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("the default (no NDJSON Accept) path still returns a single JSON body", async () => {
    const stack = validStack();
    generateMock.mockResolvedValue({
      ok: true,
      stack: stack as unknown as import("../src/shared/types.js").Stack,
      isFallback: false,
    });
    const { status, body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about Irish rivers",
    });
    expect(status).toBe(200);
    expect((body as { ok: boolean }).ok).toBe(true);
    expect((body as { stack: unknown }).stack).toBeDefined();
  });
});

describe("POST /api/generate — security", () => {
  it("response body never contains an API key", async () => {
    const FAKE_KEY = "sk-route-test-secret-99999";
    process.env["STACKYARD_LLM_API_KEY"] = FAKE_KEY;

    const successResult: GenerateSuccess = {
      ok: true,
      stack: validStack() as unknown as import("../src/shared/types.js").Stack,
      isFallback: false,
    };
    generateMock.mockResolvedValue(successResult);

    const { body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about the solar system",
    });

    expect(JSON.stringify(body)).not.toContain(FAKE_KEY);
    delete process.env["STACKYARD_LLM_API_KEY"];
  });

  it("500 error message is plain language (no raw error text)", async () => {
    generateMock.mockRejectedValue(new Error("secret internal error xyz123"));

    const { body } = await post(baseUrl, "/api/generate", {
      prompt: "a quiz about plants",
    });

    const b = body as { message: string };
    expect(b.message).not.toContain("xyz123");
    expect(b.message).not.toMatch(/Error:/);
  });
});
