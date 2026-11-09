// tests/llmGateway-wait.test.ts
// TASK-31c: the wait. (1) STACKYARD_LLM_THINKING adds "thinking": {"type":"disabled"}
// to both gateway calls; (5) the first-token deadline (45 s) governs until the first
// CONTENT delta, the 20 s idle deadline only after it.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  call,
  callStream,
  llmThinking,
  LlmUnavailableError,
  STREAM_IDLE_DEADLINE_MS,
  STREAM_FIRST_TOKEN_DEADLINE_MS,
  STREAM_TOTAL_DEADLINE_MS,
} from "../server/llmGateway.js";

const KEY = "sk-test-wait-1234567890abcdef";
const MESSAGES = { system: "sys", user: "usr" };
const ENV = ["STACKYARD_LLM_API_KEY", "STACKYARD_LLM_BASE_URL", "STACKYARD_LLM_MODEL", "STACKYARD_LLM_THINKING"] as const;

beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env["STACKYARD_LLM_API_KEY"] = KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  for (const k of ENV) delete process.env[k];
});

/** Stub fetch, remember the request body, and answer with a one-shot success. */
function captureCall(): { body: () => Record<string, unknown> } {
  let sent = "";
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { body?: string }) => {
      sent = init?.body ?? "";
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ choices: [{ message: { content: "{}" } }] }) });
    }),
  );
  return { body: () => JSON.parse(sent) as Record<string, unknown> };
}

/** Stub fetch with a one-line SSE stream and remember the request body. */
function captureStream(): { body: () => Record<string, unknown> } {
  let sent = "";
  const enc = new TextEncoder();
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: { body?: string }) => {
      sent = init?.body ?? "";
      const body = new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "x" } }] })}\n\ndata: [DONE]\n`));
          c.close();
        },
      });
      return Promise.resolve({ ok: true, status: 200, body });
    }),
  );
  return { body: () => JSON.parse(sent) as Record<string, unknown> };
}
async function drain(gen: AsyncGenerator<string>): Promise<void> {
  for await (const _ of gen) void _;
}

describe("TASK-31c: STACKYARD_LLM_THINKING", () => {
  it("TASK-31c: the Anthropic host gets thinking disabled by default, in call() and callStream()", async () => {
    process.env["STACKYARD_LLM_BASE_URL"] = "https://api.anthropic.com/v1/";
    const c = captureCall();
    await call(MESSAGES);
    expect(c.body()["thinking"]).toEqual({ type: "disabled" });
    const s = captureStream();
    await drain(callStream(MESSAGES));
    expect(s.body()["thinking"]).toEqual({ type: "disabled" });
    expect(llmThinking()).toBe("off");
  });

  it("TASK-31c: another host gets no thinking field by default (it may reject an unknown field)", async () => {
    for (const base of [undefined, "https://api.openai.com/v1", "https://openrouter.ai/api/v1", "https://api.anthropic.com.evil.example/v1"]) {
      if (base) process.env["STACKYARD_LLM_BASE_URL"] = base;
      else delete process.env["STACKYARD_LLM_BASE_URL"];
      const c = captureCall();
      await call(MESSAGES);
      expect("thinking" in c.body(), String(base)).toBe(false);
      const s = captureStream();
      await drain(callStream(MESSAGES));
      expect("thinking" in s.body(), String(base)).toBe(false);
      expect(llmThinking()).toBe("on");
    }
  });

  it("TASK-31c: the env switch overrides the host both ways", async () => {
    process.env["STACKYARD_LLM_BASE_URL"] = "https://api.openai.com/v1";
    process.env["STACKYARD_LLM_THINKING"] = "off";
    const a = captureCall();
    await call(MESSAGES);
    expect(a.body()["thinking"]).toEqual({ type: "disabled" });
    const a2 = captureStream();
    await drain(callStream(MESSAGES));
    expect(a2.body()["thinking"]).toEqual({ type: "disabled" });

    process.env["STACKYARD_LLM_BASE_URL"] = "https://api.anthropic.com/v1/";
    process.env["STACKYARD_LLM_THINKING"] = "on";
    const b = captureCall();
    await call(MESSAGES);
    expect("thinking" in b.body()).toBe(false);
    const b2 = captureStream();
    await drain(callStream(MESSAGES));
    expect("thinking" in b2.body()).toBe(false);
    process.env["STACKYARD_LLM_THINKING"] = " OFF ";
    expect(llmThinking()).toBe("off");
  });

  it("TASK-31c: the key never appears in an error raised with the switch on", async () => {
    process.env["STACKYARD_LLM_BASE_URL"] = "https://api.anthropic.com/v1/";
    process.env["STACKYARD_LLM_THINKING"] = "off";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 400, json: () => Promise.resolve({}) }));
    const err = await call(MESSAGES).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(String((err as Error).message)).not.toContain(KEY);
    expect(String((err as Error).message)).not.toContain("anthropic");
    const err2 = await drain(callStream(MESSAGES)).catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(LlmUnavailableError);
    expect(String((err2 as Error).message)).not.toContain(KEY);
  });
});

/** A hand-driven SSE body whose reads fail when the request is aborted. */
function controllableStream(): { emit: (t: string) => void; aborted: () => boolean } {
  const enc = new TextEncoder();
  let push: ((c: Uint8Array) => void) | null = null;
  let fail: ((r: unknown) => void) | null = null;
  let signal: AbortSignal | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      push = (chunk) => c.enqueue(chunk);
      fail = (r) => {
        try {
          c.error(r);
        } catch {
          /* closed */
        }
      };
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((_u: string, init?: { signal?: AbortSignal }) => {
      signal = init?.signal;
      signal?.addEventListener("abort", () => fail?.(new DOMException("Aborted", "AbortError")), { once: true });
      return Promise.resolve({ ok: true, status: 200, body });
    }),
  );
  return { emit: (t) => push?.(enc.encode(t)), aborted: () => signal?.aborted === true };
}
const content = (t: string): string => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n`;
const roleOnly = `data: ${JSON.stringify({ choices: [{ delta: { role: "assistant" } }] })}\n`;

