// tests/round8-quality.test.ts
// TASK-32b: generation quality — three or four answers (b1), no repeated cards
// (b2), the counts the teacher asked for (b3), no picture that gives the answer
// away (b4), and the cheap lesson check in "Before you share" (b5). The shapes
// are the ones we measured on live generated decks (9 Nov, 1ce7395).

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { build, buildStream, buildRetry } from "../server/promptBuilder.js";
import { finaliseGeneratedStackDetailed, sanitizeRawStack } from "../server/normalizeGenerated.js";
import { removeRepeatedCards, trimToRequestedCounts, pictureGivesAnswerAway } from "../server/deckQuality.js";
import { parseRequestedCounts, countsInstruction } from "../src/shared/requestedCounts.js";
import {
  lessonWarnings,
  describeLessonWarnings,
  isTwoWayComparison,
  frontKey,
  rightAnswer,
  foldedWords,
} from "../src/shared/lessonCheck.js";
import { beforeYouShare } from "../src/shared/shareCheck.js";
import { qualityNotes } from "../src/editor/StartScreen.js";
import { validate } from "../src/shared/validator.js";
import { reachableIds } from "../src/shared/flow.js";
import { cardRefLabel } from "../src/shared/cardTitle.js";
import { pictogramDataUri, pictogramNameOfSrc, PICTOGRAM_NAMES } from "../src/shared/pictograms.js";
import { PICTURE_SLOT } from "../src/shared/layout.js";
import { vikingsStack, timesTablesStack, irishWordsStack } from "../src/shared/readyMadeStacks.js";
import type { Card, Element, Stack } from "../src/shared/types.js";

