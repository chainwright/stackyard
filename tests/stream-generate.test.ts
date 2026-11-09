// tests/stream-generate.test.ts
// Unit tests for server/stream-generate.ts — TRULY progressive (NDJSON) delivery.
//
// The streaming LLM call (callStream), the prompt builder (buildStream), the
// non-streaming fallback generator (generate) and the pacing sleep are all
// injected, so no real LLM/network runs here. The fake streaming endpoint
// below sends JSON-Lines text in controllable chunks so we can exercise:
//   - partial lines and lines split across chunks,
//   - a malformed card in the middle,
//   - a stream that dies halfway,
//   - a slow stream (and that the first card reaches the sink before the end).

import { describe, it, expect, vi } from "vitest";
import {
  streamGenerate,
  LineBuffer,
} from "../server/stream-generate.js";
import type { LineSink, StreamGenerateDeps } from "../server/stream-generate.js";
import type {
  GenerateStreamMessage,
  GenerateRequest,
  Stack,
  Card,
} from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Helpers

/** Collect every NDJSON message written, in order, and whether end() fired.
 *  Each written message also carries the index at which it was observed so a
 *  test can assert that (say) the first card landed before the stream ended. */
function collector(): {
  sink: LineSink;
  lines: GenerateStreamMessage[];
  ended: () => boolean;
} {
  const lines: GenerateStreamMessage[] = [];
  let ended = false;
  return {
    lines,
    ended: () => ended,
    sink: {
      write: (obj) => void lines.push(obj),
      end: () => void (ended = true),
    },
  };
}

function req(prompt = "a quiz about Irish rivers"): GenerateRequest {
  return { prompt };
}

const QUIZ_CARD: Card = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "quiz",
  elements: [
    { type: "text", id: "33333333-3333-4333-8333-333333333333", x: 48, y: 104, w: 704, h: 128, content: "Longest river?" },
    {
      type: "button", id: "44444444-4444-4444-8444-444444444444", x: 48, y: 296, w: 344, h: 96, label: "Shannon",
      actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: "88888888-8888-4888-8888-888888888888" }],
    },
    {
      type: "button", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", x: 408, y: 296, w: 344, h: 96, label: "Liffey",
      actions: [{ type: "goto", cardId: "88888888-8888-4888-8888-888888888888" }],
    },
  ],
  actions: [],
};

const END_CARD: Card = {
  id: "88888888-8888-4888-8888-888888888888",
  kind: "end",
  elements: [{ type: "field", id: "99999999-9999-4999-8999-999999999999", x: 48, y: 420, w: 704, h: 60, variable: "score" }],
  actions: [],
};

/** A minimal valid stack: one quiz content card + one end card. */
function validStack(): Stack {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Irish Rivers Quiz",
    theme: { background: "#ffffff", foreground: "#000000", font: "sans-serif" },
    cards: [QUIZ_CARD, END_CARD],
  };
}

/** The JSON-Lines wire text the model would emit for `stack`. */
function jsonLinesFor(stack: Stack): string {
  const header = JSON.stringify({
    kind: "stack",
    id: stack.id,
    title: stack.title,
    theme: stack.theme,
  });
  const cardLines = stack.cards.map((c) => JSON.stringify({ kind: "card", card: c }));
  return [header, ...cardLines].join("\n") + "\n";
}

/**
 * A fake streaming LLM endpoint: an async generator that yields the given
 * `chunks` in order, optionally sleeping `delayMs` between each (to model a
 * slow stream) and optionally throwing after yielding `dieAfter` chunks (to
 * model a stream that dies halfway).
 */
function fakeCallStream(
  chunks: string[],
  opts: { delayMs?: number; dieAfter?: number } = {},
): NonNullable<StreamGenerateDeps["callStream"]> {
  return async function* () {
    for (let i = 0; i < chunks.length; i++) {
      if (opts.dieAfter !== undefined && i >= opts.dieAfter) {
        throw new Error("stream dropped");
      }
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      yield chunks[i]!;
    }
  };
}