function runStream(gen: AsyncGenerator<string>): { got: string[]; done: Promise<unknown> } {
  const got: string[] = [];
  const done = (async () => {
    try {
      for await (const d of gen) got.push(d);
    } catch (e) {
      return e;
    }
    return null;
  })();
  return { got, done };
}

describe("TASK-31c: the first-token deadline", () => {
  beforeEach(() => vi.useFakeTimers());

  it("TASK-31c: the constants — 45 s to the first content, 20 s idle after it, 90 s total", () => {
    expect(STREAM_FIRST_TOKEN_DEADLINE_MS).toBe(45_000);
    expect(STREAM_IDLE_DEADLINE_MS).toBe(20_000);
    expect(STREAM_TOTAL_DEADLINE_MS).toBe(90_000);
  });

  it("TASK-31c: a stream whose first CONTENT arrives at 30 s succeeds (a role chunk and a ping before it do not matter)", async () => {
    const ctl = controllableStream();
    const run = runStream(callStream(MESSAGES));
    ctl.emit(roleOnly); // 0.7 s on the live model
    await vi.advanceTimersByTimeAsync(700);
    await vi.advanceTimersByTimeAsync(15_000);
    ctl.emit(": ping\n\n"); // 15.7 s
    await vi.advanceTimersByTimeAsync(14_300); // 30 s: past the old 20 s idle window
    expect(ctl.aborted()).toBe(false);
    ctl.emit(content("hello"));
    ctl.emit("data: [DONE]\n");
    await vi.advanceTimersByTimeAsync(10);
    expect(await run.done).toBeNull();
    expect(run.got.join("")).toBe("hello");
  });

  it("TASK-31c: a role chunk followed by 25 s of silence is NOT an idle stall (the 20 s clock starts at the first content)", async () => {
    const ctl = controllableStream();
    const run = runStream(callStream(MESSAGES));
    ctl.emit(roleOnly);
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_DEADLINE_MS + 5_000);
    expect(ctl.aborted()).toBe(false);
    ctl.emit(content("late"));
    ctl.emit("data: [DONE]\n");
    await vi.advanceTimersByTimeAsync(10);
    expect(await run.done).toBeNull();
    expect(run.got.join("")).toBe("late");
  });

  it("TASK-31c: role chunks and pings do not count as content — the first-token deadline still fires at 45 s", async () => {
    const ctl = controllableStream();
    const run = runStream(callStream(MESSAGES));
    ctl.emit(roleOnly);
    for (let t = 0; t < 40_000; t += 10_000) {
      await vi.advanceTimersByTimeAsync(10_000);
      ctl.emit(": ping\n\n");
    }
    expect(ctl.aborted()).toBe(false);
    await vi.advanceTimersByTimeAsync(STREAM_FIRST_TOKEN_DEADLINE_MS - 40_000 + 1);
    const err = await run.done;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as LlmUnavailableError).kind).toBe("timeout");
    expect(String((err as Error).message)).not.toContain(KEY);
    expect(ctl.aborted()).toBe(true);
  });

  it("TASK-31c: a stall of 21 s AFTER content aborts as idle", async () => {
    const ctl = controllableStream();
    const run = runStream(callStream(MESSAGES));
    await vi.advanceTimersByTimeAsync(30_000);
    ctl.emit(content("first"));
    await vi.advanceTimersByTimeAsync(STREAM_IDLE_DEADLINE_MS - 1_000);
    expect(ctl.aborted()).toBe(false);
    await vi.advanceTimersByTimeAsync(2_000); // 21 s of silence
    const err = await run.done;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect((err as LlmUnavailableError).kind).toBe("timeout");
    expect(run.got.join("")).toBe("first");
    expect(ctl.aborted()).toBe(true);
  });

  it("TASK-31c: the total deadline is unchanged — chunks every 10 s still stop at 90 s", async () => {
    const ctl = controllableStream();
    const run = runStream(callStream(MESSAGES));
    for (let t = 0; t < STREAM_TOTAL_DEADLINE_MS; t += 10_000) {
      ctl.emit(content(`t${t}`));
      await vi.advanceTimersByTimeAsync(10_000);
    }
    await vi.advanceTimersByTimeAsync(1);
    const err = await run.done;
    expect(err).toBeInstanceOf(LlmUnavailableError);
    expect(ctl.aborted()).toBe(true);
  });
});
