// tests/joke-answers-v3.test.ts
// TASK-34a5 (the v3 distractor and key review of the 34 re-recorded decks) and
// TASK-34a6 (the claim line, checked against the review JSONs).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildReview, reviewTotals, type DistractorReview } from "../scripts/build-distractor-review.js";
import { evaluate } from "../scripts/distractor-eval.js";
import { parseRerecordFile } from "../scripts/bench.js";
import {
  compareJoke,
  fixJoke,
  jokeFromReviews,
  jokeLine,
  jokeSentence,
  readJokeClaim,
  keyReviewLine,
  JOKE_DISCLAIMER,
  type JokeNumbers,
} from "../scripts/claims-lib.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const v2 = JSON.parse(read("bench/distractor-review.json")) as DistractorReview;
const v3 = JSON.parse(read("bench/distractor-review-v3.json")) as DistractorReview;
const ids = parseRerecordFile(read("bench/rerecord.txt")).ids;

describe("TASK-34a5: the v3 review of the 34 re-recorded decks", () => {
  it("TASK-34a5: a fresh build from the labels and the files equals bench/distractor-review-v3.json", () => {
    const fresh = buildReview(path.join(ROOT, "bench", "distractor-labels-v3.json"), ids);
    expect(JSON.stringify(fresh, null, 2) + "\n").toBe(read("bench/distractor-review-v3.json"));
  });

  it("TASK-34a5: exactly the re-recorded decks; every distractor labelled, every key judged, a reason wherever it is not fine", () => {
    expect(v3.decks.map((d) => d.id)).toEqual(ids);
    for (const d of v3.decks) for (const c of d.cards) {
      expect(["correct", "wrong", "ambiguous"]).toContain(c.key!.verdict);
      if (c.key!.verdict !== "correct") expect((c.key!.reason ?? "").length, `${d.id} card ${c.card}`).toBeGreaterThan(10);
      for (const x of c.distractors) if (x.label === "absurd") expect((x.reason ?? "").length, `${d.id} card ${c.card} "${x.option}"`).toBeGreaterThan(10);
    }
    expect(v3.totals).toEqual(reviewTotals(v3.decks));
    expect(v3.about).toContain("It is an AI review, not a teacher's.");
  });

  it("TASK-34a5: LESSON_CHECKER.md's before/after table and the out-of-sample numbers are the measured ones", () => {
    const j = jokeFromReviews(v2, v3);
    const md = read("bench/LESSON_CHECKER.md");
    const s = md.slice(md.indexOf("## v3 distractor review (34 re-recorded decks)"));
    expect(s).toContain("run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's");
    expect(s).toContain(`| Wrong answers | ${j.beforeTotal} | ${j.afterTotal} |`);
    expect(s).toContain(`| Absurd wrong answers | ${j.beforeAbsurd} | ${j.afterAbsurd} |`);
    const per = (a: number, n: number): string => ((100 * a) / n).toFixed(1);
    expect(s).toContain(`| Absurd per 100 wrong answers | ${per(j.beforeAbsurd, j.beforeTotal)} | ${per(j.afterAbsurd, j.afterTotal)} |`);
    const before = v2.decks.filter((d) => ids.includes(d.id) && d.cards.some((c) => c.distractors.some((x) => x.label === "absurd"))).length;
    expect(s).toContain(`| Decks with at least one absurd wrong answer | ${before} of ${ids.length} | ${v3.totals.decksWithAbsurd} of ${ids.length} |`);
    expect(s).toContain(`| Wrong keys | not reviewed`);
    expect(s).toContain(`| ${v3.totals.wrongKeys} |`);
    const e2 = evaluate(v2);
    const e3 = evaluate(v3);
    expect(s).toContain(`| v2 (in-sample, the data it was tuned on) | ${e2.precision.toFixed(2)} (${e2.tp} of ${e2.tp + e2.fp}) | ${e2.recall.toFixed(2)} (${e2.tp} of ${e2.tp + e2.fn}) |`);
    expect(s).toContain(`| v3 (out-of-sample) | ${e3.precision.toFixed(2)} (${e3.tp} of ${e3.tp + e3.fp}) | ${e3.recall.toFixed(2)} (${e3.tp} of ${e3.tp + e3.fn}) |`);
    for (const d of v3.decks) for (const c of d.cards) if (c.key!.verdict === "wrong") expect(s).toContain(`${d.id} card ${c.card}`);
  });

  it("TASK-34a5: the v2 review still measures the same from its JSON alone (in-sample precision 1.00)", () => {
    const e = evaluate(v2);
    expect([e.tp, e.fp]).toEqual([20, 0]);
  });
});

describe("TASK-34a6: the joke-answer claim line", () => {
  const j: JokeNumbers = { decks: 34, beforeAbsurd: 96, beforeTotal: 339, afterAbsurd: 74, afterTotal: 336, wrongKeys: 3 };

  it("TASK-34a6: the sentence reads back; a right line passes, every wrong number fails, the disclaimer is required", () => {
    expect(jokeSentence(j)).toBe(
      "In the 34 re-recorded decks, an AI review found joke answers fell from 96 of 339 to 74 of 336 wrong answers; 3 wrong keys (bench/LESSON_CHECKER.md).",
    );
    expect(jokeSentence({ ...j, wrongKeys: 1 })).toContain("; 1 wrong key (");
    const line = jokeLine(j);
    expect(readJokeClaim(line)).toEqual(j);
    expect(compareJoke(line, "README", j).every((c) => c.ok)).toBe(true);
    for (const k of Object.keys(j) as Array<keyof JokeNumbers>) {
      expect(compareJoke(line, "README", { ...j, [k]: j[k] + 1 }).every((c) => c.ok), k).toBe(false);
    }
    expect(compareJoke(line.replace(JOKE_DISCLAIMER, ""), "README", j).map((c) => c.ok)).toContain(false);
    expect(compareJoke(line, "README", null).map((c) => c.ok)).toEqual([false]);
    expect(compareJoke("nothing", "README", null)).toEqual([]);
    expect(compareJoke("nothing", "README", j).map((c) => c.ok)).toEqual([false]);
  });

  it("TASK-34a6: --fix inserts the line after the key-review line, then rewrites its numbers in place", () => {
    const key = keyReviewLine({ cards: 60, decks: 12, wrong: 0, ambiguous: 2 });
    const inserted = fixJoke(`a\n${key}\nb\n`, j);
    expect(inserted.split("\n")[2]).toBe(jokeLine(j));
    const moved = fixJoke(inserted, { ...j, afterAbsurd: 10 });
    expect(readJokeClaim(moved)!.afterAbsurd).toBe(10);
    expect(moved.split("re-recorded decks, an AI review").length).toBe(2);
  });

  it("TASK-34a6: the README and the write-up carry the line, matching the reviews", () => {
    const want = jokeFromReviews(v2, v3);
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      expect(readJokeClaim(read(f)), f).toEqual(want);
      expect(read(f).split("\n").find((l) => l.includes("re-recorded decks, an AI review")), f).toContain(JOKE_DISCLAIMER);
    }
  });

  it("TASK-34a6: RESULTS.md says the current run re-recorded only the listed objectives", () => {
    expect(read("bench/RESULTS.md")).toContain(`The current run (v3) re-recorded only the ${ids.length} objectives listed in [\`rerecord.txt\`](rerecord.txt)`);
    expect(read("bench/RESULTS.md")).toContain(`Re-recorded so far: ${ids.length} of ${ids.length}.`);
  });
});
