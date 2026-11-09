// tests/bench-v3.test.ts
// TASK-33c14–c16 (.kiro/specs/curriculum-bench/tasks.md): the bench lines say the
// lesson check is automatic and does not verify facts; a key-accuracy sample by
// the lesson-checker persona, machine-readable in bench/key-review.json and
// checked by check:claims.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  BENCH_MECHANICAL,
  benchSentence,
  compareBench,
  fixBench,
  readBenchClaim,
  readmeBenchLine,
  writeupBenchLine,
  README_BENCH_ANCHOR,
  compareKeyReview,
  fixKeyReview,
  keyReviewLine,
  keyReviewTotals,
  keySentence,
  readKeyClaim,
  type BenchNumbers,
  type KeyReview,
} from "../scripts/claims-lib.js";
import { keyReviewSample, type Objective } from "../scripts/bench-lib.js";
import { primaryText } from "../src/shared/cardTitle.js";
import { rightAnswer } from "../src/shared/lessonCheck.js";
import type { Stack } from "../src/shared/types.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const b: BenchNumbers = { objectives: 55, firstTry: 54, lessonClean: 48 };

describe("TASK-33c14: 'our automatic lesson check', and it does not verify facts", () => {
  const old =
    "- Curriculum bench: 50 of 55 England KS2 science objectives (Years 3–5) became a valid lesson file on the first try; 36 passed our lesson check with no warnings (x). It measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.";
  const text = `intro\n  The ready-made samples in \`samples/\` carry photos, so they are larger.\n${old}\n\n## Next\n`;

  it("TASK-33c14: the sentence says 'automatic', and the old wording is not read as the claim", () => {
    expect(benchSentence(b)).toContain("48 passed our automatic lesson check with no warnings");
    expect(readBenchClaim(old)).toBeNull();
    expect(readBenchClaim(readmeBenchLine(b))).toEqual(b);
  });

  it("TASK-33c14: both lines carry the mechanical note; a line without it fails", () => {
    expect(BENCH_MECHANICAL).toBe("The checks are mechanical (structure, counts, answer overlap) and do not verify facts.");
    for (const line of [readmeBenchLine(b), writeupBenchLine(b)]) {
      expect(line).toContain(BENCH_MECHANICAL);
      expect(compareBench(line, "x", b).every((c) => c.ok)).toBe(true);
      const bare = line.replace(BENCH_MECHANICAL + " ", "");
      expect(compareBench(bare, "x", b).filter((c) => !c.ok).map((c) => c.name)).toEqual(["x bench line mechanical note"]);
    }
  });

  it("TASK-33c14: --fix turns an old-wording line into the new one, in place, without a second line", () => {
    const fixed = fixBench(text, b, README_BENCH_ANCHOR, readmeBenchLine);
    expect(fixed).toContain(readmeBenchLine(b));
    expect(fixed).not.toContain("passed our lesson check");
    expect(fixed.split("England KS2 science objectives").length).toBe(2);
    // A current line only has its numbers rewritten.
    const again = fixBench(fixed, { ...b, lessonClean: 49 }, README_BENCH_ANCHOR, readmeBenchLine);
    expect(readBenchClaim(again)).toEqual({ ...b, lessonClean: 49 });
    expect(again).toContain(BENCH_MECHANICAL);
  });

  it("TASK-33c14: the README, write-up, RESULTS.md and bench/README.md use the new words", () => {
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      const line = read(f).split("\n").find((l) => l.includes("England KS2 science objectives"))!;
      expect(line, f).toContain("passed our automatic lesson check with no warnings");
      expect(line, f).toContain(BENCH_MECHANICAL);
      expect(line, f).toContain("not a classroom study");
    }
    expect(read("bench/RESULTS.md")).toContain("| Passed our automatic lesson check with no warnings |");
    expect(read("bench/RESULTS.md")).not.toContain("| Passed our lesson check");
    expect(read("bench/README.md")).toContain("do not verify facts");
  });
});

// ---------------------------------------------------------------------------

const objectives = JSON.parse(read("bench/objectives.json")) as Objective[];
const review = JSON.parse(read("bench/key-review.json")) as KeyReview & { rule: string; about: string };
const stackOf = (id: string): Stack =>
  JSON.parse(/<script[^>]*id="stack-data"[^>]*>([\s\S]*?)<\/script>/.exec(read(`bench/files/${id}.html`))![1]!) as Stack;

