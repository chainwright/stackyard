// scripts/distractor-eval.ts
// TASK-34a2 / 34a5: measure the "may be a joke answer" check (src/shared/lessonCheck.ts
// jokeAnswerReason) against a lesson-checker review: precision, recall, and every
// miss and false alarm. It works from the review JSON alone (each card's question,
// key and options), so a review stays measurable after its decks are re-recorded.
//
//   node --import tsx/esm scripts/distractor-eval.ts [bench/distractor-review-v3.json] [--list]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { jokeAnswerReason } from "../src/shared/lessonCheck.js";
import type { DistractorReview, ReviewedCard } from "./build-distractor-review.js";
import type { ButtonElement, Card } from "../src/shared/types.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export interface Eval {
  tp: number; fp: number; fn: number; tn: number;
  precision: number; recall: number;
  falsePositives: string[]; misses: string[];
  byRule: Record<string, { tp: number; fp: number }>;
}

/** A quiz card rebuilt from a review entry: the question, the key (delta 1) and the wrong answers. */
export function cardOf(rc: ReviewedCard): { card: Card; wrong: ButtonElement[] } {
  const btn = (i: number, label: string, delta: 0 | 1): ButtonElement => ({
    type: "button", id: `b${i}`, x: 0, y: 0, w: 10, h: 10, label, actions: [{ type: "score", delta }],
  });
  const wrong = rc.distractors.map((d, i) => btn(i + 1, d.option, 0));
  const card: Card = {
    id: "c", kind: "quiz", actions: [],
    elements: [{ type: "text", id: "q", x: 0, y: 0, w: 10, h: 10, content: rc.question }, btn(0, rc.right, 1), ...wrong],
  };
  return { card, wrong };
}

export function evaluate(review: DistractorReview = JSON.parse(readFileSync(path.join(ROOT, "bench", "distractor-review.json"), "utf8"))): Eval {
  const e: Eval = { tp: 0, fp: 0, fn: 0, tn: 0, precision: 0, recall: 0, falsePositives: [], misses: [], byRule: {} };
  for (const d of review.decks) {
    for (const rc of d.cards) {
      const { card, wrong } = cardOf(rc);
      rc.distractors.forEach((x, i) => {
        const why = jokeAnswerReason(wrong[i]!, card);
        const where = `${d.id} card ${rc.card}: "${x.option}"${why ? ` (${why})` : ""}`;
        if (why !== null) e.byRule[why] ??= { tp: 0, fp: 0 };
        if (why !== null && x.label === "absurd") { e.tp++; e.byRule[why]!.tp++; }
        else if (why !== null) { e.fp++; e.byRule[why]!.fp++; e.falsePositives.push(where); }
        else if (x.label === "absurd") { e.fn++; e.misses.push(where); }
        else e.tn++;
      });
    }
  }
  e.precision = e.tp + e.fp === 0 ? 0 : e.tp / (e.tp + e.fp);
  e.recall = e.tp + e.fn === 0 ? 0 : e.tp / (e.tp + e.fn);
  return e;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  const e = evaluate(file ? (JSON.parse(readFileSync(path.resolve(file), "utf8")) as DistractorReview) : undefined);
  console.log(`distractor-eval: flagged ${e.tp + e.fp} of ${e.tp + e.fp + e.fn + e.tn}; TP ${e.tp}, FP ${e.fp}, FN ${e.fn}; precision ${e.precision.toFixed(2)}, recall ${e.recall.toFixed(2)}; by rule ${JSON.stringify(e.byRule)}`);
  if (process.argv.includes("--list")) {
    console.log("FALSE POSITIVES:\n  " + e.falsePositives.join("\n  "));
    console.log("MISSES:\n  " + e.misses.join("\n  "));
  }
}
