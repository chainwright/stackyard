// tests/round5-generation.test.ts
// TASK-29g (quiz does not repeat the flash card), TASK-29h (the first card is
// written the moment it is parsed, and ttfc is logged), TASK-29k (one ending,
// with a body slot), TASK-29p (options fit the question's form).

import { describe, it, expect, vi, afterEach } from "vitest";
import { build, buildStream, buildRetry } from "../server/promptBuilder.js";
import { finaliseGeneratedStack, foldEndLikeCard } from "../server/normalizeGenerated.js";
import { streamGenerate } from "../server/stream-generate.js";
import type { LineSink, StreamGenerateDeps } from "../server/stream-generate.js";
import { isStockEndLine, soundsLikeEnding } from "../src/shared/endLine.js";
import { validate } from "../src/shared/validator.js";
import type { Card, GenerateStreamMessage, Stack } from "../src/shared/types.js";

afterEach(() => vi.restoreAllMocks());

const u = (n: number): string => `e5e50000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };

describe("TASK-29g / 29p: prompt rules are general", () => {
  const all = (): Array<[string, string]> => {
    const r = { prompt: "x" };
    return [
      ["one-shot", build(r).system],
      ["streaming", buildStream(r).system],
      ["retry", buildRetry(r, ["quiz-answer"]).system],
    ];
  };

  it("29g: a quiz must not repeat a flash card's term-and-definition pair word for word", () => {
    for (const [name, sys] of all()) {
      expect(sys, name).toMatch(/must not simply repeat a flash card's term-and-definition pair word for word/);
      expect(sys, name).toMatch(/ask about it differently, or about something else/);
    }
  });

  it("29p: answer options fit the form of the question, with no topic example from a review", () => {
    for (const [name, sys] of all()) {
      expect(sys, name).toMatch(/must fit the form of the question/);
      expect(sys, name).toMatch(/offers only A and B/);
      for (const banned of ["one half or one quarter", "1/8", "eighths", "fractions"]) {
        expect(sys.toLowerCase(), `${name}: ${banned}`).not.toContain(banned);
      }
    }
  });

  it("29k: the end card may carry a longer message in a second text, and the stock example line is not offered", () => {
    for (const [name, sys] of all()) {
      expect(sys, name).toMatch(/SECOND text of up to 300 characters/);
      expect(sys, name).toMatch(/put any longer message THERE/);
      expect(sys, name).toMatch(/never use a flash or story card as a second ending/);
      expect(sys, name).not.toContain("for example \"Well done — you finished!\"");
    }
  });
});

// ---------------------------------------------------------------------------
// 29k — the exact repro

function quizCard(n: number, q: string): Card {
  return {
    id: u(n),
    kind: "quiz",
    actions: [],
    elements: [
      { type: "text", id: u(n + 100), x: 48, y: 104, w: 704, h: 144, content: q },
      { type: "button", id: u(n + 200), x: 48, y: 296, w: 344, h: 88, label: "Vikings", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: u(50) }] },
      { type: "button", id: u(n + 300), x: 408, y: 296, w: 344, h: 88, label: "Romans", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: u(50) }] },
    ],
  };
}
const LONG =
  "You worked hard through every question about the Vikings in Ireland. You learned about longships, Dublin and silver. " +
  "Be proud of what you know, tell someone at home about it tonight, and keep asking questions about the past.";

function fakeEndingDeck(endHeading = "Well done — you finished!"): Stack {
  const flash: Card = {
    id: u(40),
    kind: "flash",
    actions: [],
    elements: [
      { type: "text", id: u(140), x: 48, y: 264, w: 704, h: 88, content: "You did it!" },
      { type: "text", id: u(141), x: 48, y: 360, w: 704, h: 120, content: LONG },
      { type: "button", id: u(240), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: u(50) }] },
    ],
  };
  const quiz = quizCard(10, "Who sailed longships to Ireland?");
  // the quiz answers go to the fake card, as a model would write it
  const q2: Card = { ...quiz, elements: quiz.elements.map((e) => (e.type === "button" ? { ...e, actions: e.actions.map((a) => (a.type === "goto" ? { ...a, cardId: u(40) } : a)) } : e)) };
  const end: Card = {
    id: u(50),
    kind: "end",
    actions: [],
    elements: [
      { type: "text", id: u(150), x: 48, y: 120, w: 704, h: 72, content: endHeading },
      { type: "field", id: u(250), x: 48, y: 420, w: 704, h: 60, variable: "score" },
    ],
  };
  return { id: u(1), title: "Vikings", theme: THEME, cards: [q2, flash, end] };
}
const textsOf = (c: Card): string[] => c.elements.filter((e) => e.type === "text").map((e) => (e.type === "text" ? e.content : ""));

describe("TASK-29k: one ending, with a body slot", () => {
  it("the exact repro: a fake 'You did it!' flash card before the end card is folded into the end card", () => {
    const deck = fakeEndingDeck();
    expect(validate(deck).valid).toBe(true);
    const out = finaliseGeneratedStack(deck);
    expect(validate(out).valid).toBe(true);
    expect(out.cards.map((c) => c.kind)).toEqual(["quiz", "end"]); // no second ending
    const end = out.cards[1]!;
    const [heading, body] = textsOf(end);
    expect(heading).toBe("You did it!"); // the model's own words, not the stock example line
    expect(body).toContain("Be proud of what you know");
    expect(body!.length).toBeLessThanOrEqual(300);
    // The quiz now goes straight to the end card.
    const gotos = out.cards[0]!.elements.flatMap((e) => (e.type === "button" ? e.actions.filter((a) => a.type === "goto") : []));
    expect(gotos.length).toBeGreaterThan(0);
    for (const g of gotos) expect(g).toEqual({ type: "goto", cardId: end.id });
    expect(JSON.stringify(out)).not.toContain("Tap the card");
  });

  it("when the model wrote its OWN end heading, that stays the heading and the sign-off text becomes the body", () => {
    const out = finaliseGeneratedStack(fakeEndingDeck("You finished the Viking quiz — brilliant!"));
    const [heading, body] = textsOf(out.cards[out.cards.length - 1]!);
    expect(heading).toBe("You finished the Viking quiz — brilliant!");
    expect(body).toContain("Be proud of what you know");
  });

  it("leaves a real flash card before the end card alone", () => {
    const deck = fakeEndingDeck();
    const real: Card = { ...deck.cards[1]!, elements: deck.cards[1]!.elements.map((e, i) => (i === 0 && e.type === "text" ? { ...e, content: "Longphort" } : e)) };
    const kept: Stack = { ...deck, cards: [deck.cards[0]!, real, deck.cards[2]!] };
    expect(foldEndLikeCard(kept)).toBe(kept);
    expect(finaliseGeneratedStack(kept).cards.map((c) => c.kind)).toEqual(["quiz", "flash", "end"]);
  });

  it("never folds a quiz card, and never leaves the deck with no playable card", () => {
    const deck = fakeEndingDeck();
    const quizBeforeEnd: Stack = { ...deck, cards: [deck.cards[0]!, deck.cards[2]!] };
    expect(foldEndLikeCard(quizBeforeEnd)).toBe(quizBeforeEnd);
    const onlyFake: Stack = { ...deck, cards: [deck.cards[1]!, deck.cards[2]!] };
    expect(foldEndLikeCard(onlyFake)).toBe(onlyFake);
  });

  it("a longer end message is kept (up to 300 characters) in a second text, and an over-long one is cut at a word", () => {
    const deck = fakeEndingDeck();
    const end = deck.cards[2]!;
    const withBody: Stack = {
      ...deck,
      cards: [
        { ...deck.cards[0]!, elements: deck.cards[0]!.elements.map((e) => (e.type === "button" ? { ...e, actions: e.actions.map((a) => (a.type === "goto" ? { ...a, cardId: end.id } : a)) } : e)) },
        { ...end, elements: [...end.elements, { type: "text", id: u(151), x: 48, y: 204, w: 704, h: 200, content: "Keep going. ".repeat(60) }] },
      ],
    };
    const out = finaliseGeneratedStack(withBody);
    const [, body] = textsOf(out.cards[1]!);
    expect(body!.length).toBeLessThanOrEqual(300);
    expect(body!.endsWith("…")).toBe(true);
  });

  it("endLine helpers: stock lines and sign-off fronts", () => {
    for (const s of ["Well done!", "Well done — you finished!", "well done, you finished", "Great job!", "You did it!"]) expect(isStockEndLine(s), s).toBe(true);
    for (const s of ["Brilliant work on fractions!", "You finished the Viking quiz", "The end"]) expect(isStockEndLine(s), s).toBe(false);
    for (const s of ["You did it!", "Congratulations!", "Well done, explorer", "Brilliant work"]) expect(soundsLikeEnding(s), s).toBe(true);
    for (const s of ["Evaporation", "Longphort", "What is a longship?", "Why did you do it?"]) expect(soundsLikeEnding(s), s).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 29h — time to first card

describe("TASK-29h: the header and the first card are written the moment each is parsed", () => {
  function collector(order: string[]): { sink: LineSink; lines: GenerateStreamMessage[] } {
    const lines: GenerateStreamMessage[] = [];
    return {
      lines,
      sink: {
        write: (o) => {
          lines.push(o);
          order.push(`write:${o.type}`);
        },
        end: () => {},
      },
    };
  }

  it("start and the first card are out before the second chunk is even requested, and ttfc is logged", async () => {
    const stack: Stack = { id: u(1), title: "Rivers", theme: THEME, cards: [quizCard(10, "Longest river?"), { id: u(50), kind: "end", actions: [], elements: [{ type: "field", id: u(250), x: 48, y: 420, w: 704, h: 60, variable: "score" }] }] };
    const q = quizCard(10, "Longest river?");
    const q2: Card = { ...q, elements: q.elements.map((e) => (e.type === "button" ? { ...e, actions: e.actions.map((a) => (a.type === "goto" ? { ...a, cardId: u(50) } : a)) } : e)) };
    stack.cards[0] = q2;
    const header = JSON.stringify({ kind: "stack", id: stack.id, title: stack.title, theme: THEME }) + "\n";
    const card1 = JSON.stringify({ kind: "card", card: stack.cards[0] }) + "\n";
    const card2 = JSON.stringify({ kind: "card", card: stack.cards[1] }) + "\n";

    const order: string[] = [];
    let clock = 1000;
    const callStream: NonNullable<StreamGenerateDeps["callStream"]> = async function* () {
      for (const [name, chunk, tick] of [["header", header, 4000], ["card1", card1, 3000], ["card2", card2, 2000]] as const) {
        clock += tick;
        order.push(`read:${name}`);
        yield chunk;
      }
    };
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sink } = collector(order);
    await streamGenerate({ prompt: "rivers" }, sink, { callStream, generate: vi.fn() as never, sleep: async () => {}, now: () => clock });

    // header written before card1 is read; card1 written before card2 is read.
    expect(order.indexOf("write:start")).toBeLessThan(order.indexOf("read:card1"));
    expect(order.indexOf("write:card")).toBeLessThan(order.indexOf("read:card2"));
    const timing = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("stream timing"));
    expect(timing).toBeDefined();
    expect(timing).toContain("header=4000ms");
    expect(timing).toContain("ttfc=7000ms");
    expect(timing).toContain("total=9000ms");
    expect(timing).not.toMatch(/key|bearer|http/i);
  });
});
