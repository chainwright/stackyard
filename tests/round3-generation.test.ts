// tests/round3-generation.test.ts
// TASK-27 m, b, e, B, t(server half): what the generator does with the LIVE
// model's output, found by round 3 (judge_2026-11-05_r3). The ids below are the
// exact ones that withdrew a whole correct deck on the live app.

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fc from "fast-check";

vi.mock("../server/llmGateway.js", () => {
  class LlmUnavailableError extends Error {
    readonly kind: string;
    constructor(message: string, kind = "network") {
      super(message);
      this.name = "LlmUnavailableError";
      this.kind = kind;
    }
  }
  class LlmMalformedError extends Error {}
  class ConfigurationError extends Error {}
  return { call: vi.fn(), callStream: vi.fn(), LlmUnavailableError, LlmMalformedError, ConfigurationError };
});

import * as gateway from "../server/llmGateway.js";
import { generate } from "../server/stackGenerator.js";
import { streamGenerate, type LineSink } from "../server/stream-generate.js";
import {
  cap,
  sanitizeRawStack,
  sanitizeRawCard,
  finaliseGeneratedStack,
  normalizeGeneratedCard,
  splitTermAndExplanation,
} from "../server/normalizeGenerated.js";
import { validate } from "../src/shared/validator.js";
import { gotoOf } from "../src/shared/flow.js";
import type { GenerateStreamMessage, Stack, Card } from "../src/shared/types.js";

const callMock = vi.mocked(gateway.call);
const callStreamMock = vi.mocked(gateway.callStream);

beforeEach(() => {
  callMock.mockReset();
  callStreamMock.mockReset();
});

/** Run a raw model deck through the real front half of the pipeline. */
function finalise(raw: unknown): Stack {
  const v = validate(sanitizeRawStack(raw));
  if (!v.valid) throw new Error("fixture invalid: " + v.errors.join(","));
  return finaliseGeneratedStack(v.stack);
}

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// A deck whose ids are whatever a test says they are

interface IdPlan {
  stack: string;
  cards: string[];
  /** element ids, per card, in order: question, then buttons */
  elements: string[][];
}

function deckWith(ids: IdPlan, opts: { gotoTo?: (i: number) => string } = {}): unknown {
  const n = ids.cards.length;
  const gotoTo = opts.gotoTo ?? ((i: number) => ids.cards[Math.min(i + 1, n - 1)]!);
  const cards = ids.cards.map((cid, i) => {
    const isEnd = i === n - 1;
    const el = ids.elements[i] ?? [];
    if (isEnd) {
      return {
        id: cid, kind: "end", actions: [],
        elements: [{ type: "field", id: el[0] ?? "f", x: 48, y: 420, w: 704, h: 60, variable: "score" }],
      };
    }
    return {
      id: cid, kind: "quiz", actions: [],
      elements: [
        { type: "text", id: el[0] ?? "q", x: 40, y: 40, w: 720, h: 120, content: `Question ${i}?` },
        { type: "button", id: el[1] ?? "a", x: 40, y: 200, w: 340, h: 70, label: "Right one", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: gotoTo(i) }] },
        { type: "button", id: el[2] ?? "b", x: 420, y: 200, w: 340, h: 70, label: "Wrong one", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: gotoTo(i) }] },
      ],
    };
  });
  return { id: ids.stack, title: "Ids", theme: { background: "#fff", foreground: "#000", font: "sans-serif" }, cards };
}

class Collect implements LineSink {
  messages: GenerateStreamMessage[] = [];
  write(m: GenerateStreamMessage): void { this.messages.push(m); }
  end(): void {}
}

function asLines(deck: unknown): string[] {
  const d = deck as { id: string; title: string; theme: unknown; cards: unknown[] };
  return [
    JSON.stringify({ kind: "stack", id: d.id, title: d.title, theme: d.theme }) + "\n",
    ...d.cards.map((c) => JSON.stringify({ kind: "card", card: c }) + "\n"),
  ];
}

