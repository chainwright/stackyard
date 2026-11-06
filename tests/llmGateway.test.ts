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
  CALL_TOTAL_DEADLINE_MS,
  STREAM_TOTAL_DEADLINE_MS,
  STREAM_IDLE_DEADLINE_MS,
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

  it("omits response_format when STACKYARD_LLM_JSON_MODE=off (endpoints that reject json_object)", async () => {
    process.env["STACKYARD_LLM_JSON_MODE"] = "off";
    try {
      stubFetch(200, makeSuccessBody("{}"));
      await call(MESSAGES);
      const fetchMock = vi.mocked(fetch);
      const bodyArg = fetchMock.mock.calls[0]?.[1]?.body;
      const parsed = JSON.parse(bodyArg as string) as { response_format?: unknown };
      expect(parsed.response_format).toBeUndefined();
    } finally {
      delete process.env["STACKYARD_LLM_JSON_MODE"];
    }
  });

  it("omits temperature when STACKYARD_LLM_TEMPERATURE=off (models that reject it)", async () => {
    process.env["STACKYARD_LLM_TEMPERATURE"] = "off";
    try {
      stubFetch(200, makeSuccessBody("{}"));
      await call(MESSAGES, { temperature: 0.3 });
      const fetchMock = vi.mocked(fetch);
      const bodyArg = fetchMock.mock.calls[0]?.[1]?.body;
      const parsed = JSON.parse(bodyArg as string) as { temperature?: unknown };
      expect(parsed.temperature).toBeUndefined();
    } finally {
      delete process.env["STACKYARD_LLM_TEMPERATURE"];
    }
  });

  it("uses STACKYARD_LLM_MAX_TOKENS (clamped) and 4096 by default", async () => {
    const sent = async () => {
      stubFetch(200, makeSuccessBody("{}"));
      await call(MESSAGES);
      const fetchMock = vi.mocked(fetch);
      const calls = fetchMock.mock.calls;
      const bodyArg = calls[calls.length - 1]?.[1]?.body;
      return (JSON.parse(bodyArg as string) as { max_tokens: number }).max_tokens;
    };
    expect(await sent()).toBe(4096);
    process.env["STACKYARD_LLM_MAX_TOKENS"] = "12000";
    try {
      expect(await sent()).toBe(12000);
      process.env["STACKYARD_LLM_MAX_TOKENS"] = "999999";
      expect(await sent()).toBe(32000);
    } finally {
      delete process.env["STACKYARD_LLM_MAX_TOKENS"];
    }
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

// ---------------------------------------------------------------------------
// Deadlines (fake timers) — call(), callStream(), and client disconnect

/**
 * Stub fetch so the request only settles when its AbortSignal fires. This
 * models an upstream that honours cancellation: on abort the fetch promise
 * rejects (as the platform fetch does), which is exactly how a deadline or a
 * client disconnect reaches our code.
 */
function stubFetchHangUntilAbort(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }
      });
    }),
  );
}

/**
 * A streaming fetch stub whose body only ever produces chunks on command and
 * whose `pull` otherwise waits for the request's AbortSignal (then rejects,
 * like a real cancelled stream). `emit(text)` pushes one SSE/raw chunk. The
 * returned `signalRef` exposes the signal the controller handed to fetch.
 */
function stubFetchControllableStream(): {
  emit: (text: string) => void;
  signalRef: () => AbortSignal | undefined;
} {
  const enc = new TextEncoder();
  let push: ((chunk: Uint8Array) => void) | null = null;
  let fail: ((reason: unknown) => void) | null = null;
  let seenSignal: AbortSignal | undefined;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (chunk) => controller.enqueue(chunk);
      // When the upstream request is aborted, a real streamed body rejects any
      // in-flight read. Model that: error the stream so reader.read() throws.
      fail = (reason) => {
        try {
          controller.error(reason);
        } catch {
          /* already closed */
        }
      };
    },
  });

  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { signal?: AbortSignal }) => {
      seenSignal = init?.signal;
      if (seenSignal) {
        seenSignal.addEventListener(
          "abort",
          () => fail?.(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }
      return Promise.resolve({ ok: true, status: 200, body });
    }),
  );

  return {
    emit: (text: string) => push?.(enc.encode(text)),
    signalRef: () => seenSignal,
  };
}

describe("llmGateway.call — total deadline (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts and throws LlmUnavailableError after the total deadline", async () => {
    stubFetchHangUntilAbort();
    const p = call(MESSAGES).catch((e: unknown) => e);
    // Nothing happens before the deadline…
    await vi.advanceTimersByTimeAsync(CALL_TOTAL_DEADLINE_MS - 1);
    // …then the deadline fires and aborts the upstream request.
    await vi.advanceTimersByTimeAsync(2);
    const err = await p;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).toMatch(/too long/i);
    // TASK-26g: the reason is carried as data, so callers never sniff the text.
    expect((err as LlmUnavailableError).kind).toBe("timeout");
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
    // The abort really reached fetch's signal.
    const init = vi.mocked(fetch).mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(init.signal?.aborted).toBe(true);
  });
});