/** Split a string into `n` roughly-equal chunks (to model arbitrary chunking). */
function splitInto(text: string, n: number): string[] {
  const size = Math.ceil(text.length / n);
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

/** A generate() stub that never runs on the happy streamed path. */
const generateNeverCalled: NonNullable<StreamGenerateDeps["generate"]> = vi.fn(async () => {
  throw new Error("generate() should not be called on the happy streamed path");
});

/** Deps that make the fallback path instant (no real pacing sleep). */
const instantSleep: NonNullable<StreamGenerateDeps["sleep"]> = async () => {};

// ---------------------------------------------------------------------------
// Incremental line parser (LineBuffer)

describe("LineBuffer — incremental JSON-Lines parsing", () => {
  it("returns only complete lines, holding a partial line until its newline", () => {
    const b = new LineBuffer();
    b.push('{"a":1}\n{"b":');
    expect(b.takeCompleteLines()).toEqual(['{"a":1}']);
    // The partial second line is held.
    expect(b.takeCompleteLines()).toEqual([]);
    b.push("2}\n");
    expect(b.takeCompleteLines()).toEqual(['{"b":2}']);
  });

  it("reassembles a line split across several chunks", () => {
    const b = new LineBuffer();
    for (const ch of ['{"kin', 'd":"st', 'ack"}', "\n"]) b.push(ch);
    expect(b.takeCompleteLines()).toEqual(['{"kind":"stack"}']);
  });

  it("strips a trailing carriage return (CRLF endpoints)", () => {
    const b = new LineBuffer();
    b.push('{"a":1}\r\n');
    expect(b.takeCompleteLines()).toEqual(['{"a":1}']);
  });

  it("takeRemainder returns a trailing line with no newline", () => {
    const b = new LineBuffer();
    b.push('{"a":1}\n{"tail":true}');
    expect(b.takeCompleteLines()).toEqual(['{"a":1}']);
    expect(b.takeRemainder()).toBe('{"tail":true}');
  });
});

// ---------------------------------------------------------------------------
// Progressive LLM path — success

describe("streamGenerate — progressive LLM stream (success)", () => {
  it("emits start, a card per card line, then done — in order", async () => {
    const stack = validStack();
    const { sink, lines, ended } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([jsonLinesFor(stack)]),
      generate: generateNeverCalled,
    });

    expect(lines[0]).toMatchObject({ type: "start", title: stack.title, isFallback: false });
    expect(lines[1]).toMatchObject({ type: "card", index: 0 });
    expect(lines[2]).toMatchObject({ type: "card", index: 1 });
    expect(lines[3]).toMatchObject({ type: "done", isFallback: false });
    const done = lines[3] as Extract<GenerateStreamMessage, { type: "done" }>;
    expect(done.stack.cards.length).toBe(2);
    expect(ended()).toBe(true);
    expect(generateNeverCalled).not.toHaveBeenCalled();
  });

  it("deals each card with its real content in deck order", async () => {
    const stack = validStack();
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([jsonLinesFor(stack)]),
      generate: generateNeverCalled,
    });

    const cards = lines.filter(
      (l): l is Extract<GenerateStreamMessage, { type: "card" }> => l.type === "card",
    );
    expect(cards.map((c) => c.index)).toEqual([0, 1]);
    expect(cards[0]!.card.id).toBe(stack.cards[0]!.id);
    expect(cards[1]!.card.kind).toBe("end");
  });

  it("handles lines split across chunks and partial lines", async () => {
    const stack = validStack();
    // Chop the whole JSON-Lines text into many small chunks so lines are split
    // mid-token across chunk boundaries.
    const chunks = splitInto(jsonLinesFor(stack), 11);
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream(chunks),
      generate: generateNeverCalled,
    });

    expect(lines[0]!.type).toBe("start");
    expect(lines.filter((l) => l.type === "card")).toHaveLength(2);
    expect(lines[lines.length - 1]!.type).toBe("done");
  });

  it("accepts a final card line that arrives with no trailing newline", async () => {
    const stack = validStack();
    const text = jsonLinesFor(stack).replace(/\n$/, ""); // drop the final newline
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([text]),
      generate: generateNeverCalled,
    });

    expect(lines.filter((l) => l.type === "card")).toHaveLength(2);
    expect(lines[lines.length - 1]!.type).toBe("done");
  });
});