// ---------------------------------------------------------------------------
// m) ids are ours

describe("TASK-27m: ids are re-minted, so a mistyped id never withdraws a deck", () => {
  // The ids the live model wrote for the README's own example sentence.
  const LIVE_IDS: IdPlan = {
    stack: "00000000-0000-4000-8000-0000000100 01", // a SPACE inside the id
    cards: [
      "00000000-0000-4000-8000-0000000100 01",
      "00000002-0100-0000-0000-000000000001", // not v4 (version nibble 0, variant 0)
      "00000002-0200-0000-0000-000000000001",
      "00000002-0300-0000-0000-000000000001",
    ],
    elements: [["x1", "x2", "x3"], ["x1", "x2", "x3"], ["", "", ""], ["x9"]],
  };

  it("the exact live ids: validation fails on the raw deck…", () => {
    expect(validate(deckWith(LIVE_IDS)).valid).toBe(false);
  });

  it("…and passes once sanitised, with fresh, unique v4 ids and every goto intact", () => {
    const out = validate(sanitizeRawStack(deckWith(LIVE_IDS)));
    expect(out.valid).toBe(true);
    if (!out.valid) return;
    const s = out.stack;
    const ids = [s.id, ...s.cards.flatMap((c) => [c.id, ...c.elements.map((e) => e.id)])];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(V4);
    expect(ids).not.toContain(LIVE_IDS.cards[1]); // none of the model's ids survive
    // Each quiz card still leads to the NEXT card, whatever ids it was written with.
    for (let i = 0; i < 2; i++) {
      const buttons = s.cards[i]!.elements.filter((e) => e.type === "button");
      for (const b of buttons) {
        expect(b.type === "button" && gotoOf(b.actions)).toBe(s.cards[i + 1]!.id);
      }
    }
  });

  it("a goto to a card the model never wrote becomes the next card (not a withdrawal)", () => {
    const deck = deckWith(
      { stack: "s", cards: ["c0", "c1", "c2"], elements: [] },
      { gotoTo: () => "no-such-card" },
    );
    const out = validate(sanitizeRawStack(deck));
    expect(out.valid).toBe(true);
    if (!out.valid) return;
    const first = out.stack.cards[0]!.elements.find((e) => e.type === "button");
    expect(first && first.type === "button" && gotoOf(first.actions)).toBe(out.stack.cards[1]!.id);
  });

  it("duplicate card ids are harmless: each card gets its own id and a goto reaches the FIRST holder", () => {
    const deck = deckWith(
      { stack: "s", cards: ["dup", "dup", "end"], elements: [] },
      { gotoTo: (i) => (i === 0 ? "dup" : "end") },
    );
    const out = validate(sanitizeRawStack(deck));
    expect(out.valid).toBe(true);
    if (!out.valid) return;
    expect(new Set(out.stack.cards.map((c) => c.id)).size).toBe(3);
  });

  it("sanitizeRawCard gives every element a fresh id, even when none was written", () => {
    const raw = { id: "c", kind: "quiz", actions: [], elements: [
      { type: "text", x: 0, y: 0, w: 10, h: 10, content: "hi" },
      { type: "text", id: 42, x: 0, y: 0, w: 10, h: 10, content: "num" },
    ] };
    const c = sanitizeRawCard(raw) as Card;
    for (const e of c.elements) expect(e.id).toMatch(V4);
    expect(new Set(c.elements.map((e) => e.id)).size).toBe(2);
  });

  it("generate(): the live ids become a normal deck in ONE model call, not a retry/fallback", async () => {
    callMock.mockResolvedValueOnce(JSON.stringify(deckWith(LIVE_IDS)));
    const r = await generate({ prompt: "a 10-card quiz about the Vikings in Ireland, the right answer plays a cheer" });
    expect(r.ok && r.isFallback).toBe(false);
    expect(callMock).toHaveBeenCalledTimes(1);
  });

  it("streamGenerate(): the live ids are dealt and finished without a reset or a fallback", async () => {
    const lines = asLines(deckWith(LIVE_IDS));
    callStreamMock.mockImplementation(async function* () { for (const l of lines) yield l; });
    const sink = new Collect();
    await streamGenerate({ prompt: "p" }, sink, { sleep: async () => {} });
    expect(sink.messages.some((m) => m.type === "reset")).toBe(false);
    const done = sink.messages.find((m) => m.type === "done") as Extract<GenerateStreamMessage, { type: "done" }>;
    expect(done, "a done line").toBeDefined();
    expect(done.isFallback).toBe(false);
    expect(callMock).not.toHaveBeenCalled(); // the non-stream retry was never needed
    expect(validate(done.stack).valid).toBe(true);
  });

  it("streamGenerate(): a missing stack-header id does not stop the deck either", async () => {
    const deck = deckWith(LIVE_IDS) as { id?: string };
    delete deck.id;
    const lines = asLines(deck);
    callStreamMock.mockImplementation(async function* () { for (const l of lines) yield l; });
    const sink = new Collect();
    await streamGenerate({ prompt: "p" }, sink, { sleep: async () => {} });
    const done = sink.messages.find((m) => m.type === "done") as Extract<GenerateStreamMessage, { type: "done" }> | undefined;
    expect(done?.isFallback).toBe(false);
  });

  it("property: ANY id strings (spaces, duplicates, empty, numeric, hostile) still give an unwithdrawn deck", async () => {
    const idArb = fc.oneof(
      fc.string({ maxLength: 40 }),
      fc.constant(""),
      fc.constant("0000 0000"),
      fc.constant("</script>"),
      fc.constantFrom("a", "a", "b"), // duplicates
      fc.integer().map(String),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          stack: idArb,
          cards: fc.array(idArb, { minLength: 3, maxLength: 7 }),
          elements: fc.array(fc.array(idArb, { minLength: 3, maxLength: 3 }), { minLength: 7, maxLength: 7 }),
          badGoto: fc.boolean(),
        }),
        async ({ stack, cards, elements, badGoto }) => {
          const deck = deckWith({ stack, cards, elements }, badGoto ? { gotoTo: () => "nowhere" } : {});

          // One-shot path
          callMock.mockReset();
          callMock.mockResolvedValueOnce(JSON.stringify(deck));
          const r = await generate({ prompt: "p" });
          expect(r.ok && r.isFallback).toBe(false);
          expect(callMock).toHaveBeenCalledTimes(1);
          if (r.ok) expect(validate(r.stack).valid).toBe(true);

          // Streaming path
          callStreamMock.mockReset();
          callMock.mockReset();
          const lines = asLines(deck);
          callStreamMock.mockImplementation(async function* () { for (const l of lines) yield l; });
          const sink = new Collect();
          await streamGenerate({ prompt: "p" }, sink, { sleep: async () => {} });
          expect(sink.messages.some((m) => m.type === "reset")).toBe(false);
          const done = sink.messages.find((m) => m.type === "done") as Extract<GenerateStreamMessage, { type: "done" }> | undefined;
          expect(done?.isFallback).toBe(false);
          expect(callMock).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 60 },
    );
  }, 60_000);
});

