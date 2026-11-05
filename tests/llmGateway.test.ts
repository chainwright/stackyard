// tests/llmGateway.test.ts
// Unit tests for server/llmGateway.ts using a fetch stub.
// The real fetch is replaced with vi.stubGlobal so no network calls are made.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  call,
  callStream,
  ConfigurationError,
  LlmUnavailableError,
  LlmMalformedError,
} from "../server/llmGateway.js";

// ---------------------------------------------------------------------------
// Helpers

const FAKE_API_KEY = "sk-test-1234567890abcdef";

/** Build a minimal OpenAI-compatible success response body. */
function makeSuccessBody(content: string): string {
  return JSON.stringify({
    choices: [{ message: { content } }],
  });
}

/** Stub the global fetch with a Response-like object. */
function stubFetch(status: number, body: string, ok?: boolean): void {
  const resolvedOk = ok ?? (status >= 200 && status < 300);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: resolvedOk,
      status,
      json: () => Promise.resolve(JSON.parse(body) as unknown),
    })
  );
}

/** Stub fetch to reject (network failure). */
function stubFetchNetworkError(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("fetch failed"))
  );
}

const MESSAGES = { system: "You are a helper.", user: "Say hello." };

// ---------------------------------------------------------------------------
// Setup / teardown

beforeEach(() => {
  // Set required env var before each test
  process.env["STACKYARD_LLM_API_KEY"] = FAKE_API_KEY;
  // Optional env vars — clear them so tests start from a known baseline
  delete process.env["STACKYARD_LLM_BASE_URL"];
  delete process.env["STACKYARD_LLM_MODEL"];
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env["STACKYARD_LLM_API_KEY"];
});

// ---------------------------------------------------------------------------
// Success path

describe("llmGateway.call — success", () => {
  it("returns the content string from the first choice", async () => {
    const expected = '{"title":"test"}';
    stubFetch(200, makeSuccessBody(expected));

    const result = await call(MESSAGES);
    expect(result).toBe(expected);
  });

  it("passes temperature option to the request body", async () => {
    stubFetch(200, makeSuccessBody("{}"));

    await call(MESSAGES, { temperature: 0.2 });

    const fetchMock = vi.mocked(fetch);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    const bodyArg = callArgs?.[1]?.body;
    expect(typeof bodyArg).toBe("string");
    const parsed = JSON.parse(bodyArg as string) as { temperature: number };
    expect(parsed.temperature).toBe(0.2);
  });

  it("uses default temperature 0.7 when not specified", async () => {
    stubFetch(200, makeSuccessBody("{}"));

    await call(MESSAGES);

    const fetchMock = vi.mocked(fetch);
    const bodyArg = fetchMock.mock.calls[0]?.[1]?.body;
    const parsed = JSON.parse(bodyArg as string) as { temperature: number };
    expect(parsed.temperature).toBe(0.7);
  });

  it("sends response_format json_object in request body", async () => {
    stubFetch(200, makeSuccessBody("{}"));

    await call(MESSAGES);

    const fetchMock = vi.mocked(fetch);
    const bodyArg = fetchMock.mock.calls[0]?.[1]?.body;
    const parsed = JSON.parse(bodyArg as string) as {
      response_format: { type: string };
    };
    expect(parsed.response_format.type).toBe("json_object");
  });

  it("uses STACKYARD_LLM_BASE_URL when set", async () => {
    process.env["STACKYARD_LLM_BASE_URL"] = "https://my-proxy.example.com/v1";
    stubFetch(200, makeSuccessBody("{}"));

    await call(MESSAGES);

    const fetchMock = vi.mocked(fetch);
    const url = fetchMock.mock.calls[0]?.[0];
    expect(url).toContain("my-proxy.example.com");
  });

  it("uses STACKYARD_LLM_MODEL when set", async () => {
    process.env["STACKYARD_LLM_MODEL"] = "my-custom-model";
    stubFetch(200, makeSuccessBody("{}"));

    await call(MESSAGES);

    const fetchMock = vi.mocked(fetch);
    const bodyArg = fetchMock.mock.calls[0]?.[1]?.body;
    const parsed = JSON.parse(bodyArg as string) as { model: string };
    expect(parsed.model).toBe("my-custom-model");
  });
});

