// tests/deck-answer-quality.test.ts
// TASK-42b (judge round r7, P1-5): the content of generated decks.
//   b1 flagged joke answers swapped at generation (the teacher's own Swap rule)
//   b2 the teacher is told how many
//   b3 two answers on one card that say the same thing
//   b4 two quiz cards with the same right answer (in words)
//   b5 the widened moon marker
//   b6 properties: every pass keeps the stack valid, one right answer per quiz,
//      no right answer changed, no reachable card stranded
// The joke-answer markers catch few joke answers (recall 0.05 / 0.01 / 0.03 out
// of sample, bench/DIAGNOSIS.md); these tests check what the passes do, not
// that they find most jokes.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { readFileSync } from "node:fs";
import path from "node:path";
import { stackOfFile } from "../scripts/build-distractor-review.js";
import {
  swapFlaggedJokeAnswers,
  swapRepeatedAnswers,
  sameAnswerRepeat,
  trimToRequestedCounts,
  trimToRequestedCountsDetailed,
} from "../server/deckQuality.js";
import { finaliseGeneratedStackDetailed } from "../server/normalizeGenerated.js";
import { answerKey, isWordAnswer, jokeAnswerReason, lessonWarnings, quizAnswers, rightAnswer } from "../src/shared/lessonCheck.js";
import { beforeYouShare, NOTE_CODES, MORE_NOTE_CODES } from "../src/shared/shareCheck.js";
import { qualityNotes, swapCounts } from "../src/shared/qualityNotes.js";
import { swapCandidates } from "../src/editor/swapCandidates.js";
import { validate } from "../src/shared/validator.js";
import { QUIZ_TILES } from "../src/shared/layout.js";
import { reachableIds } from "../src/shared/flow.js";
import { primaryText } from "../src/shared/cardTitle.js";
import { vikingsStack, timesTablesStack, irishWordsStack } from "../src/shared/readyMadeStacks.js";
import type { ButtonElement, Card, Element, Stack } from "../src/shared/types.js";

