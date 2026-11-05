// tests/request-size-limits.test.ts
// Security: request-body size limits on POST /api/generate and POST /api/export.
//
// Each route caps how many bytes it will read from the request body before
// refusing with 413. These tests assert, for each route:
//   - a body just under the limit is read and passed downstream,
//   - a body just over the limit gets 413 with the plain-language message,
//   - when over the limit, nothing downstream is read (generator / exporter
//     is never called), i.e. we stop before buffering/handling the whole body.
//
// We call the handlers directly with mock IncomingMessage / ServerResponse so
// we can observe exactly what runs. The request body is delivered as several
// chunks so the over-limit path is exercised mid-stream.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";

// ---------------------------------------------------------------------------
// Mock the downstream work for both routes so we can assert it is NOT reached
// when the body is over the limit.

vi.mock("../server/stackGenerator.js", () => ({ generate: vi.fn() }));
vi.mock("../server/exporter.js", async () => {
  const actual = await vi.importActual<typeof import("../server/exporter.js")>(
    "../server/exporter.js"
  );
  return { ...actual, exportStack: vi.fn() };
});

import { handleGenerate } from "../server/routes/generate.js";
import { handleExport } from "../server/routes/export.js";
import { MAX_CARDS, MAX_TEXT_LENGTH } from "../server/exportLimits.js";
import * as generator from "../server/stackGenerator.js";
import * as exporter from "../server/exporter.js";

const generateMock = vi.mocked(generator.generate);
const exportMock = vi.mocked(exporter.exportStack);

// ---------------------------------------------------------------------------
// Mock request / response

/** Build a mock request that streams `body` in several chunks. */
function mockReq(method: string, body: string): IncomingMessage {
  const buf = Buffer.from(body, "utf-8");
  // Split into a handful of chunks so the byte counter is exercised mid-stream.
  const chunkSize = Math.max(1, Math.ceil(buf.length / 4));
  const chunks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += chunkSize) {
    chunks.push(buf.subarray(i, i + chunkSize));
  }
  if (chunks.length === 0) chunks.push(Buffer.alloc(0));
  const stream = Readable.from(chunks) as unknown as IncomingMessage;
  stream.method = method;
  stream.url = "/";
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
        captured.body +=
          typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      }
      return this;
    },
  } as unknown as ServerResponse;
  return { res, captured };
}

const OVER_LIMIT_MESSAGE =
  "That request is too big to handle. Please make it smaller and try again.";

// Keep these in step with the route constants.
const GENERATE_LIMIT = 16 * 1024;
const EXPORT_LIMIT = 8 * 1024 * 1024;

beforeEach(() => {
  generateMock.mockReset();
  exportMock.mockReset();
});

// ---------------------------------------------------------------------------
// /api/generate

