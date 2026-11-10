// tests/joke-answers.test.ts
// TASK-34a1–a4: no joke distractors. The ground truth is the lesson-checker
// persona's label of every v2 distractor (bench/distractor-review.json; an AI
// review); the "may be a joke answer" check is measured against it; the prompts
// ask for a mistake a pupil might really make; the bench can re-record only the
// affected objectives and keeps v2 beside v1 and the current run.

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { jokeAnswerReason, lessonWarnings, describeLessonWarnings, JOKE_MARKERS } from "../src/shared/lessonCheck.js";
import { build, buildStream, buildRetry } from "../server/promptBuilder.js";
import { evaluate } from "../scripts/distractor-eval.js";
import { stackOfFile, type DistractorReview } from "../scripts/build-distractor-review.js";
import { parseRerecordFile } from "../scripts/bench.js";
import type { BenchCache, BenchSummary } from "../scripts/bench-lib.js";
import type { ButtonElement, Card, Stack } from "../src/shared/types.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const review = JSON.parse(read("bench/distractor-review.json")) as DistractorReview;
const rerecord = parseRerecordFile(read("bench/rerecord.txt"));

const u = (n: number): string => `34a00000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
function quiz(question: string, right: string, wrong: string[]): Card {
  const btn = (i: number, label: string, delta: 0 | 1): ButtonElement => ({
    type: "button", id: u(100 + i), x: 48, y: 296, w: 344, h: 88, label, actions: [{ type: "score", delta }, { type: "goto", cardId: u(2) }],
  });
  return {
    id: u(1), kind: "quiz", actions: [],
    elements: [{ type: "text", id: u(10), x: 48, y: 104, w: 704, h: 144, content: question }, btn(0, right, 1), ...wrong.map((w, i) => btn(i + 1, w, 0))],
  };
}
const answer = (c: Card, label: string): ButtonElement => c.elements.find((e): e is ButtonElement => e.type === "button" && e.label === label)!;

/** True when the deck's cache is still its v2 recording (not yet re-recorded for v3). */
function stillV2(id: string): boolean {
  const p = path.join(ROOT, "bench", "cache", `${id}.json`);
  if (!existsSync(p) || rerecord.v2Until === null) return false;
  return (JSON.parse(readFileSync(p, "utf8")) as BenchCache).recordedAt <= rerecord.v2Until;
}

describe("TASK-34a1: the ground truth — every v2 distractor labelled by the lesson-checker persona", () => {
  it("TASK-34a1: 54 decks, every quiz card, every wrong answer, each 'plausible' or 'absurd'; every absurd one has a reason", () => {
    expect(review.decks.length).toBe(54);
    let n = 0;
    for (const d of review.decks) for (const c of d.cards) for (const x of c.distractors) {
      n++;
      expect(["plausible", "absurd"]).toContain(x.label);
      if (x.label === "absurd") expect((x.reason ?? "").length, `${d.id} card ${c.card} "${x.option}"`).toBeGreaterThan(10);
      expect(x.option).not.toBe(c.right);
    }
    expect(n).toBe(review.totals.distractors);
    const absurd = review.decks.flatMap((d) => d.cards.flatMap((c) => c.distractors)).filter((x) => x.label === "absurd").length;
    expect(absurd).toBe(review.totals.absurd);
    expect(review.about).toContain("It is an AI review, not a teacher's.");
  });

  it("TASK-34a1: while a deck is still its v2 recording, the review lists exactly its file's quiz cards and wrong answers", () => {
    let checked = 0;
    for (const d of review.decks) {
      if (!stillV2(d.id)) continue;
      checked++;
      const s = stackOfFile(read(`bench/files/${d.id}.html`));
      const quizzes = s.cards.map((c, i) => ({ c, i })).filter((x) => x.c.kind === "quiz");
      expect(d.cards.map((c) => c.card), d.id).toEqual(quizzes.map((x) => x.i + 1));
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("TASK-34a1: LESSON_CHECKER.md has the v2 distractor review with the same totals, and says it is an AI review", () => {
    const md = read("bench/LESSON_CHECKER.md");
    const v = md.slice(md.indexOf("## v2 distractor review"));
    expect(v.length).toBeGreaterThan(100);
    const t = review.totals;
    expect(v).toContain(`${t.distractors} distractors`);
    expect(v).toContain(`${t.absurd} absurd`);
    expect(v).toContain(`${t.decksWithAbsurd} of ${t.decks} decks`);
    expect(v).toContain("an AI review, not a teacher's");
  });
});

describe("TASK-34a2: 'may be a joke answer' — cheap, explainable, measured", () => {
  it("TASK-34a2: labelled absurd examples are flagged, with the marker that caught them", () => {
    const cases: Array<[string, string, string, string]> = [
      ["What is the job of a skeleton?", "To support and protect the body", "To make the body glow in the dark", "glowing"],
      ["What happens to the eardrum when sound vibrations reach it?", "It shakes", "It turns to ice", "turning to ice"],
      ["When you pluck a guitar string, what happens?", "The string vibrates and makes sound", "The string changes colour", "a colour change offered as the result"],
      ["What shape is the sun?", "Round like a ball", "Square like a box", "an impossible shape"],
      ["Why does the lamp light when the switch is closed?", "Electricity can flow all the way round", "The switch makes the lamp heavier", "weight with no part in it"],
      ["What happens to most people's hair as they get older?", "It can turn grey", "It turns bright green", "a joke colour"],
    ];
    for (const [q, right, wrong, why] of cases) {
      const c = quiz(q, right, [wrong, "A plausible mistake"]);
      expect(jokeAnswerReason(answer(c, wrong), c), wrong).toBe(why);
      expect(jokeAnswerReason(answer(c, "A plausible mistake"), c)).toBeNull();
    }
  });

  it("TASK-34a2: labelled plausible examples are NOT flagged (misconceptions are new words too)", () => {
    const cases: Array<[string, string, string[]]> = [
      ["Which metal is magnetic?", "Steel", ["Gold", "Copper", "Aluminium"]],
      ["Which of these is a solid?", "A rock", ["Steam", "Milk"]],
      ["What makes a sound?", "Something vibrating", ["Something getting heavier", "Something getting colder"]],
      ["Which property describes how hard a material is to scratch?", "Hardness", ["Smell", "Colour"]],
      ["Wax melts when heated. What happens when it cools?", "It turns back into a solid", ["It disappears", "It turns into a gas"]],
      ["What happens to water in a freezer?", "It turns to ice", ["It turns to steam"]],
    ];
    for (const [q, right, wrong] of cases) {
      const c = quiz(q, right, wrong);
      for (const w of wrong) expect(jokeAnswerReason(answer(c, w), c), w).toBeNull();
    }
  });

  it("TASK-34a2: property — the check never flags the right answer, whatever its words", () => {
    const markerWords = fc.constantFrom("glows in the dark", "magic", "turns to ice", "changes colour", "square like a box", "makes the clip heavier", "plain words");
    fc.assert(
      fc.property(markerWords, fc.string({ maxLength: 30 }), fc.array(fc.oneof(markerWords, fc.string({ minLength: 1, maxLength: 30 })), { minLength: 1, maxLength: 3 }), (rightWords, q, wrong) => {
        const right = `Right: ${rightWords}`;
        const c = quiz(q || "A question?", right, wrong.map((w, i) => `${w} ${i}`));
        return jokeAnswerReason(answer(c, right), c) === null;
      }),
      { numRuns: 300 },
    );
  });

  it("TASK-34a2: the lesson check warns once per joke answer, in plain words, and never on the right answer", () => {
    const c = quiz("What is the job of a skeleton?", "To support and protect the body", ["To make the body glow in the dark", "To store water"]);
    const end: Card = { id: u(2), kind: "end", actions: [], elements: [{ type: "text", id: u(20), x: 48, y: 120, w: 704, h: 72, content: "Done" }] };
    const s: Stack = { id: u(0), title: "T", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" }, cards: [c, end] };
    const w = lessonWarnings(s).filter((x) => x.code === "joke-answer");
    expect(w.length).toBe(1);
    expect(describeLessonWarnings(s, w, () => "Card 1")).toEqual([
      "Card 1: “To make the body glow in the dark” may be a joke answer; use a mistake a pupil might really make.",
    ]);
  });

  it("TASK-34a2: against the ground truth, precision ≥ 0.8; the numbers in DIAGNOSIS.md are the measured ones", () => {
    const e = evaluate(review);
    expect(e.tp + e.fp).toBeGreaterThan(0);
    expect(e.precision).toBeGreaterThanOrEqual(0.8);
    const d = read("bench/DIAGNOSIS.md");
    expect(d).toContain(`precision ${e.precision.toFixed(2)} (${e.tp} of ${e.tp + e.fp} flags), recall ${e.recall.toFixed(2)} (${e.tp} of ${e.tp + e.fn} absurd distractors)`);
    expect(JOKE_MARKERS.length).toBeLessThanOrEqual(20);
  });
});

describe("TASK-34a3: the prompts ask for a mistake a pupil might really make", () => {
  const prompts = (): Array<[string, string]> => [
    ["one-shot", build({ prompt: "a quiz" }).system],
    ["streaming", buildStream({ prompt: "a quiz" }).system],
    ["retry", buildRetry({ prompt: "a quiz" }, ["quiz-answer"]).system],
  ];
  it("TASK-34a3: one neutral pattern, 'never silly, magic or impossible options', in all three prompts", () => {
    for (const [name, sys] of prompts()) {
      expect(sys, name).toContain("Every wrong answer must be a mistake a pupil might really make");
      expect(sys, name).toContain("start from the right answer and change the one part a pupil who half-remembers the lesson gets wrong");
      expect(sys, name).toContain("Never silly, magic or impossible options.");
      expect(sys, name).toMatch(/never a joke option/);
    }
  });
  it("TASK-34a3: the rule copies no answer from the bench review", () => {
    const sys = buildStream({ prompt: "a quiz" }).system.toLowerCase();
    const absurd = review.decks.flatMap((d) => d.cards.flatMap((c) => c.distractors)).filter((x) => x.label === "absurd").map((x) => x.option.toLowerCase());
    for (const a of absurd) if (a.split(" ").length >= 3) expect(sys, a).not.toContain(a);
  });
});

describe("TASK-34a4: re-record only the affected objectives; keep v2", () => {
  it("TASK-34a4: bench/rerecord.txt is exactly the decks with at least one absurd distractor, plus the v2 cut-off", () => {
    const want = review.decks.filter((d) => d.cards.some((c) => c.distractors.some((x) => x.label === "absurd"))).map((d) => d.id);
    expect(rerecord.ids).toEqual(want);
    expect(rerecord.ids.length).toBe(review.totals.decksWithAbsurd);
    expect(rerecord.v2Until).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(parseRerecordFile("# c\na\n b # x\n\n# v2-recorded-until: T\n")).toEqual({ ids: ["a", "b"], v2Until: "T" });
  });

  it("TASK-34a4: bench:record accepts --only-file", () => {
    expect(read("scripts/bench.ts")).toContain('arg("--only-file")');
  });

  it("TASK-34a4: results-v2.json keeps the v2 summary; RESULTS.md shows v1, v2 and the current run, and what v3 re-records", () => {
    const v2 = (JSON.parse(read("bench/results-v2.json")) as { summary: BenchSummary }).summary;
    expect(v2).toMatchObject({ objectives: 55, recorded: 55, firstTry: 54, lessonClean: 48, countsOk: 47 });
    const md = read("bench/RESULTS.md");
    const a = md.indexOf("## v1 (before the TASK-33 prompt fixes)");
    const b = md.indexOf("## v2 (before the TASK-34a distractor fixes)");
    const c = md.indexOf("## Current run");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(md.slice(b, c)).toContain("| Passed our automatic lesson check with no warnings | 48 of 55 |");
    expect(md.slice(c)).toContain(`re-recorded only the ${rerecord.ids.length} objectives listed in [\`rerecord.txt\`](rerecord.txt)`);
  });
});