// ---------------------------------------------------------------------------
// Error paths

describe("llmGateway.call — missing API key", () => {
  it("throws ConfigurationError when key is absent", async () => {
    delete process.env["STACKYARD_LLM_API_KEY"];
    await expect(call(MESSAGES)).rejects.toThrow(ConfigurationError);
  });

  it("throws ConfigurationError when key is empty string", async () => {
    process.env["STACKYARD_LLM_API_KEY"] = "";
    await expect(call(MESSAGES)).rejects.toThrow(ConfigurationError);
  });

  it("throws ConfigurationError when key is whitespace only", async () => {
    process.env["STACKYARD_LLM_API_KEY"] = "   ";
    await expect(call(MESSAGES)).rejects.toThrow(ConfigurationError);
  });
});

describe("llmGateway.call — non-2xx response", () => {
  it("throws LlmUnavailableError on HTTP 500", async () => {
    stubFetch(500, JSON.stringify({ error: "internal" }), false);
    await expect(call(MESSAGES)).rejects.toThrow(LlmUnavailableError);
  });

  it("throws LlmUnavailableError on HTTP 429 (rate limit)", async () => {
    stubFetch(429, JSON.stringify({ error: "rate limited" }), false);
    await expect(call(MESSAGES)).rejects.toThrow(LlmUnavailableError);
  });

  it("throws LlmUnavailableError on HTTP 401 (bad key)", async () => {
    stubFetch(401, JSON.stringify({ error: "unauthorised" }), false);
    await expect(call(MESSAGES)).rejects.toThrow(LlmUnavailableError);
  });

  it("error message contains the HTTP status code but NOT the API key", async () => {
    stubFetch(500, JSON.stringify({ error: "oops" }), false);
    const err = await call(MESSAGES).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    const msg = (err as LlmUnavailableError).message;
    expect(msg).toContain("500");
    expect(msg).not.toContain(FAKE_API_KEY);
  });
});

describe("llmGateway.call — network failure", () => {
  it("throws LlmUnavailableError when fetch rejects", async () => {
    stubFetchNetworkError();
    await expect(call(MESSAGES)).rejects.toThrow(LlmUnavailableError);
  });

  it("error message does not contain the API key", async () => {
    stubFetchNetworkError();
    const err = await call(MESSAGES).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    const msg = (err as LlmUnavailableError).message;
    expect(msg).not.toContain(FAKE_API_KEY);
  });
});

describe("llmGateway.call — malformed response", () => {
  it("throws LlmMalformedError when response body cannot be parsed as JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError("bad json")),
      })
    );
    await expect(call(MESSAGES)).rejects.toThrow(LlmMalformedError);
  });

  it("throws LlmMalformedError when choices array is missing", async () => {
    stubFetch(200, JSON.stringify({ result: "no choices here" }));
    await expect(call(MESSAGES)).rejects.toThrow(LlmMalformedError);
  });

  it("throws LlmMalformedError when choices is empty", async () => {
    stubFetch(200, JSON.stringify({ choices: [] }));
    await expect(call(MESSAGES)).rejects.toThrow(LlmMalformedError);
  });

  it("throws LlmMalformedError when content is null", async () => {
    stubFetch(
      200,
      JSON.stringify({ choices: [{ message: { content: null } }] })
    );
    await expect(call(MESSAGES)).rejects.toThrow(LlmMalformedError);
  });
});

// ---------------------------------------------------------------------------
// API key never leaks

