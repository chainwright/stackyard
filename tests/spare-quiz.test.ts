// tests/spare-quiz.test.ts
// TASK-36c4b: ask the model for one spare quiz card, keep exactly N.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { build, buildStream, buildRetry, cardPlan, promptCounts } from "../server/promptBuilder.js";
import { finaliseGeneratedStackDetailed } from "../server/normalizeGenerated.js";
import { qualityNotes } from "../src/shared/qualityNotes.js";
import { validate } from "../src/shared/validator.js";
import { checkReachability } from "../src/shared/reachability.js";
import { spareCost } from "../scripts/spare-cost.js";
import { readFileSync } from "node:fs";
import type { ButtonElement, Card, Stack } from "../src/shared/types.js";

const all = (p: string): string[] => [build({ prompt: p }).user, buildStream({ prompt: p }).user, buildRetry({ prompt: p }, ["x"]).user];

describe("TASK-36c4b: the prompts ask for one spare quiz card only when a quiz count was named", () => {
  it("TASK-36c4b: N parsed → N + 1 asked, in the stream, one-shot and retry prompts; the spare is named only in the prompt", () => {
    for (const [sentence, n] of [["a 6-question quiz on the water cycle", 6], ["five questions about magnets and two flash cards", 5], ["a 1-question quiz", 1]] as const) {
      expect(promptCounts(sentence)).toMatchObject({ quiz: n + 1, spare: true });
      for (const u of all(sentence)) {
        expect(u).toContain(`exactly ${n + 1} quiz cards (the last quiz card is a spare and may be removed)`);
        expect(u).toContain(`Write the end card only after quiz card ${n + 1}.`);
      }
    }
    // Flash counts get no spare.
    expect(cardPlan("five questions and two flash cards")).toContain("exactly 2 flash cards,");
  });

  it("TASK-36c4b: no quiz count named → no spare and no change (flash-only, total-only, none)", () => {
    for (const s of ["a quiz about the Vikings", "two flash cards on rocks", "a 10-card quiz on fractions"]) {
      expect(promptCounts(s).spare).toBe(false);
      for (const u of all(s)) expect(u).not.toContain("spare");
    }
    expect(cardPlan("two flash cards on rocks")).toBe("Card plan: exactly 2 flash cards, 1 end card.");
    expect(build({ prompt: "a 10-card quiz on fractions" }).user).toContain("Write exactly 10 cards before the end card.");
    // At the 20-card cap there is no room for a spare.
    expect(promptCounts("a 20-question quiz").spare).toBe(false);
  });

  it("TASK-36c4b: the teacher never sees the word 'spare' (only the server prompt carries it)", () => {
    for (const f of ["src/shared/qualityNotes.ts", "src/editor/StartScreen.tsx", "src/editor/EditorScreen.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/\bspare\b/i);
    }
  });
});

// ---------------------------------------------------------------------------
// The property: any parsed N, any valid model deck with ≥ N quiz cards.

const id = (n: number): string => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
function quiz(n: number, next: string): Card {
  return {
    id: id(n), kind: "quiz",
    elements: [
      { type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 128, content: `Water question number ${n}?` },
      ...[0, 1, 2].map((i): ButtonElement => ({
        type: "button", id: id(n * 100 + 10 + i), x: i % 2 === 0 ? 48 : 408, y: i < 2 ? 296 : 432, w: 344, h: 88,
        label: `Answer ${i} for question ${n}`,
        actions: [{ type: "score", delta: i === 0 ? 1 : 0 }, { type: "sound", sound: i === 0 ? "cheer" : "buzz" }, { type: "goto", cardId: next }],
      })),
    ],
    actions: [],
  };
}
function flash(n: number, next: string): Card {
  return {
    id: id(n), kind: "flash",
    elements: [
      { type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 128, content: `Term ${n}` },
      { type: "text", id: id(n * 100 + 2), x: 48, y: 260, w: 704, h: 128, content: `What term ${n} means.` },
      { type: "button", id: id(n * 100 + 3), x: 408, y: 496, w: 344, h: 56, label: "Next Card", actions: [{ type: "goto", cardId: next }] },
    ],
    actions: [],
  };
}
/** A story fork: both choices go to their own consequence, which goes on to `next`. */
function story(n: number, next: string): Card[] {
  const a = n + 1, b = n + 2;
  const choice = (i: number, to: number): ButtonElement => ({ type: "button", id: id(n * 100 + 10 + i), x: 48 + i * 360, y: 400, w: 344, h: 88, label: `Choice ${i} of story ${n}`, actions: [{ type: "goto", cardId: id(to) }] });
  const cons = (c: number): Card => ({
    id: id(c), kind: "story",
    elements: [
      { type: "text", id: id(c * 100 + 1), x: 48, y: 104, w: 704, h: 200, content: `What happened after choice ${c}.` },
      { type: "button", id: id(c * 100 + 10), x: 408, y: 496, w: 344, h: 72, label: "Continue", actions: [{ type: "goto", cardId: next }] },
    ],
    actions: [],
  });
  return [
    { id: id(n), kind: "story", elements: [{ type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 200, content: `Story ${n}: what should the raindrop do?` }, choice(0, a), choice(1, b)], actions: [] },
    cons(a),
    cons(b),
  ];
}

/** A linear deck from a list of kinds, every card going on to the next, then the end. */
function deckOf(kinds: Array<"q" | "f" | "s">): Stack {
  const END = id(0xfff);
  let n = 1;
  const starts = kinds.map((k) => { const s = n; n += k === "s" ? 3 : 1; return s; });
  const cards: Card[] = [];
  kinds.forEach((k, i) => {
    const next = i + 1 < kinds.length ? id(starts[i + 1]!) : END;
    if (k === "q") cards.push(quiz(starts[i]!, next));
    else if (k === "f") cards.push(flash(starts[i]!, next));
    else cards.push(...story(starts[i]!, next));
  });
  cards.push({ id: END, kind: "end", elements: [{ type: "text", id: id(0xffe), x: 48, y: 120, w: 704, h: 72, content: "You finished" }], actions: [] });
  return { id: id(0xffd), title: "Water", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" }, cards };
}

const quizzes = (s: Stack): number => s.cards.filter((c) => c.kind === "quiz").length;

describe("TASK-36c4b: the server keeps exactly N", () => {
  it("TASK-36c4b: property — for any parsed N and any valid model deck with ≥ N quiz cards, the finalised deck has exactly N, validates and every card stays reachable", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 0, max: 3 }),
        fc.array(fc.constantFrom<"f" | "s">("f", "f", "s"), { maxLength: 3 }),
        fc.array(fc.nat(), { maxLength: 3 }),
        (n, extra, others, at) => {
          const kinds: Array<"q" | "f" | "s"> = Array.from({ length: n + extra }, () => "q" as const);
          others.forEach((k, i) => kinds.splice((at[i] ?? 0) % (kinds.length + 1), 0, k));
          const input = deckOf(kinds);
          expect(validate(input).valid).toBe(true);
          const out = finaliseGeneratedStackDetailed(input, { prompt: `a ${n}-question quiz on the water cycle` }).stack;
          expect(quizzes(out)).toBe(n);
          expect(validate(out).valid).toBe(true);
          const r = checkReachability(out);
          expect(r.unreachable).toEqual([]);
          expect(r.ok).toBe(true);
          // Flash and story cards are never trimmed.
          expect(out.cards.filter((c) => c.kind !== "quiz").length).toBe(input.cards.filter((c) => c.kind !== "quiz").length);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("TASK-36c4b: exactly N written → nothing trimmed; fewer than N → the shortfall notice stays", () => {
    const six = deckOf(["f", "q", "q", "s", "q", "q", "f", "q", "q"]);
    const out = finaliseGeneratedStackDetailed(six, { prompt: "a 6-question quiz" });
    expect(out.stack.cards.map((c) => c.id)).toEqual(six.cards.map((c) => c.id));
    const five = deckOf(["q", "q", "s", "q", "q", "q"]);
    const o5 = finaliseGeneratedStackDetailed(five, { prompt: "a 6-question quiz" });
    expect(quizzes(o5.stack)).toBe(5);
    expect(qualityNotes("a 6-question quiz", o5.stack, o5.removedRepeats)).toContain("You asked for 6 questions; the model wrote 5.");
  });

  it("TASK-36c4b: the spare (the last quiz card) is the one removed, and the deck before it now reaches the end card", () => {
    const seven = deckOf(["q", "q", "q", "q", "q", "q", "q"]);
    const out = finaliseGeneratedStackDetailed(seven, { prompt: "a 6-question quiz" }).stack;
    expect(out.cards.map((c) => c.id)).toEqual(seven.cards.filter((c) => c.id !== seven.cards[6]!.id).map((c) => c.id));
  });
});

describe("TASK-36c4b: the cost of one spare quiz card, measured on the fixtures", () => {
  it("TASK-36c4b: 837 characters (+14.4 % of the stream, about 209 output tokens) with today's why; 425–504 without — the figures in the spec", () => {
    const c = spareCost();
    expect(c).toEqual({ quizLineChars: 837, streamChars: 5806, percentAdded: 14.4, tokensAdded: 209, fixtureRange: [425, 504] });
    const spec = readFileSync(".kiro/specs/stack-generator/tasks.md", "utf8");
    expect(spec).toContain("one quiz card line is 837 characters, +14.4 % of the 5,806-character stream. That is about 209 output tokens");
    expect(spec).toContain("one quiz card line is 425–504 characters");
  });
});