// ---------------------------------------------------------------------------
// b) boundaries

describe("TASK-27b: text is cut at a sentence or word boundary, never mid-word", () => {
  const END85 = "The end. Well done for finishing Erik's story and the Viking quiz. Now tell a friend.";

  it("an 85-character end line (over the 80 limit): whole sentences, ends with '…' (text was dropped), no partial word", () => {
    expect(END85.length).toBe(85);
    const out = cap(END85, 80);
    expect(out).toBe("The end. Well done for finishing Erik's story and the Viking quiz…");
    expect(out.length).toBeLessThanOrEqual(80);
  });

  it("the live failure ('Now tell a p…') cannot happen: every output word is a whole input word", () => {
    const text = "The end. Well done for finishing Erik's story and the Viking quiz. Now tell a partner about it!";
    for (const limit of [40, 60, 70, 80, 90]) {
      const out = cap(text, limit).replace(/…$/, "");
      const words = out.split(/\s+/).filter(Boolean);
      const source = new Set(text.split(/\s+/).map((w) => w.replace(/[.!?]$/, "")));
      for (const w of words) expect(source.has(w.replace(/[.!?]$/, "")), `"${w}" at limit ${limit}`).toBe(true);
      expect(out.length).toBeLessThanOrEqual(limit);
    }
  });

  it("one long sentence: cuts at the last word boundary and says so with '…'", () => {
    const q = "Which of these animals lives in the sea and breathes air through a blowhole on top of its head every day";
    const out = cap(q, 60);
    expect(out.endsWith("…")).toBe(true);
    const body = out.slice(0, -1);
    expect(q.startsWith(body)).toBe(true);
    expect(q.charAt(body.length)).toBe(" "); // the cut fell on a word boundary
    expect(out.length).toBeLessThanOrEqual(61);
  });

  it("text within the limit is untouched (only trimmed)", () => {
    expect(cap("  Short and sweet.  ", 80)).toBe("Short and sweet.");
    expect(cap("x".repeat(80), 80)).toBe("x".repeat(80));
  });

  it("a single word longer than the limit is hard-cut (no loop)", () => {
    const out = cap("x".repeat(500), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
  });

  it("a very early sentence end does not throw the rest away", () => {
    const out = cap("Hi. " + "word ".repeat(40), 80);
    expect(out.length).toBeGreaterThan(40);
  });

  it("applies to every kind of text the normaliser caps", () => {
    const sentence = "Here is a fairly long sentence that goes on for a while without any real reason to stop. ";
    const long = sentence.repeat(14); // far over every limit
    const stack: Stack = {
      id: "x", title: "T", theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [
        { id: "q", kind: "quiz", actions: [], elements: [
          { type: "text", id: "1", x: 0, y: 0, w: 10, h: 10, content: long },
          { type: "button", id: "2", x: 0, y: 0, w: 10, h: 10, label: "A really quite long answer that wanders " + "on and on ".repeat(12), actions: [{ type: "score", delta: 1 }] },
          { type: "button", id: "3", x: 0, y: 0, w: 10, h: 10, label: "Short", actions: [{ type: "score", delta: 0 }] },
        ] },
        { id: "s", kind: "story", actions: [], elements: [{ type: "text", id: "4", x: 0, y: 0, w: 10, h: 10, content: long }] },
        { id: "e", kind: "end", actions: [], elements: [
          { type: "text", id: "5", x: 0, y: 0, w: 10, h: 10, content: "The end. Well done for finishing Erik's story and the Viking quiz. Now tell a friend." },
          { type: "field", id: "6", x: 0, y: 0, w: 10, h: 10, variable: "score" },
        ] },
      ],
    };
    const norm = (c: Card): Card => normalizeGeneratedCard(c);
    const texts = [
      ...stack.cards.flatMap((c) => norm(c).elements),
    ];
    for (const e of texts) {
      const s = e.type === "text" ? e.content : e.type === "button" ? e.label : null;
      if (s === null) continue;
      // Never a stub like "wanders on an…": a cut word would not appear whole in the source.
      const body = s.replace(/…$/, "").trim();
      const sources = [long, "A really quite long answer that wanders " + "on and on ".repeat(12), "The end. Well done for finishing Erik's story and the Viking quiz. Now tell a friend.", "Short"];
      const ok = sources.some((src) => src.includes(body.replace(/\s+/g, " ")) || src.replace(/\s+/g, " ").startsWith(body.replace(/\s+/g, " ")));
      expect(ok, `"${s.slice(0, 40)}…" is a prefix cut on a boundary`).toBe(true);
    }
    const end = norm(stack.cards[2]!).elements.find((e) => e.type === "text");
    expect(end && end.type === "text" && end.content).toBe(
      "The end. Well done for finishing Erik's story and the Viking quiz. Now tell a friend.",
    );
  });
});

// ---------------------------------------------------------------------------
// e) self-check on distractors

function quizOf(labels: Array<[string, boolean]>): Stack {
  const end = "e0";
  return {
    id: "s", title: "T", theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards: [
      {
        id: "c0", kind: "quiz", actions: [],
        elements: [
          { type: "text", id: "t", x: 0, y: 0, w: 10, h: 10, content: "What do robins eat?" },
          ...labels.map(([l, right], i) => ({
            type: "button" as const, id: `b${i}`, x: 0, y: 0, w: 10, h: 10, label: l,
            actions: [{ type: "score" as const, delta: right ? 1 : 0 }, { type: "goto" as const, cardId: end }],
          })),
        ],
      },
      { id: end, kind: "end", actions: [], elements: [{ type: "field", id: "f", x: 0, y: 0, w: 10, h: 10, variable: "score" }] },
    ],
  };
}

describe("TASK-27e: the distractor self-check", () => {
  const labelsOf = (s: Stack): string[] =>
    s.cards[0]!.elements.filter((e) => e.type === "button").map((e) => (e.type === "button" ? e.label : ""));

  it("drops a wrong answer that repeats the right one (case-insensitive)", () => {
    const out = finalise(quizOf([["Worms", true], ["worms", false], ["Stones", false]]));
    expect(labelsOf(out).sort()).toEqual(["Stones", "Worms"]);
    expect(validate(out).valid).toBe(true);
  });

  it("drops a duplicated wrong answer", () => {
    const out = finalise(quizOf([["Worms", true], ["Stones", false], ["stones ", false], ["Plastic", false]]));
    expect(labelsOf(out).sort()).toEqual(["Plastic", "Stones", "Worms"]);
  });

  it("never leaves a quiz card without a wrong answer", () => {
    const out = finalise(quizOf([["Worms", true], ["worms", false]]));
    expect(labelsOf(out)).toHaveLength(2); // kept, so invariant 4 still holds
    expect(validate(out).valid).toBe(true);
  });

  it("leaves distinct answers alone", () => {
    const out = finalise(quizOf([["Worms", true], ["Stones", false], ["Plastic", false], ["Metal", false]]));
    expect(labelsOf(out)).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// B) pronoun terms

describe("TASK-27B: a pronoun is not a flash-card term", () => {
  for (const sentence of [
    "This is the process where plants make food from sunlight and water.",
    "There are 206 bones in the adult human body.",
    "It is when water vapour cools down and turns back into drops.",
    "These are the tiny holes on a leaf that let gases in and out.",
    "They are animals that eat only plants.",
  ]) {
    it(`"${sentence.slice(0, 32)}…" does not become a one-word term`, () => {
      expect(splitTermAndExplanation(sentence)).toBeNull();
    });
  }

  it("a real subject still splits", () => {
    expect(splitTermAndExplanation("Photosynthesis is how plants make food from sunlight.")?.term).toBe("Photosynthesis");
  });

  it("such a card becomes a story card with a way forward", () => {
    const flash: Card = {
      id: "f", kind: "flash", actions: [],
      elements: [{ type: "text", id: "1", x: 0, y: 0, w: 10, h: 10, content: "There are 206 bones in the adult human body, and babies have more." }],
    };
    const stack: Stack = {
      id: "s", title: "T", theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [flash, { id: "e", kind: "end", actions: [], elements: [{ type: "field", id: "2", x: 0, y: 0, w: 10, h: 10, variable: "score" }] }],
    };
    const out = finalise(stack);
    expect(out.cards[0]!.kind).toBe("story");
    expect(out.cards[0]!.elements.some((e) => e.type === "button")).toBe(true);
  });
});