// ---------------------------------------------------------------------------
// Progressive LLM path — the key progressive property

describe("streamGenerate — the first card arrives before the stream ends", () => {
  it("writes the first card before the slow stream has finished", async () => {
    const stack = validStack();
    // One chunk per JSON line, 40ms apart: a slow stream.
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: stack.theme }) + "\n";
    const c0 = JSON.stringify({ kind: "card", card: stack.cards[0] }) + "\n";
    const c1 = JSON.stringify({ kind: "card", card: stack.cards[1] }) + "\n";

    const lines: GenerateStreamMessage[] = [];
    let ended = false;
    // Record the elapsed time at which each message is written and at end().
    const t0 = Date.now();
    const times: { at: number; type: string }[] = [];
    const sink: LineSink = {
      write: (obj) => {
        times.push({ at: Date.now() - t0, type: obj.type });
        lines.push(obj);
      },
      end: () => void (ended = true),
    };

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([header, c0, c1], { delayMs: 40 }),
      generate: generateNeverCalled,
    });

    const firstCard = times.find((t) => t.type === "card")!;
    const doneMsg = times.find((t) => t.type === "done")!;
    // The first card was written strictly before `done` — i.e. it reached the
    // client while the stream was still going, not all at the end.
    expect(firstCard.at).toBeLessThan(doneMsg.at);
    // And there was a real gap (the slow stream) between the two cards.
    const cardTimes = times.filter((t) => t.type === "card").map((t) => t.at);
    expect(cardTimes[1]! - cardTimes[0]!).toBeGreaterThanOrEqual(20);
    expect(ended).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Progressive LLM path — failures fall back cleanly

