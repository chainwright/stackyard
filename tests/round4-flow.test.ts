// tests/round4-flow.test.ts
// TASK-28h (insert splices links for every card type) and TASK-28m (every
// default placeholder label is flagged). J4 P1-1, J2 P1.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  addCardAfter,
  addAnswer,
  addTextElement,
  addButtonElement,
  repairFlow,
  takeLastInsertedCardId,
  takeLastInsertNote,
} from "../src/editor/operations.js";
import { outTargets } from "../src/shared/flow.js";
import { isRejected } from "../src/editor/types.js";
import { validate } from "../src/shared/validator.js";
import {
  checkReachability,
  isPlaceholderCard,
  PLACEHOLDER_WORDS,
  describeProblems,
} from "../src/shared/reachability.js";
import { vikingsStack, timesTablesStack, irishWordsStack } from "../src/shared/readyMadeStacks.js";
import type { Card, Stack } from "../src/shared/types.js";

function asStack(r: Stack | { rejected: true; message: string }): Stack {
  if (isRejected(r as never)) throw new Error("rejected: " + (r as { message: string }).message);
  return r as Stack;
}

const DECKS: Array<[string, () => Stack]> = [
  ["vikings (quiz, flash, story)", vikingsStack],
  ["times tables (quiz only)", timesTablesStack],
  ["irish words (flash)", irishWordsStack],
];

/** The flow problems the splice is responsible for (placeholders are expected on a new card). */
function flowProblems(stack: Stack, allowUnreachable: string | null = null): string[] {
  const r = checkReachability(stack);
  return [
    ...r.unreachable.filter((c) => c.id !== allowUnreachable).map((c) => `unreachable ${c.id}`),
    ...r.trapped.map((c) => `trapped ${c.id}`),
    ...r.stuck.map((c) => `stuck ${c.id}`),
    ...r.deadEndQuiz.map((c) => `quiz dead end ${c.id}`),
    ...r.deadEndOther.map((c) => `dead end ${c.id}`),
  ];
}

describe("TASK-28h: + Add Card after ANY card type keeps every card reachable", () => {
  for (const [name, build] of DECKS) {
    it(`${name}: every insertion point × every kind → all reachable, all can finish (a fork leaves the new card for the teacher to place — TASK-29a)`, () => {
      const base = build();
      const nonEnd = base.cards.filter((c) => c.kind !== "end");
      for (const after of nonEnd) {
        for (const kind of ["quiz", "flash", "story"] as const) {
          const next = asStack(addCardAfter(base, after.id, kind));
          const newId = takeLastInsertedCardId()!;
          const note = takeLastInsertNote();
          const fork = outTargets(after).length >= 2;
          expect(validate(next).valid, `${after.kind}→${kind}`).toBe(true);
          expect(flowProblems(next, fork ? newId : null), `${name}: ${after.kind} then ${kind}`).toEqual([]);
          expect(checkReachability(next).reachable.has(newId)).toBe(!fork);
          expect(note !== null, "the fork note").toBe(fork);
        }
      }
    });
  }

  it("property: a random chain of insertions on a ready-made deck stays fully linked", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: DECKS.length - 1 }),
        fc.array(fc.tuple(fc.nat(30), fc.constantFrom("quiz", "flash", "story")), { minLength: 1, maxLength: 6 }),
        (deckIx, steps) => {
          let stack = DECKS[deckIx]![1]();
          for (const [pick, kind] of steps) {
            const candidates = stack.cards.filter((c) => c.kind !== "end");
            const after = candidates[pick % candidates.length]!;
            const fork = outTargets(after).length >= 2;
            stack = asStack(addCardAfter(stack, after.id, kind as Card["kind"]));
            const newId = takeLastInsertedCardId();
            takeLastInsertNote();
            if (!validate(stack).valid) return false;
            // A fork leaves the new card unreachable until the teacher places it; then stop this chain.
            if (flowProblems(stack, fork ? newId : null).length > 0) return false;
            if (fork) return true;
          }
          return true;
        },
      ),
      { numRuns: 200 },
    );
  }, 30_000);

  it("the exact J4 repro: a quiz added after a flash card is reachable, with the flash Next pointing at it", () => {
    const base = irishWordsStack();
    const flash = base.cards[0]!;
    const next = asStack(addCardAfter(base, flash.id, "quiz"));
    const newId = takeLastInsertedCardId()!;
    const flashAfter = next.cards.find((c) => c.id === flash.id)!;
    const nextBtn = flashAfter.elements.find((e) => e.type === "button");
    expect(nextBtn && nextBtn.type === "button" && nextBtn.actions.some((a) => a.type === "goto" && a.cardId === newId)).toBe(true);
  });
});