describe("llmGateway.call — API key never in output", () => {
  it("API key does not appear in the returned content string", async () => {
    // Even if the LLM echoes it back, we only forward its content — this test
    // checks that we don't accidentally inject the key ourselves.
    const content = '{"title":"safe"}';
    stubFetch(200, makeSuccessBody(content));

    const result = await call(MESSAGES);
    expect(result).not.toContain(FAKE_API_KEY);
  });

  it("API key does not appear in LlmUnavailableError message (500)", async () => {
    stubFetch(500, JSON.stringify({ error: FAKE_API_KEY }), false);
    const err = await call(MESSAGES).catch((e: unknown) => e);
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
  });

  it("API key does not appear in LlmUnavailableError message (network)", async () => {
    stubFetchNetworkError();
    const err = await call(MESSAGES).catch((e: unknown) => e);
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
  });
});

// ---------------------------------------------------------------------------
// Streaming path (callStream)

/** Build a ReadableStream of UTF-8 bytes from a list of string chunks. */
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(enc.encode(chunks[i]!));
        i++;
      } else {
        controller.close();
      }
    },
  });
}

/** Stub fetch to return a streaming SSE response made of `chunks`. */
function stubFetchStream(chunks: string[], status = 200, ok = true): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      status,
      body: streamFromChunks(chunks),
    }),
  );
}

/** Format one OpenAI-style SSE data line for a content delta. */
function sse(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n`;
}

/** Drain an async generator of string deltas into one string. */
async function drain(gen: AsyncGenerator<string>): Promise<string> {
  let out = "";
  for await (const d of gen) out += d;
  return out;
}

describe("llmGateway.callStream — success", () => {
  it("yields content deltas in order and concatenates to the full text", async () => {
    stubFetchStream([sse("Hel"), sse("lo"), sse(" world"), "data: [DONE]\n"]);
    const out = await drain(callStream(MESSAGES));
    expect(out).toBe("Hello world");
  });

  it("reassembles SSE lines split across chunk boundaries", async () => {
    // One SSE data line delivered in three byte-chunks.
    const line = sse("spanned");
    const mid = Math.floor(line.length / 2);
    stubFetchStream([line.slice(0, 4), line.slice(4, mid), line.slice(mid)]);
    const out = await drain(callStream(MESSAGES));
    expect(out).toBe("spanned");
  });

  it("sends stream:true and no response_format in the request body", async () => {
    stubFetchStream([sse("x"), "data: [DONE]\n"]);
    await drain(callStream(MESSAGES, { temperature: 0.2 }));

    const bodyArg = vi.mocked(fetch).mock.calls[0]?.[1]?.body;
    const parsed = JSON.parse(bodyArg as string) as {
      stream?: boolean;
      temperature: number;
      response_format?: unknown;
    };
    expect(parsed.stream).toBe(true);
    expect(parsed.temperature).toBe(0.2);
    expect(parsed.response_format).toBeUndefined();
  });

  it("stops at the [DONE] sentinel and ignores anything after it", async () => {
    stubFetchStream([sse("a"), "data: [DONE]\n", sse("should-not-appear")]);
    const out = await drain(callStream(MESSAGES));
    expect(out).toBe("a");
  });
});

describe("llmGateway.callStream — errors (never leak the key)", () => {
  it("throws ConfigurationError when the key is missing", async () => {
    delete process.env["STACKYARD_LLM_API_KEY"];
    await expect(drain(callStream(MESSAGES))).rejects.toThrow(ConfigurationError);
  });

  it("throws LlmUnavailableError on a non-2xx status", async () => {
    stubFetchStream([], 500, false);
    const err = await drain(callStream(MESSAGES)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).toContain("500");
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
  });

  it("throws LlmUnavailableError when fetch rejects (network failure)", async () => {
    stubFetchNetworkError();
    const err = await drain(callStream(MESSAGES)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
  });

  it("throws LlmUnavailableError when the stream dies partway through", async () => {
    // A body whose reader rejects mid-stream.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(sse("partial")));
          },
          pull() {
            throw new Error("socket reset");
          },
        }),
      }),
    );
    const gen = callStream(MESSAGES);
    // The first delta arrives, then the next read throws.
    const first = await gen.next();
    expect(first.value).toBe("partial");
    await expect(gen.next()).rejects.toThrow(LlmUnavailableError);
  });
});
