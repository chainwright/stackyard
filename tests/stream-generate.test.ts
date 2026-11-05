// tests/stream-generate.test.ts
// Unit tests for server/stream-generate.ts — progressive (NDJSON) delivery.
// The generator is injected (deps.generate) so no LLM/fallback runs here.

import { describe, it, expect, vi } from "vitest";
import { streamGenerate } from "../server/stream-generate.js";
import type { LineSink } from "../server/stream-generate.js";
import type {
  GenerateStreamMessage,
  GenerateRequest,
  Stack,
} from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Helpers

/** Collect every NDJSON message written, and whether end() was called. */
function collector(): { sink: LineSink; lines: GenerateStreamMessage[]; ended: () => boolean } {
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

/** A minimal valid stack: one quiz content card + one end card. */
function validStack(): Stack {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Irish Rivers Quiz",
    theme: { background: "#ffffff", foreground: "#000000", font: "sans-serif" },
    cards: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        kind: "quiz",
        elements: [
          { type: "text", id: "33333333-3333-4333-8333-333333333333", x: 48, y: 104, w: 704, h: 128, content: "Longest river?" },
          { type: "button", id: "44444444-4444-4444-8444-444444444444", x: 48, y: 296, w: 344, h: 96, label: "Shannon",
            actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: "88888888-8888-4888-8888-888888888888" }] },
          { type: "button", id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", x: 408, y: 296, w: 344, h: 96, label: "Liffey",
            actions: [{ type: "goto", cardId: "88888888-8888-4888-8888-888888888888" }] },
        ],
        actions: [],
      },
      {
        id: "88888888-8888-4888-8888-888888888888",
        kind: "end",
        elements: [{ type: "field", id: "99999999-9999-4999-8999-999999999999", x: 48, y: 420, w: 704, h: 60, variable: "score" }],
        actions: [],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests

describe("streamGenerate — successful progressive delivery", () => {
  it("emits start, one card per card, then done, in order", async () => {
    const stack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack, isFallback: false }));
    const { sink, lines, ended } = collector();

    await streamGenerate(req(), sink, { generate });

    expect(lines[0]).toEqual({ type: "start", total: 2, title: stack.title, isFallback: false });
    expect(lines[1]).toMatchObject({ type: "card", index: 0 });
    expect(lines[2]).toMatchObject({ type: "card", index: 1 });
    expect(lines[3]).toMatchObject({ type: "done", isFallback: false });
    // The done line carries the whole validated stack.
    const done = lines[3] as Extract<GenerateStreamMessage, { type: "done" }>;
    expect(done.stack.cards.length).toBe(2);
    expect(ended()).toBe(true);
  });

  it("streams every card in deck order with real content", async () => {
    const stack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack, isFallback: false }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, { generate });

    const cards = lines.filter((l): l is Extract<GenerateStreamMessage, { type: "card" }> => l.type === "card");
    expect(cards.map((c) => c.index)).toEqual([0, 1]);
    expect(cards[0]!.card.id).toBe(stack.cards[0]!.id);
    expect(cards[1]!.card.kind).toBe("end");
  });

  it("marks a fallback stack with isFallback on start and done", async () => {
    const stack = validStack();
    const generate = vi.fn(async () => ({ ok: true as const, stack, isFallback: true }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, { generate });

    const start = lines.find((l) => l.type === "start") as Extract<GenerateStreamMessage, { type: "start" }>;
    const done = lines.find((l) => l.type === "done") as Extract<GenerateStreamMessage, { type: "done" }>;
    expect(start.isFallback).toBe(true);
    expect(done.isFallback).toBe(true);
  });
});

describe("streamGenerate — failures fall back cleanly", () => {
  it("emits a single plain-language error line when the generator returns ok:false", async () => {
    const generate = vi.fn(async () => ({ ok: false as const, message: "No cards for you." }));
    const { sink, lines, ended } = collector();

    await streamGenerate(req(), sink, { generate });

    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ type: "error", message: "No cards for you." });
    expect(ended()).toBe(true);
  });

  it("emits a clean error (never a stack trace) if the generator throws", async () => {
    const generate = vi.fn(async () => { throw new Error("internal boom xyz"); });
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, { generate });

    expect(lines).toHaveLength(1);
    const err = lines[0] as Extract<GenerateStreamMessage, { type: "error" }>;
    expect(err.type).toBe("error");
    expect(err.message).not.toContain("boom");
    expect(err.message).not.toMatch(/Error:/);
  });

  it("stops with an error mid-stream if a card is structurally malformed", async () => {
    // A stack whose SECOND card is malformed (missing required fields). The
    // generator stub returns it as if validated; streamGenerate's per-card
    // shape check must catch it after streaming the good first card.
    const stack = validStack();
    // Corrupt the end card's shape (strip kind) — cast through unknown.
    const broken = {
      ...stack,
      cards: [stack.cards[0], { id: stack.cards[1]!.id, elements: [], actions: [] }],
    } as unknown as Stack;
    const generate = vi.fn(async () => ({ ok: true as const, stack: broken, isFallback: false }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, { generate });

    // start + first (valid) card + error — no done line.
    expect(lines[0]!.type).toBe("start");
    expect(lines[1]!.type).toBe("card");
    expect(lines[lines.length - 1]!.type).toBe("error");
    expect(lines.some((l) => l.type === "done")).toBe(false);
  });

  it("emits an error (not done) when the assembled stack fails whole-stack validation", async () => {
    // Two end cards: each card is shape-valid, but the whole stack breaks the
    // exactly-one-end invariant, so the final validate() must reject it.
    const stack = validStack();
    const twoEnds = {
      ...stack,
      cards: [
        { ...stack.cards[0]!, kind: "end" as const, elements: [] },
        stack.cards[1]!,
      ],
    } as Stack;
    const generate = vi.fn(async () => ({ ok: true as const, stack: twoEnds, isFallback: false }));
    const { sink, lines } = collector();

    await streamGenerate(req(), sink, { generate });

    expect(lines.some((l) => l.type === "done")).toBe(false);
    expect(lines[lines.length - 1]!.type).toBe("error");
  });
});
