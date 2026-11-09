// tests/round6-generation.test.ts
// TASK-30a: the end-card fold never deletes a real card (J4 P1-1). The repros A
// and A2 are from judge_2026-11-09_r6/repro/p_r6.mts; the live G2 deck is the
// Irish praise phrases deck.

import { describe, it, expect, vi, afterEach } from "vitest";
import fc from "fast-check";
import {
  finaliseGeneratedStack,
  finaliseGeneratedStackDetailed,
  foldEndLikeCard,
} from "../server/normalizeGenerated.js";
import { streamGenerate } from "../server/stream-generate.js";
import type { LineSink } from "../server/stream-generate.js";
import { generateStackStream } from "../src/editor/api.js";
import { CLOSING_MESSAGE_NOTE } from "../src/editor/StartScreen.js";
import { isLongProse, asksForClosingMessage, isShortPair, isShortTerm } from "../src/shared/endLine.js";
import { validate } from "../src/shared/validator.js";
import type { Card, GenerateStreamMessage, Stack } from "../src/shared/types.js";

afterEach(() => vi.restoreAllMocks());

const id = (n: number): string => `b6b60000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const THEME = { background: "#fff", foreground: "#000", font: "sans-serif" };
const flash = (n: number, front: string, back: string, to: number): Card => ({
  id: id(n), kind: "flash", actions: [],
  elements: [
    { type: "text", id: id(1000 + n), x: 48, y: 264, w: 704, h: 88, content: front },
    { type: "text", id: id(1100 + n), x: 48, y: 360, w: 704, h: 120, content: back },
    { type: "button", id: id(2000 + n), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: id(to) }] },
  ],
});
const end = (n: number, heading = "Well done — you finished!", body?: string): Card => ({
  id: id(n), kind: "end", actions: [],
  elements: [
    { type: "text", id: id(1000 + n), x: 48, y: 120, w: 704, h: 72, content: heading },
    ...(body !== undefined ? [{ type: "text" as const, id: id(1100 + n), x: 48, y: 204, w: 704, h: 200, content: body }] : []),
    { type: "field", id: id(2000 + n), x: 48, y: 420, w: 704, h: 60, variable: "score" },
  ],
});
const deck = (cards: Card[], title = "T"): Stack => ({ id: id(9000), title, theme: THEME, cards });
const textsOf = (c: Card): string[] => c.elements.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.content : ""));
const LONG =
  "You worked hard through every question about the Vikings in Ireland. You learned about longships, Dublin and silver. " +
  "Be proud of what you know, tell someone at home about it tonight, and keep asking questions about the past.";

describe("TASK-30a: the fold never deletes a real vocabulary card", () => {
  it("repro A (live G2): Hello / Thank you / Well done → Maith thú keeps every card, end card unchanged", () => {
    const irish = deck([
      flash(0, "Hello", "Dia duit", 1),
      flash(1, "Thank you", "Go raibh maith agat", 2),
      flash(2, "Well done", "Maith thú", 3),
      end(3, "You learned five Irish phrases!"),
    ], "Irish phrases for praise");
    const out = finaliseGeneratedStackDetailed(irish);
    expect(out.movedClosingMessage).toBe(false);
    expect(out.stack.cards.map((c) => c.kind)).toEqual(["flash", "flash", "flash", "end"]);
    expect(textsOf(out.stack.cards[2]!)).toEqual(["Well done", "Maith thú"]);
    expect(textsOf(out.stack.cards[3]!)).toEqual(["You learned five Irish phrases!"]);
  });

  it("repro A2: 'Congratulations → Félicitations' stays a card and never becomes the end heading", () => {
    const fr = deck([flash(0, "Bonjour", "Hello", 1), flash(1, "Congratulations", "Félicitations", 2), end(2)], "French greetings");
    const out = finaliseGeneratedStackDetailed(fr);
    expect(out.movedClosingMessage).toBe(false);
    expect(out.stack.cards.map((c) => c.kind)).toEqual(["flash", "flash", "end"]);
    expect(textsOf(out.stack.cards[1]!)).toEqual(["Congratulations", "Félicitations"]);
    expect(textsOf(out.stack.cards[2]!)).toEqual(["Well done — you finished!"]);
  });

  it("even a praise-worded card with a LONG back stays when the other flash cards are short pairs", () => {
    const d = deck([
      flash(0, "How do you say hello", "Dia duit", 1),
      flash(1, "How do you say goodbye", "Slán", 2),
      flash(2, "Brilliant", LONG, 3),
      end(3),
    ]);
    // Fronts are 5 words, so the short-term vocabulary guard does not apply; the pairs guard alone keeps the card.
    expect(foldEndLikeCard(d, { prompt: "a long encouraging message on the last card" })).toBe(d);
  });

  it("the TASK-29k repro (flash 'You did it!' + long back) still folds, and says so", () => {
    const quiz: Card = {
      id: id(10), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: id(110), x: 48, y: 104, w: 704, h: 144, content: "Who sailed longships to Ireland?" },
        { type: "button", id: id(210), x: 48, y: 296, w: 344, h: 88, label: "Vikings", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(40) }] },
        { type: "button", id: id(211), x: 408, y: 296, w: 344, h: 88, label: "Romans", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(40) }] },
      ],
    };
    const d = deck([quiz, flash(40, "You did it!", LONG, 50), end(50)]);
    const out = finaliseGeneratedStackDetailed(d, { prompt: "a quiz about Vikings, with a long encouraging message on the last card" });
    expect(out.movedClosingMessage).toBe(true);
    expect(out.stack.cards.map((c) => c.kind)).toEqual(["quiz", "end"]);
    expect(textsOf(out.stack.cards[1]!)[1]).toContain("Be proud of what you know");
    expect(validate(out.stack).valid).toBe(true);
  });

  it("when the sentence did not ask AND the end card already has a body, nothing is folded", () => {
    const quiz: Card = {
      id: id(10), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: id(110), x: 48, y: 104, w: 704, h: 144, content: "Who sailed longships to Ireland?" },
        { type: "button", id: id(210), x: 48, y: 296, w: 344, h: 88, label: "Vikings", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(40) }] },
        { type: "button", id: id(211), x: 408, y: 296, w: 344, h: 88, label: "Romans", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(40) }] },
      ],
    };
    const d = deck([quiz, flash(40, "You did it!", LONG, 50), end(50, "Finished!", "Try the sums again at home.")]);
    expect(foldEndLikeCard(d, { prompt: "a quiz about Vikings" })).toBe(d);
    expect(foldEndLikeCard(d, { prompt: "a quiz about Vikings, with a closing message on the last card" })).not.toBe(d);
  });

  it("the prose guard alone: a praise-worded vocabulary card in a deck with no other flash cards stays", () => {
    const q: Card = {
      id: id(10), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: id(110), x: 48, y: 104, w: 704, h: 144, content: "How do you say hello in Irish?" },
        { type: "button", id: id(210), x: 48, y: 296, w: 344, h: 88, label: "Dia duit", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(40) }] },
        { type: "button", id: id(211), x: 408, y: 296, w: 344, h: 88, label: "Slán", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(40) }] },
      ],
    };
    const d = deck([q, flash(40, "Well done", "Maith thú", 50), end(50)]);
    expect(foldEndLikeCard(d, { prompt: "a message on the last card" })).toBe(d);
  });

  it("endLine helpers: long prose, the ask, short pairs", () => {
    expect(isLongProse("Maith thú")).toBe(false);
    expect(isLongProse("x".repeat(121))).toBe(false); // one 'sentence'
    expect(isLongProse(LONG)).toBe(true);
    expect(isLongProse("A. ".repeat(10))).toBe(false); // long enough? no: only 30 chars
    expect(asksForClosingMessage("a long encouraging message on the last card")).toBe(true);
    expect(asksForClosingMessage("Irish praise phrases as flash cards")).toBe(false);
    expect(asksForClosingMessage(undefined)).toBe(false);
    expect(isShortPair("Well done", "Maith thú")).toBe(true);
    expect(isShortPair("Evaporation", "x".repeat(200))).toBe(false);
  });

  it("property: finaliseGeneratedStack never reduces the number of flash cards whose back is ≤ 120 characters", () => {
    const word = fc.stringMatching(/^[A-Za-z]{2,10}$/);
    const front = fc.oneof(fc.constantFrom("Well done", "Congratulations", "You did it!", "Brilliant", "Great job", "Hello", "Thank you"), word);
    const back = fc.oneof(word, fc.array(word, { minLength: 1, maxLength: 4 }).map((w) => w.join(" ")), fc.constant(LONG));
    fc.assert(
      fc.property(
        fc.array(fc.tuple(front, back), { minLength: 1, maxLength: 5 }),
        fc.constantFrom(undefined, "a quiz with a long encouraging message on the last card", "flash cards of greetings"),
        fc.boolean(),
        (pairs, prompt, endBody) => {
          const cards: Card[] = pairs.map(([f, b], i) => flash(i, f, b, i + 1));
          const stack = deck([...cards, end(pairs.length, "Finished!", endBody ? "A body." : undefined)]);
          if (!validate(stack).valid) return true;
          const before = cards.filter((c) => (textsOf(c)[1] ?? "").length <= 120).length;
          const detailed = finaliseGeneratedStackDetailed(stack, prompt === undefined ? {} : { prompt });
          const out = detailed.stack;
          const after = out.cards.filter((c) => c.kind === "flash" && (textsOf(c)[1] ?? "").length <= 120).length;
          // TASK-32b.2: a repeated card is removed on purpose (its twin stays).
          return after >= before - detailed.removedRepeats;
        },
      ),
      { numRuns: 400 },
    );
  }, 30_000);
});

describe("TASK-30a (review fix): a vocabulary card with a long back is never folded, and 'the last card' alone is not a request", () => {
  const G2_PROMPT =
    "Irish praise phrases for 4th class: flash cards for Hello, Thank you, Brilliant and Well done, in that order, then the last card.";
  const G2_GOODBYE_PROMPT = G2_PROMPT.replace("then the last card.", "then a kind goodbye message on the last card.");
  const WELL_DONE_BACK =
    "Maith thú (mah hoo) means well done to one person in Irish. Say Maith sibh to a group of people. Teachers say it a lot when a pupil gets something right.";
  const g2 = (wellDoneBack: string): Stack =>
    deck([
      flash(0, "Hello", "Dia dhuit (dee-ah gwit) means hello in Irish. Say it when you meet someone.", 1),
      flash(1, "Thank you", "Go raibh maith agat (guh rev mah ag-ut) means thank you in Irish. Use it when someone helps you.", 2),
      flash(2, "Brilliant", "Iontach (UN-tuch) means brilliant or wonderful in Irish. Use it when something is really great.", 3),
      flash(3, "Well done", wellDoneBack, 4),
      end(4, "You learned four Irish praise phrases", "Well done! Try using Dia dhuit, Go raibh maith agat, Iontach and Maith thú in class this week."),
    ], "Irish praise phrases for 4th class");

  it("TASK-30a: the 153-character, three-sentence 'Well done' back is a real card (both prompt variants)", () => {
    expect(WELL_DONE_BACK.length).toBeGreaterThan(150);
    expect(isLongProse(WELL_DONE_BACK)).toBe(true);
    for (const prompt of [G2_PROMPT, G2_GOODBYE_PROMPT]) {
      const out = finaliseGeneratedStackDetailed(g2(WELL_DONE_BACK), { prompt });
      expect(out.movedClosingMessage, prompt).toBe(false);
      expect(out.stack.cards, prompt).toHaveLength(5);
      expect(textsOf(out.stack.cards[3]!)[0]).toBe("Well done");
      expect(textsOf(out.stack.cards[4]!)[0]).toBe("You learned four Irish praise phrases");
    }
  });

  it("TASK-30a: 'then the last card' / 'end with the last card' alone do not ask for a message", () => {
    expect(asksForClosingMessage(G2_PROMPT)).toBe(false);
    expect(asksForClosingMessage("a quiz about Vikings, then end with the last card")).toBe(false);
    expect(asksForClosingMessage("flash cards of Irish words, then the last card")).toBe(false);
    expect(asksForClosingMessage(G2_GOODBYE_PROMPT)).toBe(true);
    expect(asksForClosingMessage("a long encouraging message on the last card")).toBe(true);
    expect(asksForClosingMessage("the final card should say some kind words")).toBe(true);
    expect(asksForClosingMessage("end with a congratulations")).toBe(true);
    expect(asksForClosingMessage("a sign-off")).toBe(true);
  });

  it("TASK-30a: a short term is not a sentence; 'You did it!' is", () => {
    expect(isShortTerm("Well done")).toBe(true);
    expect(isShortTerm("Go raibh maith agat")).toBe(true);
    expect(isShortTerm("You did it!")).toBe(false);
    expect(isShortTerm("What is the capital of France")).toBe(false);
    expect(isShortTerm("")).toBe(false);
  });

  it("TASK-30a: the vocabulary guard stands alone — even when the sentence asks and the end card has no body", () => {
    const d = g2(WELL_DONE_BACK);
    d.cards[4] = end(4, "Finished!");
    expect(foldEndLikeCard(d, { prompt: G2_GOODBYE_PROMPT })).toBe(d);
  });

  it("TASK-30a: the 29k repro still folds (front 'You did it!' is a sentence, the other card is a quiz)", () => {
    const quiz: Card = {
      id: id(10), kind: "quiz", actions: [],
      elements: [
        { type: "text", id: id(110), x: 48, y: 104, w: 704, h: 144, content: "Who sailed longships to Ireland?" },
        { type: "button", id: id(210), x: 48, y: 296, w: 344, h: 88, label: "Vikings", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(40) }] },
        { type: "button", id: id(211), x: 408, y: 296, w: 344, h: 88, label: "Romans", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(40) }] },
      ],
    };
    const d = deck([quiz, flash(40, "You did it!", LONG, 50), end(50, "Finished!", "A body.")]);
    expect(finaliseGeneratedStackDetailed(d, { prompt: "a quiz about Vikings, with a long encouraging message on the last card" }).movedClosingMessage).toBe(true);
  });

  it("TASK-31g: property — finalising never removes a card, and every original front is still on some card, for any prompt (unless a closing message was moved)", () => {
    const word = fc.stringMatching(/^[A-Za-z]{2,10}$/);
    const term = fc.oneof(
      fc.constantFrom("Well done", "Congratulations", "Brilliant", "Great job", "Thank you", "The end", "Bravo", "All done"),
      fc.array(word, { minLength: 1, maxLength: 4 }).map((w) => w.join(" ")),
    );
    const back = fc.oneof(
      word,
      fc.constantFrom("Q0", "Q1", "A4", "No 5", "Q12"),
      fc.constant(LONG),
      fc.constant(WELL_DONE_BACK),
      fc.string({ minLength: 0, maxLength: 200 }),
    );
    const promptArb = fc.oneof(fc.string(), fc.constantFrom(G2_PROMPT, G2_GOODBYE_PROMPT, "a long encouraging message on the last card"));
    // Seeds and run counts can be set from the environment to hammer it (FC_SEED=… FC_RUNS=5000).
    const seed = process.env["FC_SEED"];
    const runs = Number(process.env["FC_RUNS"] ?? 500);
    fc.assert(
      fc.property(
        fc.array(fc.tuple(term, back), { minLength: 2, maxLength: 6 }),
        promptArb,
        fc.boolean(),
        (pairs, prompt, endBody) => {
          const cards: Card[] = pairs.map(([f, b], i) => flash(i, f, b.trim().length === 0 ? "x" : b, i + 1));
          const stack = deck([...cards, end(pairs.length, "Finished!", endBody ? "A body." : undefined)]);
          if (!validate(stack).valid) return true;
          const out = finaliseGeneratedStackDetailed(stack, { prompt });
          if (out.movedClosingMessage) return true; // a fold is the one allowed removal
          // TASK-32b: a repeated card (its twin keeps the same front) and cards
          // beyond a count the sentence named are the other allowed removals.
          const trimmed =
            (out.requested.flash !== undefined ? Math.max(0, out.written.flash - out.requested.flash) : 0) +
            (out.requested.quiz !== undefined ? Math.max(0, out.written.quiz - out.requested.quiz) : 0);
          const nonEnd = out.stack.cards.filter((c) => c.kind !== "end");
          if (nonEnd.length !== cards.length - out.removedRepeats - trimmed) return false;
          if (trimmed > 0) return validate(out.stack).valid;
          const allTexts = out.stack.cards.flatMap((c) => textsOf(c));
          return pairs.every(([f]) => allTexts.some((t) => t.includes(f.trim()) || t === f.trim()));
        },
      ),
      {
        numRuns: runs,
        ...(seed !== undefined ? { seed: Number(seed) } : {}),
        // The counterexample from our gate run (seed 1135286996): a real back "Q0".
        examples: [[[["aa", "AA"], ["Well done", "Q0"]], G2_PROMPT, false]],
      },
    );
  }, 120_000);

  it("TASK-31g: a short real back such as 'Q0', 'Q1', 'A4' or 'No 5' is kept; a real header is still dropped", () => {
    for (const back of ["Q0", "Q1", "A4", "No 5", "Q12"]) {
      const d = deck([flash(0, "aa", back, 1), end(1)]);
      const card = finaliseGeneratedStack(d).cards[0]!;
      expect(card.kind, back).toBe("flash");
      expect(textsOf(card), back).toEqual(["aa", back]);
    }
    for (const header of ["Question 3 of 6", "Card 2", "Q3 of 6"]) {
      const d = deck([flash(0, "aa", "AA", 1), end(1)]);
      d.cards[0]!.elements.unshift({ type: "text", id: id(777), x: 48, y: 20, w: 300, h: 40, content: header });
      const card = finaliseGeneratedStack(d).cards[0]!;
      expect(textsOf(card), header).toEqual(["aa", "AA"]);
    }
  });
});

describe("TASK-30a: the stream `done` carries the flag, and the Maker says so", () => {
  function collector(): { sink: LineSink; lines: GenerateStreamMessage[] } {
    const lines: GenerateStreamMessage[] = [];
    return { lines, sink: { write: (o) => void lines.push(o), end: () => {} } };
  }
  const quiz = (): Card => ({
    id: id(10), kind: "quiz", actions: [],
    elements: [
      { type: "text", id: id(110), x: 48, y: 104, w: 704, h: 144, content: "Who sailed longships to Ireland?" },
      { type: "button", id: id(210), x: 48, y: 296, w: 344, h: 88, label: "Vikings", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: id(40) }] },
      { type: "button", id: id(211), x: 408, y: 296, w: 344, h: 88, label: "Romans", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: id(40) }] },
    ],
  });

  it("a folded closing message sets movedClosingMessage on `done`; an untouched deck does not", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const run = async (cards: Card[], prompt: string): Promise<Extract<GenerateStreamMessage, { type: "done" }>> => {
      const stack = deck(cards);
      const lines = [JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: THEME }), ...stack.cards.map((c) => JSON.stringify({ kind: "card", card: c }))].join("\n") + "\n";
      const { sink, lines: out } = collector();
      await streamGenerate({ prompt }, sink, {
        callStream: async function* () { yield lines; },
        generate: vi.fn() as never,
        sleep: async () => {},
      });
      return out.find((m) => m.type === "done") as never;
    };
    const folded = await run([quiz(), flash(40, "You did it!", LONG, 50), end(50)], "a quiz with a long message on the last card");
    expect(folded.movedClosingMessage).toBe(true);
    expect(folded.stack.cards.map((c) => c.kind)).toEqual(["quiz", "end"]);

    const plain = await run(
      [flash(0, "Hello", "Dia duit", 1), flash(1, "Well done", "Maith thú", 2), end(2, "You learned two phrases!")],
      "Irish praise phrases",
    );
    expect(plain.movedClosingMessage).toBeUndefined();
    expect(plain.stack.cards).toHaveLength(3);
  });

  it("the client keeps the flag from `done`, and the notice wording is the specified sentence", async () => {
    expect(CLOSING_MESSAGE_NOTE).toBe("We moved your closing message onto the last card.");
    const stack = deck([quiz(), end(50)]);
    const body =
      JSON.stringify({ type: "start", total: 0, title: "T", isFallback: false }) + "\n" +
      JSON.stringify({ type: "done", stack, isFallback: false, movedClosingMessage: true }) + "\n";
    const fakeFetch = (async () => new Response(body, { status: 200, headers: { "Content-Type": "application/x-ndjson" } })) as typeof fetch;
    const outcome = await generateStackStream("x", {}, fakeFetch);
    expect(outcome.ok && outcome.movedClosingMessage).toBe(true);
  });
});
