// scripts/distractor-eval.ts
// TASK-34a2: measure the "may be a joke answer" check (src/shared/lessonCheck.ts
// jokeAnswerReason) against the lesson-checker's labels in
// bench/distractor-review.json: precision, recall, and every miss and false alarm.
//
//   node --import tsx/esm scripts/distractor-eval.ts [--list]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jokeAnswerReason, quizAnswers, rightAnswer } from "../src/shared/lessonCheck.js";
import { stackOfFile, type DistractorReview } from "./build-distractor-review.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface Eval {
  tp: number; fp: number; fn: number; tn: number;
  precision: number; recall: number;
  falsePositives: string[]; misses: string[];
  byRule: Record<string, { tp: number; fp: number }>;
}

export function evaluate(review: DistractorReview = JSON.parse(readFileSync(path.join(ROOT, "bench", "distractor-review.json"), "utf8"))): Eval {
  const e: Eval = { tp: 0, fp: 0, fn: 0, tn: 0, precision: 0, recall: 0, falsePositives: [], misses: [], byRule: {} };
  for (const d of review.decks) {
    const s = stackOfFile(readFileSync(path.join(ROOT, "bench", "files", `${d.id}.html`), "utf8"));
    for (const rc of d.cards) {
      const card = s.cards[rc.card - 1]!;
      const right = rightAnswer(card)!;
      for (const x of rc.distractors) {
        const btn = quizAnswers(card).find((b) => b !== right && b.label === x.option)!;
        const why = jokeAnswerReason(btn, card);
        const rule = why === null ? "" : why;
        const where = `${d.id} card ${rc.card}: "${x.option}"${why ? ` (${why})` : ""}`;
        if (why !== null) (e.byRule[rule] ??= { tp: 0, fp: 0 });
        if (why !== null && x.label === "absurd") { e.tp++; e.byRule[rule]!.tp++; }
        else if (why !== null) { e.fp++; e.byRule[rule]!.fp++; e.falsePositives.push(where); }
        else if (x.label === "absurd") { e.fn++; e.misses.push(where); }
        else e.tn++;
      }
    }
  }
  e.precision = e.tp + e.fp === 0 ? 0 : e.tp / (e.tp + e.fp);
  e.recall = e.tp + e.fn === 0 ? 0 : e.tp / (e.tp + e.fn);
  return e;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const e = evaluate();
  console.log(`distractor-eval: flagged ${e.tp + e.fp} of ${e.tp + e.fp + e.fn + e.tn}; TP ${e.tp}, FP ${e.fp}, FN ${e.fn}; precision ${e.precision.toFixed(2)}, recall ${e.recall.toFixed(2)}; by rule ${JSON.stringify(e.byRule)}`);
  if (process.argv.includes("--list")) {
    console.log("FALSE POSITIVES:\n  " + e.falsePositives.join("\n  "));
    console.log("MISSES:\n  " + e.misses.join("\n  "));
  }
}
