// tests/maker/swap-wrong-answer.test.ts
// TASK-35a1 (replacement candidates from this deck) and TASK-35a2 (the
// swapWrongAnswer edit), .kiro/specs/maker/tasks.md Phase 20. No model call.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { swapCandidates, MAX_SWAP_CANDIDATES, wouldBeJoke } from "../../src/editor/swapCandidates.js";
import { swapWrongAnswer, MAX_ANSWER_LABEL } from "../../src/editor/operations.js";
import { isRejected } from "../../src/editor/types.js";
import { EditorStore } from "../../src/editor/store.js";
import { validate } from "../../src/shared/validator.js";
import { jokeAnswerReason, normaliseText, quizAnswers, rightAnswer } from "../../src/shared/lessonCheck.js";
import type { ButtonElement, Card, Stack } from "../../src/shared/types.js";

const id = (n: number): string => `${n.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;

function storage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

/** A quiz card: question, then answers (the first is right). */
function quiz(n: number, question: string, answers: string[], next: string): Card {
  return {
    id: id(n),
    kind: "quiz",
    elements: [
      { type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 128, content: question },
      ...answers.map((label, i): ButtonElement => ({
        type: "button",
        id: id(n * 100 + 10 + i),
        x: i % 2 === 0 ? 48 : 408, y: i < 2 ? 296 : 432, w: 344, h: 88,
        label,
        actions: [{ type: "score", delta: i === 0 ? 1 : 0 }, { type: "sound", sound: i === 0 ? "cheer" : "buzz" }, { type: "goto", cardId: next }],
      })),
    ],
    actions: [],
  };
}
function flash(n: number, term: string, back: string): Card {
  return {
    id: id(n),
    kind: "flash",
    elements: [
      { type: "text", id: id(n * 100 + 1), x: 48, y: 104, w: 704, h: 128, content: term },
      { type: "text", id: id(n * 100 + 2), x: 48, y: 260, w: 704, h: 128, content: back },
    ],
    actions: [],
  };
}
const END = id(9999);
const end: Card = { id: END, kind: "end", elements: [], actions: [] };
const deck = (cards: Card[]): Stack => ({ id: id(1), title: "Light", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" }, cards: [...cards, end] });

/** The light deck: card 2 is the one we swap on. */
function lightDeck(): Stack {
  return deck([
    flash(2, "Light source", "Something that makes its own light."),
    quiz(3, "Which of these is a light source?", ["The Sun", "A chair", "A mirror"], id(4)),
    quiz(4, "Which of these reflects light well?", ["A mirror", "A torch", "A book"], id(5)),
    quiz(5, "Which makes a shadow?", ["An opaque object", "A glass window", "It glows in the dark", "the sun!"], id(6)),
    quiz(6, "What do we need to see things?", ["Light", "Sound", "A candle", "Shadow"], END),
    flash(7, "Shadow", "A dark shape where light is blocked."),
  ]);
}
const card3 = id(3);
const chair = id(3 * 100 + 11);
const sun = id(3 * 100 + 10);

describe("TASK-35a1: replacement candidates come from this deck only, filtered and ranked", () => {
  it("TASK-35a1: never this card's right answer, never already on the card (case and punctuation ignored), never a joke, never empty", () => {
    const s = lightDeck();
    const got = swapCandidates(s, card3, chair);
    const keys = got.map(normaliseText);
    expect(keys).not.toContain("the sun"); // the right answer, also typed as "the sun!" on card 5
    expect(keys).not.toContain("a mirror"); // already on this card (and the right answer on card 4)
    expect(keys).not.toContain("a chair");
    expect(got).not.toContain("It glows in the dark"); // a suspected joke (the "glowing" marker)
    expect(got.every((c) => c.trim().length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("TASK-35a1: sources are the other quiz cards' answers (right and wrong) and the flash terms; ranked by shared words, ties in deck order; at most 6", () => {
    const s = lightDeck();
    const got = swapCandidates(s, card3, chair);
    expect(got).toHaveLength(MAX_SWAP_CANDIDATES);
    // "Light source" and "Light" share words with "Which of these is a light source?": first.
    expect(got.slice(0, 2)).toEqual(["Light source", "Light"]);
    // The rest keep deck order (no shared words): card 4's, then card 5's answers.
    expect(got.slice(2)).toEqual(["A torch", "A book", "An opaque object", "A glass window"]);
    // A flash BACK is never a source.
    expect(got).not.toContain("Something that makes its own light.");
  });

  it("TASK-35a1: deterministic — the same deck gives the same list, and none for the right answer or a non-quiz card", () => {
    const s = lightDeck();
    expect(swapCandidates(s, card3, chair)).toEqual(swapCandidates(structuredClone(s), card3, chair));
    expect(swapCandidates(s, card3, sun)).toEqual([]);
    expect(swapCandidates(s, id(2), id(201))).toEqual([]);
  });

  it("TASK-35a1: a label longer than the answer limit is never offered", () => {
    const long = "x".repeat(MAX_ANSWER_LABEL + 1);
    const s = deck([quiz(3, "Q one?", ["Yes", "No"], id(4)), quiz(4, "Q two?", ["Right one", long], END)]);
    expect(swapCandidates(s, card3, id(311))).toEqual(["Right one"]);
  });
});

describe("TASK-35a2: swapWrongAnswer is one validated edit", () => {
  it("TASK-35a2: it changes only that wrong answer's label (trimmed); its score, sound and goto stay", () => {
    const s = lightDeck();
    const out = swapWrongAnswer(s, card3, chair, "  A torch  ");
    expect(isRejected(out)).toBe(false);
    const after = (out as Stack).cards[1]!.elements.find((e) => e.id === chair) as ButtonElement;
    const before = s.cards[1]!.elements.find((e) => e.id === chair) as ButtonElement;
    expect(after.label).toBe("A torch");
    expect(after.actions).toEqual(before.actions);
    expect({ ...(out as Stack), cards: (out as Stack).cards.map((c) => (c.id === card3 ? null : c)) }).toEqual({ ...s, cards: s.cards.map((c) => (c.id === card3 ? null : c)) });
  });

  it("TASK-35a2: it rejects the right answer, an empty or over-long label, a duplicate on the card and the answer's own label", () => {
    const s = lightDeck();
    const msg = (r: Stack | { rejected: true; message: string }) => (isRejected(r) ? r.message : "accepted");
    expect(msg(swapWrongAnswer(s, card3, sun, "A torch"))).toBe("That's the right answer. Swap a wrong one.");
    expect(msg(swapWrongAnswer(s, card3, chair, "   "))).toMatch(/needs some words/);
    expect(msg(swapWrongAnswer(s, card3, chair, "x".repeat(MAX_ANSWER_LABEL + 1)))).toMatch(/80 characters/);
    expect(msg(swapWrongAnswer(s, card3, chair, "a MIRROR."))).toBe("That answer is already on this card. Pick a different one.");
    expect(msg(swapWrongAnswer(s, card3, chair, "the sun"))).toBe("That answer is already on this card. Pick a different one.");
    expect(msg(swapWrongAnswer(s, card3, chair, "A Chair!"))).toBe("That's already this answer. Pick a different one.");
    expect(msg(swapWrongAnswer(s, id(2), id(201), "x"))).toBe("Answers belong on a question card.");
    expect(msg(swapWrongAnswer(s, card3, id(301), "x"))).toBe("That tile isn't an answer on this card.");
  });

  it("TASK-35a2: through the store it is one undo step, and redo puts it back", () => {
    const s = lightDeck();
    const store = new EditorStore({ stack: s, screen: "editor" }, { storage: storage() });
    expect(store.apply((x) => swapWrongAnswer(x, card3, chair, "A torch")).ok).toBe(true);
    const swapped = structuredClone(store.getStack());
    store.undo();
    expect(store.getStack()).toEqual(s);
    store.redo();
    expect(store.getStack()).toEqual(swapped);
  });
});

// ---------------------------------------------------------------------------
// The property: any deck, any wrong answer.

const VOCAB = ["sun", "moon", "torch", "mirror", "shadow", "light", "glass", "candle", "dark", "water", "ice", "rock", "plant", "leaf", "root", "magic", "glows", "sings", "eats it", "turns to ice", "colour"];
const labelArb = fc.array(fc.constantFrom(...VOCAB), { minLength: 1, maxLength: 3 }).chain((ws) =>
  fc.constantFrom(ws.join(" "), ws.join(" ").toUpperCase(), `${ws.join(" ")}!`, ` ${ws.join(" ")} `),
);
const quizArb = fc.record({
  question: labelArb.map((q) => `Which is ${q}?`),
  answers: fc.uniqueArray(labelArb, { minLength: 2, maxLength: 4, selector: normaliseText }),
});
const deckArb = fc
  .record({
    quizzes: fc.array(quizArb, { minLength: 1, maxLength: 6 }),
    terms: fc.array(labelArb, { maxLength: 3 }),
  })
  .map(({ quizzes, terms }) => {
    const n = quizzes.length;
    const cards: Card[] = quizzes.map((q, i) => quiz(10 + i, q.question, q.answers, i + 1 < n ? id(11 + i) : terms.length > 0 ? id(40) : END));
    terms.forEach((t, j) => cards.push(flash(40 + j, t, "Back.")));
    return deck(cards);
  });

describe("TASK-35a2: property — every candidate passes the filters, and applying it is a clean, undoable label swap", () => {
  it("TASK-35a2: for any deck and any wrong answer: candidates are filtered and capped; the stack stays valid, every action is kept, undo restores it exactly", () => {
    fc.assert(
      fc.property(deckArb, fc.nat(), fc.nat(), (s, qSeed, pick) => {
        expect(validate(s).valid).toBe(true);
        const quizzes = s.cards.filter((c) => c.kind === "quiz");
        const card = quizzes[qSeed % quizzes.length]!;
        const right = rightAnswer(card)!;
        const wrongs = quizAnswers(card).filter((b) => b !== right);
        const target = wrongs[qSeed % wrongs.length]!;
        const cands = swapCandidates(s, card.id, target.id);
        expect(cands.length).toBeLessThanOrEqual(MAX_SWAP_CANDIDATES);
        const onCard = new Set(quizAnswers(card).map((a) => normaliseText(a.label)));
        for (const c of cands) {
          expect(normaliseText(c).length).toBeGreaterThan(0);
          expect(normaliseText(c)).not.toBe(normaliseText(right.label));
          expect(onCard.has(normaliseText(c))).toBe(false);
          expect(wouldBeJoke(c, target, card)).toBe(false);
          const trial = { ...target, label: c };
          expect(jokeAnswerReason(trial, { ...card, elements: card.elements.map((e) => (e.id === target.id ? trial : e)) })).toBeNull();
        }
        if (cands.length === 0) return;
        const label = cands[pick % cands.length]!;
        const store = new EditorStore({ stack: s, screen: "editor" }, { storage: storage() });
        const before = structuredClone(store.getStack());
        const res = store.apply((x) => swapWrongAnswer(x, card.id, target.id, label));
        expect(res.ok).toBe(true);
        const after = store.getStack()!;
        expect(validate(after).valid).toBe(true);
        // Every element's actions identical; only that one label changed.
        const flat = (st: Stack) => st.cards.flatMap((c) => c.elements);
        flat(after).forEach((el, i) => {
          const was = flat(before!)[i]!;
          if (el.type === "button" && was.type === "button") {
            expect(el.actions).toEqual(was.actions);
            expect(el.label).toBe(el.id === target.id ? label.trim() : was.label);
          } else expect(el).toEqual(was);
        });
        store.undo();
        expect(store.getStack()).toEqual(before);
        store.redo();
        expect(store.getStack()).toEqual(after);
      }),
      { numRuns: 300 },
    );
  });
});