let n = 0;
const uid = (): string => `b8b80000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };
const text = (content: string, y = 104): Element => ({ type: "text", id: uid(), x: 48, y, w: 704, h: 120, content });
const answer = (label: string, right: boolean, to: string, i = 0): Element => ({
  type: "button", id: uid(), x: 48 + (i % 2) * 360, y: 296 + Math.floor(i / 2) * 136, w: 344, h: 88, label,
  actions: [{ type: "score", delta: right ? 1 : 0 }, { type: "goto", cardId: to }],
});
function quiz(id: string, question: string, answers: Array<[string, boolean]>, to: string): Card {
  return { id, kind: "quiz", actions: [], elements: [text(question), ...answers.map(([l, r], i) => answer(l, r, to, i))] };
}
function flash(id: string, term: string, back: string, to: string): Card {
  return {
    id, kind: "flash", actions: [],
    elements: [
      { type: "text", id: uid(), x: 48, y: 264, w: 704, h: 72, content: term },
      { type: "text", id: uid(), x: 48, y: 360, w: 704, h: 120, content: back },
      { type: "button", id: uid(), x: 408, y: 496, w: 344, h: 72, label: "Next Card", actions: [{ type: "goto", cardId: to }] },
    ],
  };
}
function story(id: string, body: string, to: string[]): Card {
  return {
    id, kind: "story", actions: [],
    elements: [text(body), ...to.map((t, i): Element => ({ type: "button", id: uid(), x: 48, y: 260 + i * 100, w: 704, h: 80, label: `Choice ${i + 1}`, actions: [{ type: "goto", cardId: t }] }))],
  };
}
const endCard = (id: string): Card => ({ id, kind: "end", actions: [], elements: [text("You finished", 120)] });
const ids = (k: number): string[] => Array.from({ length: k }, () => uid());
const deck = (cards: Card[]): Stack => ({ id: uid(), title: "Water cycle", theme: THEME, cards });
const label = (s: Stack) => (c: Card): string => cardRefLabel(s, c);

// ---------------------------------------------------------------------------
// b1

describe("TASK-32b.1: three or four answers", () => {
  it("TASK-32b: every prompt asks for 3 or 4 answers, exactly one right, one comparison at most — and no longer 'at least one button'", () => {
    for (const [name, sys] of [
      ["one-shot", build({ prompt: "x" }).system],
      ["streaming", buildStream({ prompt: "x" }).system],
      ["retry", buildRetry({ prompt: "x" }, ["e"]).system],
    ] as const) {
      expect(sys, name).toContain("has 3 or 4 answer buttons, exactly one of them right");
      expect(sys, name).toContain("A two-way comparison question");
      expect(sys, name).toContain("the deck has at most one such question");
      expect(sys, name).not.toMatch(/at least one button that does not/);
    }
  });

  it("TASK-32b: a two-way comparison is a question that offers two options with 'or'", () => {
    expect(isTwoWayComparison("Is 7 × 8 bigger or smaller than 50?")).toBe(true);
    expect(isTwoWayComparison("True or false: the sun is a star.")).toBe(true);
    expect(isTwoWayComparison("What heats water so it evaporates?")).toBe(false);
    expect(isTwoWayComparison("Where does the rain go?")).toBe(false);
    expect(isTwoWayComparison("What is the word for water turning into vapour?")).toBe(false); // "for" ≠ "or"
  });

  it("TASK-32b: a two-answer quiz is flagged in 'Before you share' — and never changed", () => {
    const [q, e] = ids(2);
    const s = deck([quiz(q!, "What heats water so it evaporates?", [["The sun", true], ["The moon", false]], e!), endCard(e!)]);
    const check = beforeYouShare(s, label(s));
    expect(check.ok).toBe(false);
    expect(check.flowProblem).toBe(false);
    expect(check.lines.join(" ")).toContain("has only two answers: add one.");
    expect(check.lines[0]).toMatch(/^Card 1 — What heats water so it evaporates\? has only two answers: add one\.$/);
    expect(check.first?.id).toBe(q);
    // finalising keeps both answers: we flag, we don't invent a third.
    const fin = finaliseGeneratedStackDetailed(s).stack;
    expect(fin.cards[0]!.elements.filter((x) => x.type === "button")).toHaveLength(2);
  });

  it("TASK-32b: property — the share check flags every two-answer non-comparison quiz, and no other quiz, for two answers", () => {
    const qArb = fc.record({
      answers: fc.integer({ min: 2, max: 4 }),
      comparison: fc.boolean(),
      word: fc.stringMatching(/^[a-z]{3,8}$/),
    });
    fc.assert(
      fc.property(fc.array(qArb, { minLength: 1, maxLength: 6 }), (specs) => {
        const cardIds = ids(specs.length + 1);
        const cards = specs.map((sp, i) =>
          quiz(
            cardIds[i]!,
            sp.comparison ? `Is the ${sp.word} hot or cold ${i}?` : `What is the ${sp.word} number ${i}?`,
            Array.from({ length: sp.answers }, (_, k) => [`${sp.word} answer ${k} ${i}`, k === 0] as [string, boolean]),
            cardIds[i + 1]!,
          ),
        );
        const s = deck([...cards, endCard(cardIds[specs.length]!)]);
        const flagged = new Set(lessonWarnings(s).filter((w) => w.code === "two-answers").map((w) => w.cardId));
        const lines = describeLessonWarnings(s, lessonWarnings(s), label(s));
        return specs.every((sp, i) => {
          const should = sp.answers === 2 && !sp.comparison;
          return flagged.has(cardIds[i]!) === should && (!should || lines.some((l) => l.startsWith(`Card ${i + 1} — `) && l.endsWith("has only two answers: add one.")));
        });
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// b2

describe("TASK-32b.2: no repeated cards", () => {
  it("TASK-32b: the measured shape — a second identical 'Evaporation' flash card — is removed and the deck says so", () => {
    const [f1, f2, f3, q, e] = ids(5);
    const back = "Evaporation is when the sun heats water and it turns into vapour.";
    const s = deck([
      flash(f1!, "Evaporation", back, f2!),
      flash(f2!, "Evaporation", back, f3!),
      flash(f3!, "Condensation", "Condensation is when vapour cools and turns back into drops.", q!),
      quiz(q!, "Where does rain flow to?", [["Rivers", true], ["Clouds", false], ["Trees", false]], e!),
      endCard(e!),
    ]);
    const out = finaliseGeneratedStackDetailed(s, { prompt: "two flash cards (evaporation, condensation) and a quiz" });
    expect(out.removedRepeats).toBe(1);
    const fronts = out.stack.cards.filter((c) => c.kind === "flash").map((c) => (c.elements[0] as { content: string }).content);
    expect(fronts).toEqual(["Evaporation", "Condensation"]);
    expect(validate(out.stack).valid).toBe(true);
    expect(reachableIds(out.stack).size).toBe(out.stack.cards.length);
    expect(qualityNotes("two flash cards", out.stack, out.removedRepeats)).toContain("We removed 1 repeated card.");
    expect(qualityNotes("x", out.stack, 2)).toContain("We removed 2 repeated cards.");
  });

  it("TASK-32b: a repeat is matched on kind AND front (case and punctuation ignored), never on the end card", () => {
    const [a, b, c, e] = ids(4);
    const s = deck([
      quiz(a!, "What is rain?", [["Water", true], ["Sand", false], ["Wood", false]], b!),
      flash(b!, "What is rain?", "Water falling from clouds.", c!), // same words, different kind: kept
      quiz(c!, "what is RAIN", [["Water", true], ["Sand", false], ["Wood", false]], e!), // repeat of card 1
      endCard(e!),
    ]);
    expect(frontKey(s.cards[0]!)).toBe(frontKey(s.cards[2]!));
    const out = removeRepeatedCards(s);
    expect(out.removed).toBe(1);
    expect(out.stack.cards.map((x) => x.kind)).toEqual(["quiz", "flash", "end"]);
  });

  it("TASK-32b: a repeated story fork whose removal would strand a branch is kept, and the share check names it", () => {
    const [f1, x, y, f2, z, e] = ids(6);
    const s = deck([
      story(f1!, "A fork in the path.", [x!, y!]),
      story(x!, "Left path.", [f2!]),
      story(y!, "Right path.", [f2!]),
      story(f2!, "A fork in the path.", [z!, e!]), // same front, but its branch z is only reached from here
      story(z!, "The hidden glade.", [e!]),
      endCard(e!),
    ]);
    const out = removeRepeatedCards(s);
    expect(out.removed).toBe(0);
    expect(lessonWarnings(s).some((w) => w.code === "repeated-card" && w.cardId === f2)).toBe(true);
  });

  it("TASK-32b: property — injected duplicates never survive, the stack validates, and every reachable non-duplicate card stays reachable", () => {
    const specArb = fc.record({
      kinds: fc.array(fc.constantFrom("quiz", "flash", "story"), { minLength: 1, maxLength: 6 }),
      dupOf: fc.array(fc.nat(10), { minLength: 1, maxLength: 4 }),
      at: fc.array(fc.nat(10), { minLength: 4, maxLength: 4 }),
    });
    fc.assert(
      fc.property(specArb, ({ kinds, dupOf, at }) => {
        const cardIds = ids(kinds.length + 1);
        const endId = cardIds[kinds.length]!;
        const make = (kind: string, id: string, front: string, to: string): Card =>
          kind === "quiz"
            ? quiz(id, front, [["One", true], ["Two", false], ["Three", false]], to)
            : kind === "flash"
              ? flash(id, front, `About ${front}.`, to)
              : story(id, front, [to]);
        const cards: Card[] = kinds.map((k, i) => make(k, cardIds[i]!, `Front number ${i}`, cardIds[i + 1]!));
        // Inject copies of earlier cards (same kind and front) at random places.
        dupOf.forEach((d, j) => {
          const src = cards[d % cards.length]!;
          const pos = Math.min(cards.length, (d % cards.length) + 1 + (at[j]! % (cards.length - (d % cards.length))));
          const copyId = uid();
          const front = (src.elements[0] as { content: string }).content;
          const nextId = cards[pos]?.id ?? endId;
          // The card before `pos` now leads to the copy; the copy leads on.
          const copy = make(src.kind, copyId, front, nextId);
          if (pos > 0) {
            const prev = cards[pos - 1]!;
            cards[pos - 1] = { ...prev, elements: prev.elements.map((e) => (e.type === "button" ? { ...e, actions: e.actions.map((a) => (a.type === "goto" ? { ...a, cardId: copyId } : a)) } : e)) };
          }
          cards.splice(pos, 0, copy);
        });
        const s = deck([...cards, endCard(endId)]);
        if (!validate(s).valid) return true;
        const before = reachableIds(s);
        const twins = new Set<string>();
        const seen = new Set<string>();
        for (const c of s.cards) {
          const k = frontKey(c);
          if (c.kind !== "end" && seen.has(k)) twins.add(c.id);
          seen.add(k);
        }
        const out = finaliseGeneratedStackDetailed(s).stack;
        if (!validate(out).valid) return false;
        const keys = out.cards.filter((c) => c.kind !== "end").map(frontKey);
        if (new Set(keys).size !== keys.length) return false;
        const after = reachableIds(out);
        return [...before].every((id) => twins.has(id) || after.has(id));
      }),
      { numRuns: 300 },
    );
  }, 60_000);
});

// ---------------------------------------------------------------------------
// b3

describe("TASK-32b.3: the counts the teacher asked for", () => {
  it("TASK-32b: the parser reads digits and number words", () => {
    expect(parseRequestedCounts("A 6-question quiz on the water cycle for 4th class, two flash cards (evaporation, condensation) and a short story")).toEqual({ quiz: 6, flash: 2 });
    expect(parseRequestedCounts("a 5-question quiz on the 7 times table and a bake-sale story")).toEqual({ quiz: 5 });
    expect(parseRequestedCounts("Irish praise phrases: four flash cards, then a 3-question quiz")).toEqual({ quiz: 3, flash: 4 });
    expect(parseRequestedCounts("a 10-card quiz about the Vikings in Ireland")).toEqual({ total: 10 });
    expect(parseRequestedCounts("twelve questions on fractions")).toEqual({ quiz: 12 });
    expect(parseRequestedCounts("one flash card about volcanoes")).toEqual({ flash: 1 });
    expect(parseRequestedCounts("3 quiz cards and 2 flashcards")).toEqual({ quiz: 3, flash: 2 });
  });

  it("TASK-32b: nothing found → {} (and no instruction in the prompt)", () => {
    expect(parseRequestedCounts("a quiz about the Vikings for 4th class")).toEqual({});
    expect(parseRequestedCounts("")).toEqual({});
    expect(countsInstruction({})).toBe("");
    expect(build({ prompt: "a quiz about the Vikings for 4th class" }).user).not.toMatch(/Write exactly/);
  });

  it("TASK-32b: the prompts carry the counts as hard numbers (one-shot, streaming and retry)", () => {
    const p = "A 6-question quiz on the water cycle, two flash cards and a story";
    const line = "Write exactly 6 quiz cards and exactly 2 flash cards.";
    expect(build({ prompt: p }).user).toContain(line);
    expect(buildStream({ prompt: p }).user).toContain(line);
    expect(buildRetry({ prompt: p }, ["quiz-answer"]).user).toContain(line);
    expect(countsInstruction({ total: 10 })).toBe("Write exactly 10 cards before the end card.");
    expect(countsInstruction({ quiz: 1 })).toBe("Write exactly 1 quiz card.");
  });

  it("TASK-32b: 7 quizzes for a '6-question quiz' are trimmed from the end; 4 are kept and the Maker says so", () => {
    const q7 = ids(8);
    const qs = Array.from({ length: 7 }, (_, i) => quiz(q7[i]!, `Water question ${i + 1}?`, [["a", i === 0], ["b", i !== 0], ["c", false]], q7[i + 1]!));
    const s = deck([...qs, endCard(q7[7]!)]);
    const out = finaliseGeneratedStackDetailed(s, { prompt: "a 6-question quiz on the water cycle" });
    expect(out.written.quiz).toBe(7);
    expect(out.stack.cards.filter((c) => c.kind === "quiz")).toHaveLength(6);
    expect((out.stack.cards[5]!.elements[0] as { content: string }).content).toBe("Water question 6?");
    expect(validate(out.stack).valid).toBe(true);
    expect(reachableIds(out.stack).size).toBe(out.stack.cards.length);

    const few = deck([...qs.slice(0, 3), quiz(q7[3]!, "Water question 4?", [["a", true], ["b", false], ["c", false]], q7[7]!), endCard(q7[7]!)]);
    const fewOut = finaliseGeneratedStackDetailed(few, { prompt: "a 6-question quiz on the water cycle" });
    expect(fewOut.stack.cards.filter((c) => c.kind === "quiz")).toHaveLength(4);
    expect(qualityNotes("a 6-question quiz on the water cycle", fewOut.stack, 0)).toContain("You asked for 6 questions; the model wrote 4.");
    expect(qualityNotes("two flash cards", deck([endCard(uid())]), 0)).toContain("You asked for 2 flash cards; the model wrote 0.");
  });

  it("TASK-32b: property — trimming keeps the stack valid, keeps every other reachable card reachable, and never exceeds the request", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("quiz", "flash", "story"), { minLength: 1, maxLength: 9 }),
        fc.integer({ min: 1, max: 6 }),
        fc.integer({ min: 1, max: 6 }),
        (kinds, wantQ, wantF) => {
          const cardIds = ids(kinds.length + 1);
          const cards = kinds.map((k, i): Card =>
            k === "quiz"
              ? quiz(cardIds[i]!, `Q ${i}?`, [["a", true], ["b", false], ["c", false]], cardIds[i + 1]!)
              : k === "flash"
                ? flash(cardIds[i]!, `Term ${i}`, `Meaning ${i}.`, cardIds[i + 1]!)
                : story(cardIds[i]!, `Scene ${i}.`, [cardIds[i + 1]!]),
          );
          const s = deck([...cards, endCard(cardIds[kinds.length]!)]);
          if (!validate(s).valid) return true;
          const before = reachableIds(s);
          const out = trimToRequestedCounts(s, { quiz: wantQ, flash: wantF });
          if (!validate(out).valid) return false;
          const quizzes = out.cards.filter((c) => c.kind === "quiz").length;
          const flashes = out.cards.filter((c) => c.kind === "flash").length;
          if (quizzes > Math.max(wantQ, 0) || flashes > Math.max(wantF, 0)) return false;
          const kept = new Set(out.cards.map((c) => c.id));
          const after = reachableIds(out);
          return [...before].every((id) => !kept.has(id) || after.has(id));
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// b4

describe("TASK-32b.4: a picture never gives the answer away", () => {
  const withPicture = (c: Card, name: string): Card => ({
    ...c,
    elements: [...c.elements, { type: "image", id: uid(), ...PICTURE_SLOT, src: pictogramDataUri(name), alt: `Picture: ${name}` }],
  });

  it("TASK-32b: a sun on 'What heats water…?' → 'The sun' is dropped; a cloud is kept", () => {
    const [q, e] = ids(2);
    const base = quiz(q!, "What heats water so it evaporates?", [["The sun", true], ["The wind", false], ["The moon", false]], e!);
    expect(pictureGivesAnswerAway(withPicture(base, "sun"))).toBe(true);
    expect(pictureGivesAnswerAway(withPicture(base, "cloud"))).toBe(false);
    // plural folded: "Clouds" is a giveaway for "cloud"
    const q2 = quiz(q!, "What makes rain?", [["Clouds", true], ["Rocks", false], ["Grass", false]], e!);
    expect(pictureGivesAnswerAway(withPicture(q2, "cloud"))).toBe(true);
  });

  it("TASK-32b: the generator drops it on the way in (the streamed preview path too)", () => {
    const raw = {
      id: "s", title: "Water", theme: THEME,
      cards: [
        { id: "c1", kind: "quiz", actions: [], elements: [{ type: "text", id: "t", content: "What heats water so it evaporates?" }, { type: "button", id: "a", label: "The sun", actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: "c2" }] }, { type: "button", id: "b", label: "The moon", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }] }, { type: "button", id: "d", label: "The wind", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }] }, { type: "image", picto: "sun" }] },
        { id: "c2", kind: "end", actions: [], elements: [{ type: "text", id: "e", content: "Done" }] },
      ],
    };
    const v = validate(sanitizeRawStack(raw));
    expect(v.valid).toBe(true);
    if (!v.valid) return;
    const out = finaliseGeneratedStackDetailed(v.stack).stack;
    expect(out.cards[0]!.elements.some((e) => e.type === "image")).toBe(false);
  });

  it("TASK-32b: property — no surviving pictogram name is a word of its card's right answer", () => {
    fc.assert(
      fc.property(fc.constantFrom(...PICTOGRAM_NAMES), fc.constantFrom(...PICTOGRAM_NAMES), fc.boolean(), (pic, inAnswer, plural) => {
        const [q, e] = ids(2);
        const right = `The ${inAnswer}${plural ? "s" : ""}`;
        const raw = {
          id: "s", title: "T", theme: THEME,
          cards: [
            { id: "c1", kind: "quiz", actions: [], elements: [{ type: "text", id: "t", content: "Which one?" }, { type: "button", id: "a", label: right, actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: "c2" }] }, { type: "button", id: "b", label: "Something else", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }] }, { type: "button", id: "c", label: "Nothing", actions: [{ type: "score", delta: 0 }, { type: "goto", cardId: "c2" }] }, { type: "image", picto: pic }] },
            { id: "c2", kind: "end", actions: [], elements: [{ type: "text", id: "e", content: "Done" }] },
          ],
        };
        void q; void e;
        const v = validate(sanitizeRawStack(raw));
        if (!v.valid) return false;
        const out = finaliseGeneratedStackDetailed(v.stack).stack;
        return out.cards.every((c) => {
          const r = rightAnswer(c);
          if (r === undefined) return true;
          const words = new Set(foldedWords(r.label));
          return c.elements.every((el) => {
            const name = el.type === "image" ? pictogramNameOfSrc(el.src) : null;
            return name === null || !foldedWords(name).some((w) => words.has(w));
          });
        });
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// b5

describe("TASK-32b.5: the cheap lesson check", () => {
  it("TASK-32b: the measured shape — 'Rivers and lakes that lead to the sea' vs 'The sea' — is an ambiguous key", () => {
    const [q, e] = ids(2);
    const s = deck([
      quiz(q!, "Where does rain eventually flow back to?", [["Rivers and lakes that lead to the sea", true], ["The sea", false], ["Into the sky", false]], e!),
      endCard(e!),
    ]);
    const w = lessonWarnings(s);
    expect(w.map((x) => x.code)).toEqual(["answer-inside-answer"]);
    const line = describeLessonWarnings(s, w, label(s))[0]!;
    expect(line).toContain("Card 1 — Where does rain eventually flow back to?");
    expect(line).toContain("“Rivers and lakes that lead to the sea”");
    expect(line).toContain("“The sea”");
    // the reverse direction (wrong answer contains the right one) and case/punctuation
    const s2 = deck([quiz(q!, "Where?", [["the SEA!", true], ["Rivers that lead to the sea", false], ["Hills", false]], e!), endCard(e!)]);
    expect(lessonWarnings(s2).map((x) => x.code)).toEqual(["answer-inside-answer"]);
    // a shared word is not containment: "The sun" vs "The sunflower" stays quiet
    const s3 = deck([quiz(q!, "Which?", [["The sun", true], ["The sunflower", false], ["Moon", false]], e!), endCard(e!)]);
    expect(lessonWarnings(s3)).toEqual([]);
  });

  it("TASK-32b: duplicate answer labels on a card", () => {
    const [q, e] = ids(2);
    const s = deck([quiz(q!, "Which?", [["Dublin", true], ["Cork", false], ["cork.", false]], e!), endCard(e!)]);
    expect(lessonWarnings(s).map((x) => x.code)).toEqual(["duplicate-answers"]);
    expect(describeLessonWarnings(s, lessonWarnings(s), label(s))[0]).toContain("has two answers with the same words");
  });

  it("TASK-32b: a quiz within 3 cards after a flash card that just asks for its term or its definition", () => {
    const [f, q1, q2, e] = ids(4);
    const fl = flash(f!, "Evaporation", "When the sun heats water and it turns into vapour.", q1!);
    const asksTerm = quiz(q1!, "What do we call it when the sun heats water and it turns into vapour?", [["Evaporation", true], ["Condensation", false], ["Freezing", false]], q2!);
    const asksDef = quiz(q2!, "What is evaporation?", [["The sun heats water and it turns into vapour", true], ["Rain falls", false], ["Ice melts", false]], e!);
    const s = deck([fl, asksTerm, asksDef, endCard(e!)]);
    const w = lessonWarnings(s).filter((x) => x.code === "restates-flash");
    expect(w.map((x) => x.cardId)).toEqual([q1, q2]);
    expect(describeLessonWarnings(s, w, label(s))[0]).toContain("just asks again what card 1 showed");
    // four cards later it is revision, not a restatement
    const [g1, g2, g3, g4] = ids(4);
    const far = deck([fl, story(g1!, "A.", [g2!]), story(g2!, "B.", [g3!]), story(g3!, "C.", [g4!]), { ...asksTerm, id: g4!, elements: asksTerm.elements.map((x) => (x.type === "button" ? { ...x, actions: x.actions.map((a) => (a.type === "goto" ? { ...a, cardId: e! } : a)) } : x)) }, endCard(e!)]);
    expect(lessonWarnings(far).filter((x) => x.code === "restates-flash")).toEqual([]);
  });

  it("TASK-32b: the three ready-made decks raise no lesson warning", () => {
    for (const s of [vikingsStack(), timesTablesStack(), irishWordsStack()]) {
      expect(lessonWarnings(s), s.title).toEqual([]);
    }
  });

  it("TASK-32b: lesson warnings never block — a deck with only warnings still has no flow problem", () => {
    const [q, e] = ids(2);
    const s = deck([quiz(q!, "Where?", [["The sea", true], ["Rivers to the sea", false]], e!), endCard(e!)]);
    const check = beforeYouShare(s, label(s));
    expect(check.report.ok).toBe(true);
    expect(check.flowProblem).toBe(false);
    expect(check.warnings.map((w) => w.code).sort()).toEqual(["answer-inside-answer", "two-answers"]);
  });
});

describe("TASK-32b: the live-shaped fixtures (the check:generation-quality gate, as a test)", () => {
  it("TASK-32b: every fixture in tests/fixtures/generation finalises with no problem", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { checkFixture } = await import("../scripts/check-generation-quality.js");
    const dir = "tests/fixtures/generation";
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      expect(checkFixture(f, JSON.parse(readFileSync(`${dir}/${f}`, "utf8"))), f).toEqual([]);
    }
  });
});
