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
const v4 = JSON.parse(read("bench/distractor-review-v4.json")) as DistractorReview;
const ids = parseRerecordFile(read("bench/rerecord.txt")).ids;

describe("TASK-34a5: the v3 review of the 34 re-recorded decks", () => {
  it("TASK-34a5: the v3 review is frozen (its decks were re-recorded for v4): its totals still recompute from its own labels", () => {
    expect(v3.totals).toEqual(reviewTotals(v3.decks));
    expect(v3.totals).toMatchObject({ decks: 34, distractors: 336, absurd: 74, wrongKeys: 3, ambiguousKeys: 6 });
    void buildReview;
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
  const j: JokeNumbers = { decks: 32, beforeAbsurd: 88, beforeTotal: 319, afterAbsurd: 72, afterTotal: 317, version: "v4", wrongKeys: 1 };

  it("TASK-34a6: the sentence reads back; a right line passes, every wrong number fails, the disclaimer is required", () => {
    expect(jokeSentence(j)).toBe(
      "In the 32 re-recorded decks that became lesson files, an AI review found joke answers fell from 88 of 319 (v2) to 72 of 317 (v4) wrong answers; 1 wrong key (bench/LESSON_CHECKER.md).",
    );
    expect(jokeSentence({ ...j, wrongKeys: 3 })).toContain("; 3 wrong keys (");
    const line = jokeLine(j);
    expect(readJokeClaim(line)).toEqual(j);
    expect(compareJoke(line, "README", j).every((c) => c.ok)).toBe(true);
    for (const k of Object.keys(j) as Array<keyof JokeNumbers>) {
      const bad = { ...j, [k]: typeof j[k] === "number" ? (j[k] as number) + 1 : "v9" };
      expect(compareJoke(line, "README", bad).every((c) => c.ok), k).toBe(false);
    }
    expect(compareJoke(line.replace(JOKE_DISCLAIMER, ""), "README", j).map((c) => c.ok)).toContain(false);
    expect(compareJoke(line, "README", null).map((c) => c.ok)).toEqual([false]);
    expect(compareJoke("nothing", "README", null)).toEqual([]);
    expect(compareJoke("nothing", "README", j).map((c) => c.ok)).toEqual([false]);
  });

  it("TASK-34a6: --fix inserts the line after the key-review line, rewrites its numbers in place, and replaces the v3-era wording", () => {
    const key = keyReviewLine({ cards: 60, decks: 12, wrong: 0, ambiguous: 2 });
    const inserted = fixJoke(`a\n${key}\nb\n`, j);
    expect(inserted.split("\n")[2]).toBe(jokeLine(j));
    const moved = fixJoke(inserted, { ...j, afterAbsurd: 10 });
    expect(readJokeClaim(moved)!.afterAbsurd).toBe(10);
    expect(moved.split("re-recorded decks that became lesson files").length).toBe(2);
    const old = "- In the 34 re-recorded decks, an AI review found joke answers fell from 96 of 339 to 74 of 336 wrong answers; 3 wrong keys (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's.";
    expect(readJokeClaim(fixJoke(old, j))).toEqual(j);
  });

  it("TASK-34a9: the README and the write-up carry the line, recounted from the v2 and v4 reviews", () => {
    const want = jokeFromReviews(v2, v4, "v4");
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      expect(readJokeClaim(read(f)), f).toEqual(want);
      expect(read(f).split("\n").find((l) => l.includes("re-recorded decks that became lesson files")), f).toContain(JOKE_DISCLAIMER);
    }
  });
});

describe("TASK-34a9: the v4 (why-field prompt) review of the same 34 objectives", () => {
  it("TASK-34a9: a fresh build from the labels and the files equals bench/distractor-review-v4.json; the decks with no file are listed", () => {
    const fresh = buildReview(path.join(ROOT, "bench", "distractor-labels-v4.json"), ids);
    expect(JSON.stringify(fresh, null, 2) + "\n").toBe(read("bench/distractor-review-v4.json"));
    expect([...v4.decks.map((d) => d.id), ...(v4.noFile ?? [])].sort()).toEqual([...ids].sort());
    expect(v4.noFile).toEqual(["y5-earth-space-3", "y5-materials-5"]);
    for (const d of v4.decks) for (const c of d.cards) {
      expect(["correct", "wrong", "ambiguous"]).toContain(c.key!.verdict);
      if (c.key!.verdict !== "correct") expect((c.key!.reason ?? "").length).toBeGreaterThan(10);
      for (const x of c.distractors) if (x.label === "absurd") expect((x.reason ?? "").length, `${d.id} card ${c.card}`).toBeGreaterThan(10);
    }
    expect(v4.about).toContain("It is an AI review, not a teacher's.");
  });

  it("TASK-34a9: LESSON_CHECKER.md's v2 → v3 → v4 table and the v4 precision / recall are the measured ones", () => {
    const md = read("bench/LESSON_CHECKER.md");
    const s = md.slice(md.indexOf("## v4 (why-field prompt)"));
    expect(s).toContain("run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's");
    const on = new Set(v4.decks.map((d) => d.id));
    const stats = (r: DistractorReview) => {
      const ds = r.decks.filter((d) => on.has(d.id));
      const xs = ds.flatMap((d) => d.cards.flatMap((c) => c.distractors));
      const a = xs.filter((x) => x.label === "absurd").length;
      const cards = ds.flatMap((d) => d.cards);
      return {
        per: ((100 * a) / xs.length).toFixed(1),
        decks: ds.filter((d) => d.cards.some((c) => c.distractors.some((x) => x.label === "absurd"))).length,
        wrong: cards.filter((c) => c.key?.verdict === "wrong").length,
        amb: cards.filter((c) => c.key?.verdict === "ambiguous").length,
      };
    };
    const [a, b, c] = [stats(v2), stats(v3), stats(v4)];
    const n = on.size;
    expect(s).toContain(`| Absurd per 100 wrong answers | ${a.per} | ${b.per} | ${c.per} |`);
    expect(s).toContain(`| Decks with at least one absurd wrong answer | ${a.decks} of ${n} | ${b.decks} of ${n} | ${c.decks} of ${n} |`);
    expect(s).toContain(`| Wrong keys | not reviewed | ${b.wrong} | ${c.wrong} |`);
    expect(s).toContain(`| Ambiguous keys | not reviewed | ${b.amb} | ${c.amb} |`);
    const e = evaluate(v4);
    expect(s).toContain(`precision ${e.precision.toFixed(2)} (${e.tp} of ${e.tp + e.fp}), recall ${e.recall.toFixed(2)} (${e.tp} of ${e.tp + e.fn})`);
    for (const id of v4.noFile ?? []) expect(s).toContain(id);
  });

  it("TASK-34a9: RESULTS.md shows v1, v2, v3 and the current run, and says the current run re-recorded only the listed objectives", () => {
    const md = read("bench/RESULTS.md");
    const at = ["## v1 (", "## v2 (", "## v3 (before the TASK-34a7 why-field prompt)", "## Current run"].map((h) => md.indexOf(h));
    expect(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1]!))).toBe(true);
    const v3s = (JSON.parse(read("bench/results-v3.json")) as { summary: { firstTry: number; lessonClean: number } }).summary;
    expect(v3s).toMatchObject({ firstTry: 54, lessonClean: 44 });
    expect(md.slice(at[2]!, at[3]!)).toContain("| Valid lesson file on the first try (no retry, no fallback) | 54 of 55 |");
    expect(md).toContain(`The current run (v4) re-recorded only the same ${ids.length} objectives listed in [\`rerecord.txt\`](rerecord.txt)`);
    expect(md).toContain(`Re-recorded so far: ${ids.length} of ${ids.length}.`);
  });
});