let n = 0;
const ROOT = path.resolve(__dirname, "..");
const uid = (): string => `42b00000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`;
const THEME = { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" };
const text = (content: string): Element => ({ type: "text", id: uid(), x: 48, y: 104, w: 704, h: 120, content });
const answer = (label: string, right: boolean, to: string, i: number): Element => ({
  type: "button", id: uid(), x: 48 + (i % 2) * 360, y: 296 + Math.floor(i / 2) * 136, w: 344, h: 88, label,
  actions: [{ type: "score", delta: right ? 1 : 0 }, { type: "goto", cardId: to }],
});
function quiz(id: string, question: string, answers: Array<[string, boolean]>, to: string): Card {
  return { id, kind: "quiz", actions: [], elements: [text(question), ...answers.map(([l, r], i) => answer(l, r, to, i))] };
}
const endCard = (id: string): Card => ({ id, kind: "end", actions: [], elements: [text("You finished")] });
const ids = (k: number): string[] => Array.from({ length: k }, () => uid());
const deck = (cards: Card[]): Stack => ({ id: uid(), title: "Water cycle", theme: THEME, cards });

/** A chain of quiz cards, each leading to the next, then the end card. */
function chain(specs: Array<{ q: string; a: Array<[string, boolean]> }>): Stack {
  const cardIds = ids(specs.length + 1);
  return deck([...specs.map((s, i) => quiz(cardIds[i]!, s.q, s.a, cardIds[i + 1]!)), endCard(cardIds[specs.length]!)]);
}
const labels = (c: Card): string[] => quizAnswers(c).map((b) => b.label);
const rights = (s: Stack): Map<string, string> => new Map(s.cards.filter((c) => c.kind === "quiz").map((c) => [c.id, rightAnswer(c)!.label]));
const fronts = (s: Stack): string[] => s.cards.map((c) => primaryText(c));

// ---------------------------------------------------------------------------
// b1

describe("TASK-42b: TASK-42b1: flagged joke answers are swapped at generation", () => {
  const water = (): Stack =>
    chain([
      { q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It freezes", false]] },
      { q: "What does cold air do to water vapour?", a: [["It condenses", true], ["It melts", false], ["It boils", false]] },
    ]);

  it("TASK-42b1: a flagged wrong answer with a candidate is swapped for the teacher's first Swap candidate; nothing else changes", () => {
    const s = water();
    const card = s.cards[0]!;
    const glows = quizAnswers(card).find((b) => b.label === "It glows")!;
    expect(jokeAnswerReason(glows, card)).toBe("glowing");
    const first = swapCandidates(s, card.id, glows.id)[0];
    expect(first).toBe("It melts");

    const r = swapFlaggedJokeAnswers(s);
    expect(r.swapped).toBe(1);
    expect(labels(r.stack.cards[0]!)).toEqual(["It evaporates", "It melts", "It freezes"]);
    // Only that label: same ids, same actions, every other card unchanged.
    const after = quizAnswers(r.stack.cards[0]!).find((b) => b.id === glows.id)!;
    expect(after.actions).toEqual(glows.actions);
    expect(r.stack.cards.slice(1)).toEqual(s.cards.slice(1));
    expect(validate(r.stack).valid).toBe(true);
    // Deterministic, and the input is not mutated.
    expect(swapFlaggedJokeAnswers(structuredClone(s))).toEqual(r);
    expect(labels(s.cards[0]!)).toContain("It glows");
  });

  it("TASK-42b1: TASK-42b10: TASK-42b11: with no safe candidate, a flagged answer on a card with two other wrong answers is removed and the rest laid out again", () => {
    const s = chain([{ q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It freezes", false], ["It boils", false]] }]);
    const r = swapFlaggedJokeAnswers(s);
    expect([r.swapped, r.removed, r.left]).toEqual([0, 1, 0]);
    const card = r.stack.cards[0]!;
    expect(labels(card)).toEqual(["It evaporates", "It freezes", "It boils"]);
    // No gap: the three answers stand on tiles A, B and C, exactly as a generated three-answer card.
    expect(quizAnswers(card).map((b) => [b.x, b.y, b.w, b.h])).toEqual(QUIZ_TILES.slice(0, 3).map((t) => [t.x, t.y, t.w, t.h]));
    expect(validate(r.stack).valid).toBe(true);
  });

  it("TASK-42b11: on a three-answer card the flagged answer is left (removing it would leave only two answers), and the note still names it", () => {
    const s = chain([{ q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It freezes", false]] }]);
    const r = swapFlaggedJokeAnswers(s);
    expect([r.swapped, r.removed, r.left]).toEqual([0, 0, 1]);
    expect(r.stack).toEqual(s);
    expect(lessonWarnings(r.stack).some((w) => w.code === "joke-answer" && w.labels?.[0] === "It glows")).toBe(true);
    expect(lessonWarnings(r.stack).some((w) => w.code === "two-answers")).toBe(false);
  });

  it("TASK-42b1: TASK-42b10: with no safe candidate and no other wrong answer, the flagged answer stays and the note still names it", () => {
    const s = chain([{ q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false]] }]);
    const r = swapFlaggedJokeAnswers(s);
    expect([r.swapped, r.removed, r.left]).toEqual([0, 0, 1]);
    expect(r.stack).toEqual(s);
    expect(lessonWarnings(r.stack).some((w) => w.code === "joke-answer" && w.labels?.[0] === "It glows")).toBe(true);
  });

  it("TASK-42b1: a right answer is never swapped, even when it carries a marker word", () => {
    const s = chain([
      { q: "What do fireflies do at night?", a: [["They glow", true], ["They sleep", false], ["They swim", false]] },
      { q: "What do owls do at night?", a: [["They hunt", true], ["They bark", false], ["They melt", false]] },
    ]);
    const r = swapFlaggedJokeAnswers(s);
    expect(r.swapped).toBe(0);
    expect(rights(r.stack)).toEqual(rights(s));
  });

  it("TASK-42b1: TASK-42b10: the finalise step both generation paths use runs the pass, and reports the counts", () => {
    const fin = finaliseGeneratedStackDetailed(water(), { prompt: "A 2-question quiz on the water cycle" });
    expect([fin.swappedJokes, fin.removedJokes, fin.leftJokes]).toEqual([1, 0, 0]);
    expect(validate(fin.stack).valid).toBe(true);
    const all = fin.stack.cards.flatMap((c) => (c.kind === "quiz" ? labels(c) : []));
    expect(all).not.toContain("It glows");
    expect(swapCounts(fin)).toEqual({ swappedJokes: 1 });
  });
});

// ---------------------------------------------------------------------------
// b2

describe("TASK-42b2: the teacher is told", () => {
  it("TASK-42b2: the first-screen notes say how many answers were swapped, numbers one to ten in words", () => {
    const s = chain([{ q: "Q?", a: [["A", true], ["B", false], ["C", false]] }]);
    expect(qualityNotes("a quiz", s, 0, { swappedJokes: 1 })).toEqual(["We swapped one answer that looked like a joke. Read it to check it fits."]);
    expect(qualityNotes("a quiz", s, 0, { swappedJokes: 3 })).toEqual(["We swapped three answers that looked like jokes. Read them to check they fit."]);
    expect(qualityNotes("a quiz", s, 0, { swappedJokes: 12 })).toEqual(["We swapped 12 answers that looked like jokes. Read them to check they fit."]);
    expect(qualityNotes("a quiz", s, 0, { swappedRepeats: 1 })).toEqual(["We swapped one answer that said the same as another on its card."]);
    expect(qualityNotes("a quiz", s, 0, { swappedRepeats: 2 })).toEqual(["We swapped two answers that said the same as others on their cards."]);
    // TASK-42b10: removed answers get their own note, without the "read it" hint.
    expect(qualityNotes("a quiz", s, 0, { removedJokes: 1 })).toEqual(["We removed one answer that looked like a joke."]);
    expect(qualityNotes("a quiz", s, 0, { removedJokes: 2 })).toEqual(["We removed two answers that looked like jokes."]);
    expect(qualityNotes("a quiz", s, 0, { removedDuplicates: 1 })).toEqual(["We removed one answer that said the same as another on its card."]);
    expect(qualityNotes("a quiz", s, 0, { swappedJokes: 1, removedJokes: 2 })).toEqual([
      "We swapped one answer that looked like a joke. Read it to check it fits.",
      "We removed two answers that looked like jokes.",
    ]);
    expect(qualityNotes("a quiz", s, 0, { leftJokes: 3, droppedSameAnswer: 1 })).toEqual([]);
    expect(qualityNotes("a quiz", s, 0)).toEqual([]);
  });

  it("TASK-42b2: the counts travel only when above zero", () => {
    expect(swapCounts({ swappedJokes: 0, removedJokes: 0, swappedRepeats: 0, droppedSameAnswer: 0 })).toEqual({});
    expect(swapCounts({ swappedJokes: 2, removedJokes: 1, leftJokes: 0, swappedRepeats: 1, removedDuplicates: 1, droppedSameAnswer: 1 })).toEqual({
      swappedJokes: 2,
      removedJokes: 1,
      swappedRepeats: 1,
      removedDuplicates: 1,
      droppedSameAnswer: 1,
    });
  });

  it("TASK-42b2: the ready-made decks are not touched by the passes", () => {
    // They never go through the finalise step; and run through the passes anyway, they have nothing to swap.
    for (const s of [vikingsStack(), timesTablesStack(), irishWordsStack()]) {
      expect(swapFlaggedJokeAnswers(s).swapped).toBe(0);
      expect(swapRepeatedAnswers(s).swapped).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// b3

describe("TASK-42b3: two answers on one card that say the same thing", () => {
  it("TASK-42b3: answerKey folds case, punctuation, a plural s and a leading article", () => {
    expect(answerKey("The Clouds!")).toBe(answerKey("cloud"));
    expect(answerKey("A sun")).toBe(answerKey("Sun"));
    expect(answerKey("An ant")).toBe("ant");
    expect(answerKey("The")).toBe("the");
    expect(answerKey("Glass")).toBe("glass");
  });

  it("TASK-42b3: a wrong answer that says the same as the right one is swapped; the right one never changes", () => {
    const s = chain([
      { q: "What heats water so it evaporates?", a: [["The sun", true], ["Sun", false], ["The wind", false]] },
      { q: "What falls from clouds?", a: [["Rain", true], ["Sand", false], ["Leaves", false]] },
    ]);
    const r = swapRepeatedAnswers(s);
    expect(r.swapped).toBe(1);
    const got = labels(r.stack.cards[0]!);
    expect(got[0]).toBe("The sun");
    expect(got).not.toContain("Sun");
    expect(new Set(got.map(answerKey)).size).toBe(3);
    expect(rights(r.stack)).toEqual(rights(s));
  });

  it("TASK-42b3: a swap never brings in an answer inside another on the card (bench y5-earth-space-3: not \"Flat\" beside \"Flat like a plate\")", () => {
    const s = chain([
      { q: "What shape is Earth?", a: [["Round like a ball", true], ["Flat like a plate", false], ["Square like a box", false]] },
      { q: "Which word means a ball shape?", a: [["Sphere", true], ["Flat", false], ["Cube", false]] },
    ]);
    const r = swapFlaggedJokeAnswers(s);
    const got = labels(r.stack.cards[0]!);
    expect(got).not.toContain("Flat");
    expect(got).not.toContain("Square like a box");
    expect(got).toEqual(["Round like a ball", "Flat like a plate", "Cube"]);
  });

  it("TASK-42b3: of two wrong answers that say the same thing, the later one is swapped", () => {
    const s = chain([
      { q: "What is rain made of?", a: [["Water drops", true], ["Clouds", false], ["the cloud", false]] },
      { q: "What falls from clouds?", a: [["Snow", true], ["Sand", false], ["Leaves", false]] },
    ]);
    const r = swapRepeatedAnswers(s);
    expect(r.swapped).toBe(1);
    expect(labels(r.stack.cards[0]!).slice(0, 2)).toEqual(["Water drops", "Clouds"]);
    expect(labels(r.stack.cards[0]!)[2]).not.toBe("the cloud");
  });
});

// ---------------------------------------------------------------------------
// b4

/** TASK-42b4 regression fixture: the live water-cycle deck of round r7 (cards 3 and 11, both "Condensation"), cut to six quiz cards. */
function condensationPair(): Stack {
  return chain([
    { q: "What does the sun do to water in a puddle?", a: [["It heats it up", true], ["It cools it down", false], ["It freezes it", false]] },
    { q: "What is it called when water turns into vapour?", a: [["Evaporation", true], ["Melting", false], ["Freezing", false]] },
    { q: "What is the name for water vapour cooling and turning back into liquid?", a: [["Condensation", true], ["Evaporation", false], ["Boiling", false]] },
    { q: "What falls from clouds when the drops get heavy?", a: [["Rain", true], ["Steam", false], ["Smoke", false]] },
    { q: "Which change turns water vapour into liquid water?", a: [["Condensation", true], ["Freezing", false], ["Melting", false]] },
    { q: "Where does rain water collect?", a: [["In rivers and seas", true], ["In the clouds", false], ["In the sun", false]] },
  ]);
}

describe("TASK-42b4: two quiz cards with the same right answer", () => {
  it("TASK-42b4: word answers count; number and yes / no / true / false answers do not", () => {
    expect(["Condensation", "The water cycle", "Rain"].map(isWordAnswer)).toEqual([true, true, true]);
    expect(["12", "12 eggs", "Two", "Twenty one", "Yes", "no", "True", "FALSE", ""].map(isWordAnswer)).toEqual([false, false, false, false, false, false, false, false, false]);
  });

  it("TASK-42b4: the Condensation pair: with one quiz card more than asked, the later twin goes, not the last card", () => {
    const s = condensationPair();
    expect(sameAnswerRepeat(s)?.id).toBe(s.cards[4]!.id);
    const r = trimToRequestedCountsDetailed(s, { quiz: 5 });
    expect(r.sameAnswerDropped).toBe(1);
    expect(fronts(r.stack)).not.toContain("Which change turns water vapour into liquid water?");
    expect(fronts(r.stack)).toContain("Where does rain water collect?");
    expect(r.stack.cards.filter((c) => c.kind === "quiz")).toHaveLength(5);
    expect(validate(r.stack).valid).toBe(true);
    expect(trimToRequestedCounts(s, { quiz: 5 })).toEqual(r.stack);
  });

  it("TASK-42b4: never below the requested count, and never when no count was asked; the pair is then a note, not a blocker", () => {
    const s = condensationPair();
    expect(trimToRequestedCounts(s, { quiz: 6 })).toEqual(s);
    expect(trimToRequestedCounts(s, {})).toEqual(s);
    const share = beforeYouShare(s);
    expect(share.notes).toContain("Cards 3 and 5 have the same right answer, “Condensation”: check they don't ask the same thing twice.");
    expect(share.lines.join(" ")).not.toContain("same right answer");
    expect(MORE_NOTE_CODES).toContain("same-right-answer");
    expect(NOTE_CODES).toEqual(["restates-flash", "joke-answer"]);
  });

  it("TASK-42b4: through the finalise step with \"A 5-question quiz\", the twin is the card that goes", () => {
    const fin = finaliseGeneratedStackDetailed(condensationPair(), { prompt: "A 5-question quiz on the water cycle for 4th class" });
    expect(fin.droppedSameAnswer).toBe(1);
    const qs = fin.stack.cards.filter((c) => c.kind === "quiz");
    expect(qs).toHaveLength(5);
    expect(qs.filter((c) => answerKey(rightAnswer(c)!.label) === "condensation")).toHaveLength(1);
  });

  it("TASK-42b4: a times-tables deck (\"12\" for 3 × 4 and for 2 × 6) is trimmed from the end and gets no note", () => {
    const s = chain([
      { q: "What is 3 × 4?", a: [["12", true], ["7", false], ["10", false]] },
      { q: "What is 2 × 6?", a: [["12", true], ["8", false], ["14", false]] },
      { q: "What is 5 × 5?", a: [["25", true], ["20", false], ["30", false]] },
    ]);
    expect(sameAnswerRepeat(s)).toBeUndefined();
    const r = trimToRequestedCountsDetailed(s, { quiz: 2 });
    expect(r.sameAnswerDropped).toBe(0);
    expect(fronts(r.stack)).toEqual(["What is 3 × 4?", "What is 2 × 6?", "You finished"]);
    expect(lessonWarnings(s).some((w) => w.code === "same-right-answer")).toBe(false);
    expect(swapFlaggedJokeAnswers(s).stack).toEqual(s);
    expect(swapRepeatedAnswers(s).stack).toEqual(s);
  });

  it("TASK-42b4: \"Two\" for two magnet questions is a number answer: the deeper second question is not dropped for it (bench y3-forces-magnets-5)", () => {
    const s = chain([
      { q: "How many poles does a bar magnet have?", a: [["Two", true], ["One", false], ["Four", false]] },
      { q: "Where is a magnet's pull strongest?", a: [["At the poles", true], ["In the middle", false], ["Nowhere", false]] },
      { q: "A magnet is cut in half. How many poles does each half have?", a: [["Two", true], ["One", false], ["None", false]] },
      { q: "Which of these is a pole of a magnet?", a: [["North", true], ["East", false], ["Up", false]] },
    ]);
    expect(sameAnswerRepeat(s)).toBeUndefined();
    const r = trimToRequestedCountsDetailed(s, { quiz: 3 });
    expect(r.sameAnswerDropped).toBe(0);
    expect(fronts(r.stack)).toContain("A magnet is cut in half. How many poles does each half have?");
    expect(fronts(r.stack)).not.toContain("Which of these is a pole of a magnet?");
  });

  it("TASK-42b4: a true / false deck is not touched", () => {
    const s = chain([
      { q: "True or false: water boils at 100 °C at sea level?", a: [["True", true], ["False", false]] },
      { q: "True or false: ice is lighter than water?", a: [["True", true], ["False", false]] },
      { q: "True or false: clouds are made of smoke?", a: [["False", true], ["True", false]] },
    ]);
    expect(sameAnswerRepeat(s)).toBeUndefined();
    expect(trimToRequestedCountsDetailed(s, { quiz: 2 }).sameAnswerDropped).toBe(0);
    expect(lessonWarnings(s).some((w) => w.code === "same-right-answer")).toBe(false);
    expect(swapFlaggedJokeAnswers(s).stack).toEqual(s);
    expect(swapRepeatedAnswers(s).stack).toEqual(s);
  });
});

// ---------------------------------------------------------------------------
// b5

describe("TASK-42b5: the moon marker", () => {
  const ask = (q: string, right: string, wrong: string): string | null => {
    const s = chain([{ q, a: [[right, true], [wrong, false]] }]);
    const card = s.cards[0]!;
    return jokeAnswerReason(quizAnswers(card)[1]!, card);
  };

  it("TASK-42b5: \"Into the moon\" is flagged now; \"The moon\" and \"It turns into salt\" are not (the wrong kind of thing is not a marker)", () => {
    expect(ask("Where does water vapour go when it rises?", "Up into the sky, where it cools", "Into the moon")).toBe("going to the moon");
    expect(ask("Where does the rocket fly?", "To the stars", "It flies to the moon")).toBe("going to the moon");
    expect(ask("What heats water so it evaporates?", "The Sun", "The moon")).toBeNull();
    expect(ask("What happens to water when it evaporates?", "It turns into water vapour", "It turns into salt")).toBeNull();
  });

  it("TASK-42b5: still exempt when the question mentions the moon", () => {
    expect(ask("Where did the astronauts travel to the moon from?", "Earth", "To the moon")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// b10

/** How many quiz cards carry each answer label (answerKey) as an answer. */
function cardsPerLabel(s: Stack): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of s.cards) {
    if (c.kind !== "quiz") continue;
    for (const k of new Set(quizAnswers(c).map((b) => answerKey(b.label)))) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

describe("TASK-42b10: the automatic pass: a safe swap, else remove, else leave", () => {
  it("TASK-42b10: TASK-42b11: the y4-states-of-matter-3 recording: no answer spreads, the pass never adds an 'only two answers' warning, and both flagged answers are left", () => {
    // The recording through the finalise step, as the v5 review read it. The bench file is that deck again:
    // since TASK-42b11 the passes leave it unchanged.
    const s = stackOfFile(readFileSync(path.join(ROOT, "bench", "files", "y4-states-of-matter-3.html"), "utf8"));
    const before = cardsPerLabel(s);
    expect(before.get(answerKey("It freezes into solid rock"))).toBe(1);
    const used = new Set<string>();
    const j = swapFlaggedJokeAnswers(s, used);
    const r = swapRepeatedAnswers(j.stack, used);
    // Both flagged answers sit on three-answer cards with no safe candidate: they are left, with their notes.
    expect([j.swapped, j.removed, j.left]).toEqual([0, 0, 2]);
    expect(r.stack).toEqual(s);
    const after = cardsPerLabel(r.stack);
    for (const [k, n] of after) expect(n, k).toBeLessThanOrEqual(before.get(k) ?? 0);
    expect(after.get(answerKey("It freezes into solid rock"))).toBe(1);
    // The pass never adds an "only two answers" warning, and blocks nothing new.
    const twoAnswers = (x: Stack): number => lessonWarnings(x).filter((w) => w.code === "two-answers").length;
    expect(twoAnswers(r.stack)).toBe(twoAnswers(s));
    expect(beforeYouShare(r.stack).ok).toBe(beforeYouShare(s).ok);
    const jokes = lessonWarnings(r.stack).filter((w) => w.code === "joke-answer").map((w) => w.labels![0]).sort();
    expect(jokes).toEqual(["It makes the water heavier", "It turns into solid ice"]);
    expect(validate(r.stack).valid).toBe(true);
  });

  it("TASK-42b11: the blocking share-check problems after the passes are a subset of those before (fast-check)", () => {
    fc.assert(
      fc.property(deckArb, ({ stack }) => {
        const used = new Set<string>();
        const j = swapFlaggedJokeAnswers(stack, used);
        const r = swapRepeatedAnswers(j.stack, used);
        const blockingBefore = new Set(beforeYouShare(stack).lines);
        for (const line of beforeYouShare(r.stack).lines) expect(blockingBefore.has(line), line).toBe(true);
        const two = (x: Stack): Set<string> => new Set(lessonWarnings(x).filter((w) => w.code === "two-answers").map((w) => w.cardId));
        for (const id of two(r.stack)) expect(two(stack).has(id)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("TASK-42b10: a safe candidate is short, on at most one card, not used twice, and the same kind of answer as the right one", () => {
    const q2 = { q: "What does cold air do to water vapour?", a: [["It condenses", true], ["It melts", false], ["Ice", false]] as Array<[string, boolean]> };
    // Two flagged answers, one safe candidate ("It melts"): the first is swapped, the second cannot reuse it and is removed.
    const two = chain([
      { q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It turns bright pink", false], ["It freezes", false]] },
      q2,
    ]);
    const r = swapFlaggedJokeAnswers(two);
    expect([r.swapped, r.removed]).toEqual([1, 1]);
    expect(labels(r.stack.cards[0]!)).toEqual(["It evaporates", "It melts", "It freezes"]);
    // Too long: four words or more never come in automatically.
    const long = chain([
      { q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It freezes", false]] },
      { q: "What does cold air do to water vapour?", a: [["It condenses", true], ["It melts the frozen lake", false], ["It boils", false]] },
    ]);
    expect(labels(swapFlaggedJokeAnswers(long).stack.cards[0]!)).not.toContain("It melts the frozen lake");
    // Already on two cards: not safe.
    const spread = chain([
      { q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It freezes", false]] },
      { q: "What does cold air do to water vapour?", a: [["It condenses", true], ["It sinks", false], ["It boils", false]] },
      { q: "What does warm air do?", a: [["It rises", true], ["It sinks", false], ["It shrinks", false]] },
    ]);
    const sp = swapFlaggedJokeAnswers(spread).stack;
    expect(labels(sp.cards[0]!)).not.toContain("It sinks");
    // Not the same kind: a noun phrase never replaces an answer to a "what happens" (verb) question.
    const kind = chain([
      { q: "What happens to water when it is heated?", a: [["It evaporates", true], ["It glows", false], ["It freezes", false]] },
      { q: "On which day do clothes dry fastest?", a: [["A sunny day", true], ["A damp day", false], ["A cold night", false]] },
    ]);
    const k = swapFlaggedJokeAnswers(kind);
    expect([k.swapped, k.removed, k.left]).toEqual([0, 0, 1]);
    expect(labels(k.stack.cards[0]!)).toEqual(["It evaporates", "It glows", "It freezes"]);
  });

  it("TASK-42b10: a removal that would strand a card is not made (the answer is left)", () => {
    const [a, b, c, e] = ids(4);
    // The joke answer on card A is the only way to card C (and the card has two other wrong answers, so only the strand guard blocks it).
    const cardA = quiz(a!, "What happens to water when it is heated?", [["It evaporates", true], ["It freezes", false], ["It boils", false]], b!);
    cardA.elements.push(answer("It glows", false, c!, 3));
    const s = deck([
      cardA,
      quiz(b!, "What falls from clouds?", [["Rain", true], ["Sand", false]], e!),
      quiz(c!, "Where does rain go?", [["Into rivers", true], ["Into space", false]], e!),
      endCard(e!),
    ]);
    expect(validate(s).valid).toBe(true);
    const r = swapFlaggedJokeAnswers(s);
    expect(r.removed).toBe(0);
    expect(r.left).toBe(1);
    expect(reachableIds(r.stack)).toEqual(reachableIds(s));
  });

  it("TASK-42b10: no wrong-answer label spreads beyond two cards because of the passes, and each added label was on at most one card (fast-check)", () => {
    fc.assert(
      fc.property(deckArb, ({ stack }) => {
        const before = cardsPerLabel(stack);
        const used = new Set<string>();
        const j = swapFlaggedJokeAnswers(stack, used);
        const r = swapRepeatedAnswers(j.stack, used);
        const after = cardsPerLabel(r.stack);
        for (const [k, n] of after) {
          const was = before.get(k) ?? 0;
          // A label on more cards than before was on at most one, and gained exactly one card.
          if (n > was) {
            expect(was, k).toBeLessThanOrEqual(1);
            expect(n, k).toBe(was + 1);
          }
          expect(n, k).toBeLessThanOrEqual(Math.max(was, 2));
        }
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// b6: properties

const RIGHTS = ["Condensation", "Evaporation", "Rain", "12", "True", "The sun", "Clouds"];
const WRONGS = ["It glows", "Turns bright pink", "Into the moon", "Melting", "Freezing", "Steam", "Smoke", "the cloud", "Sun", "8", "False", "Magic dust", "Boiling"];

/** A random deck: quiz cards from a small pool (so repeats, jokes and duplicates happen), linked in a chain with an optional fork. */
const deckArb = fc
  .record({
    cards: fc.array(
      fc.record({
        right: fc.constantFrom(...RIGHTS),
        wrong: fc.uniqueArray(fc.constantFrom(...WRONGS), { minLength: 1, maxLength: 3 }),
        topic: fc.constantFrom("water", "weather", "numbers", "sky"),
      }),
      { minLength: 1, maxLength: 7 },
    ),
    fork: fc.boolean(),
    asked: fc.option(fc.integer({ min: 1, max: 7 }), { nil: undefined }),
  })
  .map(({ cards, fork, asked }) => {
    const cardIds = ids(cards.length + 1);
    const out: Card[] = cards.map((c, i) => {
      const wrong = c.wrong.filter((w) => w !== c.right);
      const answers: Array<[string, boolean]> = [[c.right, true], ...wrong.map((w): [string, boolean] => [w, false])];
      if (answers.length < 2) answers.push([`Not ${c.right} ${i}`, false]);
      // An optional fork: the first card's wrong answers jump to the card after next.
      const card = quiz(cardIds[i]!, `Question ${i} about the ${c.topic}?`, answers, cardIds[i + 1]!);
      if (fork && i === 0 && cards.length > 2) {
        card.elements = card.elements.map((e, k) =>
          e.type === "button" && k > 1 ? { ...e, actions: e.actions.map((a) => (a.type === "goto" ? { ...a, cardId: cardIds[2]! } : a)) } : e,
        );
      }
      return card;
    });
    return { stack: deck([...out, endCard(cardIds[cards.length]!)]), asked };
  });

const oneRightEach = (s: Stack): boolean =>
  s.cards.filter((c) => c.kind === "quiz").every((c) => quizAnswers(c).filter((b) => b.actions.some((a) => a.type === "score" && a.delta === 1)).length === 1);

describe("TASK-42b6: the passes keep every stack sound (fast-check)", () => {
  it("TASK-42b6: after the joke, repeated-answer and trim passes: valid, one right answer per quiz, no right answer label changed, only labels changed, nothing reachable stranded", () => {
    fc.assert(
      fc.property(deckArb, ({ stack, asked }) => {
        expect(validate(stack).valid).toBe(true);
        const jokes = swapFlaggedJokeAnswers(stack);
        const reps = swapRepeatedAnswers(jokes.stack);
        const trimmed = trimToRequestedCountsDetailed(reps.stack, asked === undefined ? {} : { quiz: asked });
        for (const s of [jokes.stack, reps.stack, trimmed.stack]) {
          expect(validate(s).valid).toBe(true);
          expect(oneRightEach(s)).toBe(true);
          for (const [id, label] of rights(s)) expect(label).toBe(rights(stack).get(id));
        }
        // The answer passes change labels or remove a wrong answer: same cards, kept elements keep their ids and actions, nothing reachable is lost.
        for (const s of [jokes.stack, reps.stack]) {
          expect(s.cards.map((c) => c.id)).toEqual(stack.cards.map((c) => c.id));
          s.cards.forEach((c, i) => {
            const before = stack.cards[i]!;
            const beforeIds = before.elements.map((e) => e.id);
            expect(c.elements.every((e) => beforeIds.includes(e.id))).toBe(true);
            for (const e of c.elements) {
              const was = before.elements.find((x) => x.id === e.id)!;
              if (e.type === "button") expect(e.actions).toEqual((was as ButtonElement).actions);
              else expect(e).toEqual(was);
            }
            // A removed element is only ever a wrong answer.
            for (const gone of before.elements.filter((e) => !c.elements.some((x) => x.id === e.id))) {
              expect(gone.type === "button" && !gone.actions.some((a) => a.type === "score" && a.delta === 1)).toBe(true);
            }
          });
          const reach = reachableIds(s);
          for (const r of reachableIds(stack)) expect(reach.has(r)).toBe(true);
        }
        // Trimming never goes below the count asked, and strands no card that was reachable.
        const quizBefore = reps.stack.cards.filter((c) => c.kind === "quiz").length;
        const quizAfter = trimmed.stack.cards.filter((c) => c.kind === "quiz").length;
        if (asked === undefined) expect(quizAfter).toBe(quizBefore);
        else expect(quizAfter).toBeGreaterThanOrEqual(Math.min(asked, quizBefore));
        const kept = new Set(trimmed.stack.cards.map((c) => c.id));
        const after = reachableIds(trimmed.stack);
        for (const r of reachableIds(reps.stack)) if (kept.has(r)) expect(after.has(r)).toBe(true);
        // Swapped labels (matched by element id) are never another quiz card's right answer, and never flagged.
        for (const c of reps.stack.cards) {
          if (c.kind !== "quiz") continue;
          const orig = stack.cards.find((x) => x.id === c.id)!;
          for (const b of quizAnswers(c)) {
            const was = quizAnswers(orig).find((x) => x.id === b.id)!;
            if (b.label === was.label) continue;
            expect([...rights(stack).values()].map(answerKey)).not.toContain(answerKey(b.label));
            expect(jokeAnswerReason(b, c)).toBeNull();
          }
        }
      }),
      { numRuns: 300 },
    );
  });

  it("TASK-42b6: the finalise step with the new passes is valid, keeps one right answer per quiz, and is deterministic", () => {
    fc.assert(
      fc.property(deckArb, ({ stack, asked }) => {
        const prompt = asked === undefined ? "a quiz about the water cycle" : `A ${asked}-question quiz about the water cycle`;
        const a = finaliseGeneratedStackDetailed(stack, { prompt });
        const b = finaliseGeneratedStackDetailed(structuredClone(stack), { prompt });
        expect(validate(a.stack).valid).toBe(true);
        expect(oneRightEach(a.stack)).toBe(true);
        expect(b).toEqual(a);
        expect(a.swappedJokes + a.swappedRepeats + a.droppedSameAnswer).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });
});