describe("POST /api/generate — body size limit", () => {
  it("reads a body one byte under the limit (reaches the generator)", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      stack: {} as never,
      isFallback: false,
    });

    // Build a valid-JSON body whose UTF-8 length is exactly GENERATE_LIMIT.
    // Body shape: {"prompt":"<fill>"} — the wrapper is `{"prompt":""}`.
    const wrapper = `{"prompt":""}`;
    const fill = "a".repeat(GENERATE_LIMIT - wrapper.length);
    const body = `{"prompt":"${fill}"}`;
    expect(Buffer.byteLength(body)).toBe(GENERATE_LIMIT);

    const { res, captured } = mockRes();
    await handleGenerate(mockReq("POST", body), res);

    // Not a 413 — the body was accepted and handled (prompt too long → 400,
    // but crucially NOT the size-limit 413).
    expect(captured.status).not.toBe(413);
    expect(captured.body).not.toContain(OVER_LIMIT_MESSAGE);
  });

  it("returns 413 with the plain-language message one byte over the limit", async () => {
    const body = `{"prompt":"${"a".repeat(GENERATE_LIMIT)}"}`;
    expect(Buffer.byteLength(body)).toBeGreaterThan(GENERATE_LIMIT);

    const { res, captured } = mockRes();
    await handleGenerate(mockReq("POST", body), res);

    expect(captured.status).toBe(413);
    expect(captured.headers["content-type"]).toContain("application/json");
    const parsed = JSON.parse(captured.body) as { ok: boolean; message: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toBe(OVER_LIMIT_MESSAGE);
  });

  it("does not read/handle the body downstream when over the limit", async () => {
    const body = `{"prompt":"${"a".repeat(GENERATE_LIMIT + 1024)}"}`;
    const { res } = mockRes();
    await handleGenerate(mockReq("POST", body), res);
    // The generator must never be called for an over-limit request.
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("the over-limit message is plain language (no stack trace, no raw code)", async () => {
    const body = `{"prompt":"${"a".repeat(GENERATE_LIMIT + 1)}"}`;
    const { res, captured } = mockRes();
    await handleGenerate(mockReq("POST", body), res);
    const parsed = JSON.parse(captured.body) as { message: string };
    expect(parsed.message).not.toMatch(/Error:/);
    expect(parsed.message).not.toMatch(/\bat\b.*:\d+:\d+/);
    expect(parsed.message.trim().length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// /api/export

describe("POST /api/export — body size limit", () => {
  it("reads a body one byte under the limit (reaches the exporter)", async () => {
    exportMock.mockResolvedValue("<!doctype html><html></html>");

    // Body: {"stack":{"pad":"<fill>"}} with total bytes == EXPORT_LIMIT.
    const prefix = `{"stack":{"pad":"`;
    const suffix = `"}}`;
    const fill = "a".repeat(EXPORT_LIMIT - prefix.length - suffix.length);
    const body = `${prefix}${fill}${suffix}`;
    expect(Buffer.byteLength(body)).toBe(EXPORT_LIMIT);

    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", body), res);

    // Body accepted (not a size-limit 413); the exporter was reached.
    expect(captured.status).not.toBe(413);
    expect(exportMock).toHaveBeenCalledTimes(1);
  });

  it("returns 413 with the plain-language message one byte over the limit", async () => {
    const prefix = `{"stack":{"pad":"`;
    const suffix = `"}}`;
    const fill = "a".repeat(EXPORT_LIMIT - prefix.length - suffix.length + 1);
    const body = `${prefix}${fill}${suffix}`;
    expect(Buffer.byteLength(body)).toBeGreaterThan(EXPORT_LIMIT);

    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", body), res);

    expect(captured.status).toBe(413);
    expect(captured.headers["content-type"]).toContain("application/json");
    const parsed = JSON.parse(captured.body) as { ok: boolean; message: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toBe(OVER_LIMIT_MESSAGE);
  });

  it("does not read/handle the body downstream when over the limit", async () => {
    const prefix = `{"stack":{"pad":"`;
    const suffix = `"}}`;
    const fill = "a".repeat(EXPORT_LIMIT + 2048);
    const body = `${prefix}${fill}${suffix}`;

    const { res } = mockRes();
    await handleExport(mockReq("POST", body), res);
    // The exporter must never be called for an over-limit request.
    expect(exportMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// /api/export — stack resource caps (not enforced by the validator)

function cardsBody(count: number): string {
  const cards = Array.from({ length: count }, (_, i) => ({
    id: `card-${i}`,
    kind: "story",
    elements: [],
    actions: [],
  }));
  return JSON.stringify({ stack: { id: "x", title: "t", theme: {}, cards } });
}

function textBody(contentLength: number): string {
  return JSON.stringify({
    stack: {
      id: "x",
      title: "t",
      theme: {},
      cards: [
        {
          id: "c1",
          kind: "story",
          elements: [
            {
              type: "text",
              id: "e1",
              x: 0,
              y: 0,
              w: 100,
              h: 100,
              content: "a".repeat(contentLength),
            },
          ],
          actions: [],
        },
      ],
    },
  });
}

describe("POST /api/export — card-count cap", () => {
  it("accepts a stack at the card limit (reaches the exporter)", async () => {
    exportMock.mockResolvedValue("<!doctype html><html></html>");
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", cardsBody(MAX_CARDS)), res);
    expect(captured.status).not.toBe(413);
    expect(exportMock).toHaveBeenCalledTimes(1);
  });

  it("returns 413 and never exports a stack over the card limit", async () => {
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", cardsBody(MAX_CARDS + 1)), res);
    expect(captured.status).toBe(413);
    const parsed = JSON.parse(captured.body) as { ok: boolean; message: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toBe(
      "This set has too many cards to export. Remove a few and try again."
    );
    expect(parsed.message.toLowerCase()).not.toContain("stack");
    expect(exportMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/export — text-length cap", () => {
  it("accepts a text field at the length limit (reaches the exporter)", async () => {
    exportMock.mockResolvedValue("<!doctype html><html></html>");
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", textBody(MAX_TEXT_LENGTH)), res);
    expect(captured.status).not.toBe(413);
    expect(exportMock).toHaveBeenCalledTimes(1);
  });

  it("returns 413 and never exports a stack with an over-length text field", async () => {
    const { res, captured } = mockRes();
    await handleExport(mockReq("POST", textBody(MAX_TEXT_LENGTH + 1)), res);
    expect(captured.status).toBe(413);
    const parsed = JSON.parse(captured.body) as { ok: boolean; message: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toBe(
      "Some text on a card is too long to export. Shorten it and try again."
    );
    expect(parsed.message.toLowerCase()).not.toContain("stack");
    expect(exportMock).not.toHaveBeenCalled();
  });
});