describe("streamGenerate — streamed attempt fails → reset + fallback", () => {
  it("resets, then streams the fallback stack, when a card mid-stream is malformed", async () => {
    const stack = validStack();
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: stack.theme });
    const good = JSON.stringify({ kind: "card", card: stack.cards[0] });
    // A malformed card line: `card` is missing required fields.
    const bad = JSON.stringify({ kind: "card", card: { id: "nope" } });
    const end = JSON.stringify({ kind: "card", card: stack.cards[1] });
    const text = [header, good, bad, end].join("\n") + "\n";

    const fallbackStack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack: fallbackStack, isFallback: true }));
    const { sink, lines, ended } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([text]),
      generate,
      sleep: instantSleep,
    });

    // The partial stream dealt the good card, then hit the malformed one:
    // start, card(0), then reset.
    expect(lines[0]!.type).toBe("start");
    expect(lines[1]!.type).toBe("card");
    const resetIdx = lines.findIndex((l) => l.type === "reset");
    expect(resetIdx).toBeGreaterThan(-1);
    // After reset: a fresh start, the fallback cards, then done (isFallback).
    const after = lines.slice(resetIdx + 1);
    expect(after[0]!.type).toBe("start");
    expect(after.filter((l) => l.type === "card")).toHaveLength(fallbackStack.cards.length);
    expect(after[after.length - 1]).toMatchObject({ type: "done", isFallback: true });
    expect(generate).toHaveBeenCalledOnce();
    expect(ended()).toBe(true);
  });

  it("NEVER emits a parseable-but-invalid card as a `card` message (per-card validation pinned)", async () => {
    // TASK-22 n (J4 L4/M7): if the per-card validateCard() check were removed,
    // the invalid card below (a quiz with no correct answer) would be written
    // to the client as a `card` before the whole-stack check resets. Assert
    // that no emitted card carries the invalid id, so removing that check fails
    // this test.
    const stack = validStack();
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: stack.theme });
    const good = JSON.stringify({ kind: "card", card: stack.cards[0] });
    // Shape-parseable JSON but a card validateCard() must REJECT: the text's
    // `content` is a number, not a string. Without the per-card check this would be
    // dealt to the client before the whole-stack check. (A broken x / y / w / h is
    // no longer a rejection: the server fills coordinates in, TASK-31c.)
    const invalidQuizId = "aaaaaaaa-0000-4000-8000-00000000bad0";
    const invalidCard = {
      id: invalidQuizId,
      kind: "quiz",
      elements: [
        { type: "text", id: "aaaaaaaa-0000-4000-8000-00000000bad1", x: 48, y: 104, w: 704, h: 128, content: 42 },
        { type: "button", id: "aaaaaaaa-0000-4000-8000-00000000bad2", x: 48, y: 296, w: 344, h: 96, label: "A", actions: [{ type: "score", delta: 1 }] },
        { type: "button", id: "aaaaaaaa-0000-4000-8000-00000000bad3", x: 408, y: 296, w: 344, h: 96, label: "B", actions: [{ type: "score", delta: 0 }] },
      ],
      actions: [],
    };
    const bad = JSON.stringify({ kind: "card", card: invalidCard });
    const text = [header, good, bad].join("\n") + "\n";

    const fallbackStack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack: fallbackStack, isFallback: true }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([text]),
      generate,
      sleep: instantSleep,
    });

    // The invalid card must NEVER have been dealt to the client.
    const dealtInvalid = lines.some(
      (l) => l.type === "card" && (l.card as { id?: string }).id === invalidQuizId,
    );
    expect(dealtInvalid).toBe(false);
    // And the run still recovers via reset + fallback.
    expect(lines.some((l) => l.type === "reset")).toBe(true);
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", isFallback: true });
  });

  it("resets, then falls back, when the stream dies halfway", async () => {
    const stack = validStack();
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: stack.theme }) + "\n";
    const c0 = JSON.stringify({ kind: "card", card: stack.cards[0] }) + "\n";
    const c1 = JSON.stringify({ kind: "card", card: stack.cards[1] }) + "\n";

    const fallbackStack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack: fallbackStack, isFallback: true }));
    const { sink, lines } = collector();

    // Yields header + first card, then throws before the end card.
    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([header, c0, c1], { dieAfter: 2 }),
      generate,
      sleep: instantSleep,
    });

    // Dealt start + first card, then the drop → reset → fallback → done.
    expect(lines[0]!.type).toBe("start");
    expect(lines.some((l) => l.type === "card")).toBe(true);
    expect(lines.some((l) => l.type === "reset")).toBe(true);
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", isFallback: true });
    expect(generate).toHaveBeenCalledOnce();
  });

  it("falls back WITHOUT a reset when the stream dies before any card (no cards dealt)", async () => {
    // The header never completes (no newline, then the stream dies), so no
    // start/card is emitted and the client has nothing to clear.
    const partialHeader = '{"kind":"stack","id":"11111111-1111-4111-8111-11111111';

    const fallbackStack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack: fallbackStack, isFallback: true }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([partialHeader], { dieAfter: 1 }),
      generate,
      sleep: instantSleep,
    });

    // No reset because nothing was dealt; just the fallback stream.
    expect(lines.some((l) => l.type === "reset")).toBe(false);
    expect(lines[0]!.type).toBe("start");
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", isFallback: true });
  });

  it("resets then falls back when the assembled stack fails whole-stack validation", async () => {
    // Two valid-shaped end cards: each card passes validateCard(), but the
    // assembled stack breaks the exactly-one-end invariant.
    const stack = validStack();
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: stack.theme });
    const endA = JSON.stringify({ kind: "card", card: { ...stack.cards[1], id: "77777777-7777-4777-8777-777777777777" } });
    const endB = JSON.stringify({ kind: "card", card: stack.cards[1] });
    const text = [header, endA, endB].join("\n") + "\n";

    const fallbackStack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack: fallbackStack, isFallback: true }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([text]),
      generate,
      sleep: instantSleep,
    });

    // Both end cards were dealt (shape-valid), then whole-stack validation
    // failed → reset → fallback → done.
    expect(lines.filter((l) => l.type === "card").length).toBeGreaterThanOrEqual(2);
    expect(lines.some((l) => l.type === "reset")).toBe(true);
    expect(lines[lines.length - 1]).toMatchObject({ type: "done" });
  });

  it("emits a single error line (no reset) when the stream fails AND the fallback generator errors", async () => {
    // Nothing dealt (immediate stream failure) and generate() returns ok:false.
    const generate = vi.fn(async () => ({ ok: false as const, message: "No cards for you." }));
    const { sink, lines, ended } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([], { dieAfter: 0 }),
      generate,
      sleep: instantSleep,
    });

    expect(lines.some((l) => l.type === "reset")).toBe(false);
    // An early `start` first (the client is never left in silence), then the error.
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ type: "start", total: 0, title: "", isFallback: false });
    expect(lines[1]).toEqual({ type: "error", message: "No cards for you." });
    expect(ended()).toBe(true);
  });

  it("never leaks a raw error (stack trace) when the fallback generator throws", async () => {
    const generate = vi.fn(async () => { throw new Error("internal boom xyz"); });
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, {
      callStream: fakeCallStream([], { dieAfter: 0 }),
      generate,
      sleep: instantSleep,
    });

    const err = lines[lines.length - 1] as Extract<GenerateStreamMessage, { type: "error" }>;
    expect(err.type).toBe("error");
    expect(err.message).not.toContain("boom");
    expect(err.message).not.toMatch(/Error:/);
  });
});