describe("TASK-28h: 'Link these in for me' (repairFlow) splices unreachable cards", () => {
  function strand(base: Stack, afterIndex: number, kind: Card["kind"]): Stack {
    // Insert a card the OLD way: placed in the array with no link from the card before.
    const fresh = asStack(addCardAfter(base, base.cards[afterIndex]!.id, kind));
    const id = takeLastInsertedCardId()!;
    const cards = fresh.cards.map((c, i) => {
      if (i !== afterIndex) return c;
      // Point the card before back at the card that follows the new one.
      const follower = fresh.cards[afterIndex + 2]!;
      return JSON.parse(JSON.stringify(c).replaceAll(id, follower.id)) as Card;
    });
    return { ...fresh, cards };
  }

  it("clears an unreachable card that follows a flash card", () => {
    const broken = strand(irishWordsStack(), 2, "quiz");
    expect(checkReachability(broken).unreachable.length).toBeGreaterThan(0);
    const fixed = asStack(repairFlow(broken));
    expect(validate(fixed).valid).toBe(true);
    expect(checkReachability(fixed).unreachable).toEqual([]);
    expect(flowProblems(fixed)).toEqual([]);
  });

  it("an unreachable card that follows a story card with CHOICES is not clipped on: the fork keeps its buttons (TASK-30i)", () => {
    const base = vikingsStack();
    // The story card with two choices.
    const storyIx = base.cards.findIndex((c) => c.kind === "story" && c.elements.filter((e) => e.type === "button").length >= 2);
    const broken = strand(base, storyIx, "flash");
    const forkBefore = broken.cards[storyIx]!.elements.filter((e) => e.type === "button").length;
    const fixed = asStack(repairFlow(broken));
    expect(validate(fixed).valid).toBe(true);
    expect(fixed.cards[storyIx]!.elements.filter((e) => e.type === "button")).toHaveLength(forkBefore);
  });
});

describe("TASK-28m: every default placeholder word is flagged before sharing", () => {
  const cardWith = (kind: Card["kind"], textContent: string | null, buttonLabel: string | null): Card => ({
    id: "11111111-1111-4111-8111-111111111111",
    kind,
    actions: [],
    elements: [
      ...(textContent !== null ? [{ type: "text" as const, id: "22222222-2222-4222-8222-222222222222", x: 0, y: 0, w: 100, h: 50, content: textContent }] : []),
      ...(buttonLabel !== null
        ? [{ type: "button" as const, id: "33333333-3333-4333-8333-333333333333", x: 0, y: 60, w: 100, h: 50, label: buttonLabel, actions: [] }]
        : []),
    ],
  });

  for (const [key, word] of Object.entries(PLACEHOLDER_WORDS)) {
    it(`${key}: "${word}" in a text or on a button flags the card`, () => {
      expect(isPlaceholderCard(cardWith("story", word, null)), "as text").toBe(true);
      expect(isPlaceholderCard(cardWith("quiz", "A real question?", word)), "as a button").toBe(true);
    });
  }

  it("a real card is not flagged", () => {
    expect(isPlaceholderCard(cardWith("quiz", "What is 2 + 2?", "Four"))).toBe(false);
  });

  it("'+ Add an answer' left as 'Another answer' stops the export (the J2 repro)", () => {
    const base = timesTablesStack();
    const quiz = base.cards.find((c) => c.kind === "quiz")!;
    // Make room: drop the last answer tile, then add one the way the teacher does.
    const lastBtn = [...quiz.elements].reverse().find((e) => e.type === "button")!;
    const roomy: Stack = {
      ...base,
      cards: base.cards.map((c) => (c.id === quiz.id ? { ...c, elements: c.elements.filter((e) => e !== lastBtn) } : c)),
    };
    const withAnswer = asStack(addAnswer(roomy, quiz.id));
    expect(withAnswer.cards.find((c) => c.id === quiz.id)!.elements.some((e) => e.type === "button" && e.label === "Another answer")).toBe(true);
    const report = checkReachability(withAnswer);
    expect(report.ok).toBe(false);
    expect(report.placeholders.map((c) => c.id)).toContain(quiz.id);
    const lines = describeProblems(report, () => "Card 1");
    expect(lines.join(" ")).toContain("still has the words it started with");
  });

  it("'Add Text' / 'Add Button' left at their defaults are flagged too", () => {
    // A story card with real words and room, so the add succeeds.
    const base = vikingsStack();
    const story = base.cards.find((c) => c.kind === "story")!;
    const roomy = (card: Card): Card => ({
      ...card,
      elements: card.elements.filter((e) => e.type !== "button").map((e) => (e.type === "text" ? { ...e, h: 60 } : e)),
    });
    const stack: Stack = { ...base, cards: base.cards.map((c) => (c.id === story.id ? roomy(c) : c)) };
    const withText = asStack(addTextElement(stack, story.id));
    expect(checkReachability(withText).placeholders.map((c) => c.id)).toContain(story.id);
    const withButton = asStack(addButtonElement(stack, story.id));
    expect(checkReachability(withButton).placeholders.map((c) => c.id)).toContain(story.id);
  });

  it("the ready-made decks have no placeholders", () => {
    for (const [, build] of DECKS) expect(checkReachability(build()).placeholders).toEqual([]);
  });
});