describe("TASK-33c15: the key-accuracy sample", () => {
  it("TASK-33c15: the rule picks every 5th objective from the 1st (skipping to the next first-try deck) plus y3-rocks-2: 12 decks", () => {
    const firstTry = new Set(
      (JSON.parse(read("bench/results.json")) as { decks: Array<{ id: string; firstTry: boolean }> }).decks.filter((d) => d.firstTry).map((d) => d.id),
    );
    const picked = keyReviewSample(objectives, (id) => firstTry.has(id) && existsSync(path.join(ROOT, "bench", "files", `${id}.html`)));
    expect(picked.length).toBe(12);
    expect(picked[picked.length - 1]).toBe("y3-rocks-2");
    expect(review.decks.map((d) => d.id)).toEqual(picked);
    // A pure check of the rule on a made-up list.
    const fake = Array.from({ length: 12 }, (_, i) => ({ id: `o${i}` }) as Objective);
    expect(keyReviewSample(fake, (id) => id !== "o5", ["o2"])).toEqual(["o0", "o6", "o10", "o2"]);
  });

  it("TASK-33c15: each deck lists exactly its file's quiz cards, in order, with the file's question and key", () => {
    for (const d of review.decks) {
      const s = stackOf(d.id);
      const quizzes = s.cards.map((c, i) => ({ c, i })).filter((x) => x.c.kind === "quiz");
      expect(d.cards.map((c) => c.card), d.id).toEqual(quizzes.map((x) => x.i + 1));
      d.cards.forEach((c, j) => {
        expect(c.question, `${d.id} card ${c.card}`).toBe(primaryText(quizzes[j]!.c));
        expect(c.key, `${d.id} card ${c.card}`).toBe(rightAnswer(quizzes[j]!.c)!.label);
        expect(["correct", "wrong", "ambiguous"]).toContain(c.verdict);
        if (c.verdict !== "correct") expect((c.reason ?? "").length, `${d.id} card ${c.card} needs a reason`).toBeGreaterThan(10);
      });
    }
  });

  it("TASK-33c15: the stored totals equal the verdicts, and the LESSON_CHECKER v2 section states the same", () => {
    const t = keyReviewTotals(review);
    expect(review.totals).toEqual(t);
    const md = read("bench/LESSON_CHECKER.md");
    const v2 = md.slice(md.indexOf("## v2 key-accuracy sample"));
    expect(v2).toContain("run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's");
    expect(v2).toMatch(/9 November 2026/);
    expect(v2).toContain(`| **Total** | **${t.cards}** | **${t.cards - t.wrong - t.ambiguous}** | **${t.wrong}** | **${t.ambiguous}** |`);
    for (const d of review.decks) expect(v2).toContain(`| ${d.id} | ${d.cards.length} |`);
    // v1 is kept.
    expect(md).toContain("## y3-light-3");
    expect(review.about).toContain("an AI review, not a teacher's");
  });

  it("TASK-33c15: a wrong key, if any, is listed under v2 in DIAGNOSIS.md", () => {
    const d = read("bench/DIAGNOSIS.md");
    expect(d).toContain("## v2");
    for (const deck of review.decks) for (const c of deck.cards) if (c.verdict === "wrong") expect(d).toContain(`${deck.id} card ${c.card}`);
  });
});

describe("TASK-33c16: the key-review line is checked by check:claims", () => {
  const k = { cards: 60, decks: 12, wrong: 0, ambiguous: 2 };

  it("TASK-33c16: the sentence is the brief's, with singular forms for one", () => {
    expect(keySentence(k)).toBe("A read-only AI review of 60 quiz cards from 12 generated decks found 0 wrong keys and 2 ambiguous ones (bench/LESSON_CHECKER.md).");
    expect(keySentence({ ...k, wrong: 1, ambiguous: 1 })).toContain("found 1 wrong key and 1 ambiguous one (");
    expect(readKeyClaim(keyReviewLine(k))).toEqual(k);
  });

  it("TASK-33c16: a right line passes; a wrong N, D, W or A fails; a line with no review file fails; no file and no line passes", () => {
    const line = keyReviewLine(k);
    expect(compareKeyReview(line, "README", k).every((c) => c.ok)).toBe(true);
    for (const bad of [{ cards: 59 }, { decks: 11 }, { wrong: 1 }, { ambiguous: 0 }]) {
      expect(compareKeyReview(line, "README", { ...k, ...bad }).every((c) => c.ok), JSON.stringify(bad)).toBe(false);
    }
    expect(compareKeyReview("nothing", "README", k).map((c) => c.ok)).toEqual([false]);
    expect(compareKeyReview(line, "README", null).map((c) => c.ok)).toEqual([false]);
    expect(compareKeyReview("nothing", "README", null)).toEqual([]);
  });

  it("TASK-33c16: --fix inserts the line after the bench line, then rewrites its numbers in place", () => {
    const text = `a\n${readmeBenchLine(b)}\n\nb\n`;
    const inserted = fixKeyReview(text, k);
    const lines = inserted.split("\n");
    expect(lines[lines.indexOf(readmeBenchLine(b)) + 1]).toBe(keyReviewLine(k));
    const moved = fixKeyReview(inserted, { ...k, wrong: 3 });
    expect(readKeyClaim(moved)).toEqual({ ...k, wrong: 3 });
    expect(moved.split("A read-only AI review").length).toBe(2);
  });

  it("TASK-33c16: the real README and write-up carry the line, matching totals recomputed from key-review.json", () => {
    const t = keyReviewTotals(review);
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) expect(readKeyClaim(read(f)), f).toEqual(t);
  });
});