// ---------------------------------------------------------------------------
// Client disconnect mid-stream

describe("streamGenerate — client disconnect", () => {
  it("forwards the client signal to callStream so the upstream request can be aborted", async () => {
    const stack = validStack();
    const client = new AbortController();
    let seenSignal: AbortSignal | undefined;

    // A callStream that records the signal it was given.
    const callStream: NonNullable<StreamGenerateDeps["callStream"]> =
      async function* (_messages, options) {
        seenSignal = options?.signal;
        for (const chunk of [jsonLinesFor(stack)]) yield chunk;
      };

    const { sink } = collector();
    await streamGenerate(req(), sink, {
      callStream,
      generate: generateNeverCalled,
      signal: client.signal,
    });

    expect(seenSignal).toBe(client.signal);
  });

  it("does NOT fall back when the client has disconnected mid-stream", async () => {
    const stack = validStack();
    const client = new AbortController();

    // Stream the header + first card, then the client disconnects and the
    // upstream stream throws (as callStream would once its fetch is aborted).
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: stack.theme }) + "\n";
    const c0 = JSON.stringify({ kind: "card", card: stack.cards[0] }) + "\n";

    const callStream: NonNullable<StreamGenerateDeps["callStream"]> =
      async function* (_messages, options) {
        yield header;
        yield c0;
        // The client goes away; its signal aborts and the stream dies.
        client.abort();
        void options; // signal already captured by the caller under test
        throw new Error("aborted");
      };

    // If the fallback ran it would deal cards; assert it is NEVER called.
    const generate = vi.fn(async () => ({
      ok: true as const,
      stack: validStack(),
      isFallback: true,
    }));

    const { sink, lines, ended } = collector();
    await streamGenerate(req(), sink, {
      callStream,
      generate,
      sleep: instantSleep,
      signal: client.signal,
    });

    // The partial stream dealt start + one card, then stopped. No reset, no
    // fallback cards, no done — the connection is gone.
    expect(generate).not.toHaveBeenCalled();
    expect(lines.some((l) => l.type === "reset")).toBe(false);
    expect(lines.some((l) => l.type === "done")).toBe(false);
    expect(lines[0]!.type).toBe("start");
    expect(lines.some((l) => l.type === "card")).toBe(true);
    expect(ended()).toBe(true);
  });
});