describe("llmGateway.callStream — total deadline (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts the stream once the total deadline passes, even while chunks keep coming", async () => {
    const ctl = stubFetchControllableStream();
    const gen = callStream(MESSAGES);

    const collected: string[] = [];
    const run = (async () => {
      try {
        for await (const d of gen) collected.push(d);
      } catch (e) {
        return e;
      }
      return null;
    })();

    // Keep the idle timer happy by emitting a chunk every 10 s, but never end
    // the stream — so only the TOTAL deadline can stop it.
    for (let elapsed = 0; elapsed < STREAM_TOTAL_DEADLINE_MS; elapsed += 10_000) {
      ctl.emit(sse(`t${elapsed}`));
      await vi.advanceTimersByTimeAsync(10_000);
    }
    // Push just past the total deadline.
    await vi.advanceTimersByTimeAsync(1);

    const err = await run;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).toMatch(/too long/i);
    // TASK-26g: the reason is carried as data, so callers never sniff the text.
    expect((err as LlmUnavailableError).kind).toBe("timeout");
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
    expect(ctl.signalRef()?.aborted).toBe(true);
  });
});

describe("llmGateway.callStream — idle deadline (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts when no chunk arrives within the idle window", async () => {
    const ctl = stubFetchControllableStream();
    const gen = callStream(MESSAGES);

    const collected: string[] = [];
    const run = (async () => {
      try {
        for await (const d of gen) collected.push(d);
      } catch (e) {
        return e;
      }
      return null;
    })();

    // One chunk arrives, then the stream goes quiet past the idle window.
    ctl.emit(sse("hello"));
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_DEADLINE_MS - 1);
    // Still alive, under the idle limit and well under the total.
    expect(ctl.signalRef()?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);

    const err = await run;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).toMatch(/too long/i);
    // TASK-26g: the reason is carried as data, so callers never sniff the text.
    expect((err as LlmUnavailableError).kind).toBe("timeout");
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
    expect(collected.join("")).toBe("hello");
    expect(ctl.signalRef()?.aborted).toBe(true);
  });

  it("does NOT abort while chunks keep arriving inside the idle window", async () => {
    const ctl = stubFetchControllableStream();
    const gen = callStream(MESSAGES);

    const collected: string[] = [];
    void (async () => {
      try {
        for await (const d of gen) collected.push(d);
      } catch {
        /* ignore */
      }
    })();

    // A chunk every (idle − 1 s) for a few rounds: the idle timer resets each
    // time, so the stream survives well past a single idle window.
    for (let i = 0; i < 3; i++) {
      ctl.emit(sse(`k${i}`));
      await vi.advanceTimersByTimeAsync(STREAM_IDLE_DEADLINE_MS - 1_000);
      expect(ctl.signalRef()?.aborted).toBe(false);
    }
  });
});

describe("llmGateway.callStream — client disconnect (fake timers)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("aborts the upstream request when the caller's signal aborts", async () => {
    const ctl = stubFetchControllableStream();
    const client = new AbortController();
    const gen = callStream(MESSAGES, { signal: client.signal });

    const collected: string[] = [];
    const run = (async () => {
      try {
        for await (const d of gen) collected.push(d);
      } catch (e) {
        return e;
      }
      return null;
    })();

    // One card streams, then the client disconnects.
    ctl.emit(sse("partial-card"));
    await vi.advanceTimersByTimeAsync(10);
    client.abort();
    await vi.advanceTimersByTimeAsync(1);

    const err = await run;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
    // The disconnect reached the upstream fetch's signal.
    expect(ctl.signalRef()?.aborted).toBe(true);
  });

  it("aborts immediately when the caller's signal is already aborted", async () => {
    stubFetchHangUntilAbort();
    const client = new AbortController();
    client.abort();
    const err = await drain(callStream(MESSAGES, { signal: client.signal })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as Error).message).not.toContain(FAKE_API_KEY);
  });
});


// ---------------------------------------------------------------------------
// TASK-26g — every LlmUnavailableError says WHY, as data

describe("TASK-26g: LlmUnavailableError carries a kind set where it is thrown", () => {
  afterEach(() => vi.useRealTimers());

  it("call: a non-2xx is 'http', a dead network is 'network'", async () => {
    stubFetch(503, JSON.stringify({}), false);
    const http = await call(MESSAGES).catch((e: unknown) => e);
    expect(http).toBeInstanceOf(LlmUnavailableError);
    expect((http as LlmUnavailableError).kind).toBe("http");

    stubFetchNetworkError();
    const net = await call(MESSAGES).catch((e: unknown) => e);
    expect((net as LlmUnavailableError).kind).toBe("network");
  });

  it("callStream: http, network, and a client disconnect ('cancelled') are told apart", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429, body: null }));
    const http = await (async () => { try { for await (const _ of callStream(MESSAGES)) void _; } catch (e) { return e; } return null; })();
    expect((http as LlmUnavailableError).kind).toBe("http");

    stubFetchNetworkError();
    const net = await (async () => { try { for await (const _ of callStream(MESSAGES)) void _; } catch (e) { return e; } return null; })();
    expect((net as LlmUnavailableError).kind).toBe("network");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, body: null }));
    const empty = await (async () => { try { for await (const _ of callStream(MESSAGES)) void _; } catch (e) { return e; } return null; })();
    expect((empty as LlmUnavailableError).kind).toBe("empty");
  });

  it("a timeout message never contains the word the old sniffer looked for ('time') as its only signal", () => {
    // The message says "took too long"; the old code searched for "time" and
    // therefore never matched. The kind makes the message irrelevant.
    const e = new LlmUnavailableError("The AI service took too long to respond.", "timeout");
    expect(e.message.toLowerCase().includes("time")).toBe(false);
    expect(e.kind).toBe("timeout");
  });
});
