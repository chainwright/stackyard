// scripts/build-distractor-review.ts
// TASK-34a1 / 34a5: expand the lesson-checker persona's labels (only the absurd
// distractors with reasons, plus any key that is not correct) into a full review:
// every wrong answer on every quiz card of the reviewed bench files, labelled
// "plausible" or "absurd", and every key's verdict. Every listed label must
// match a real distractor, or the build fails.
//
//   v3 (the 34 re-recorded decks):
//   node --import tsx/esm scripts/build-distractor-review.ts --labels bench/distractor-labels-v3.json \
//     --out bench/distractor-review-v3.json --only-file bench/rerecord.txt [--check]
//
// The v2 review (bench/distractor-review.json, from bench/distractor-labels.json
// over all 54 v2 files) is FROZEN: 34 of those files were re-recorded for v3, so
// it can no longer be rebuilt from bench/files. It is kept as it was built.

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Stack } from "../src/shared/types.js";
import { quizAnswers, rightAnswer } from "../src/shared/lessonCheck.js";
import { primaryText } from "../src/shared/cardTitle.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = path.join(ROOT, "bench", "files");

export type DistractorLabel = "plausible" | "absurd";
export type KeyVerdict = "correct" | "wrong" | "ambiguous";
export interface ReviewedCard {
  card: number;
  question: string;
  right: string;
  distractors: Array<{ option: string; label: DistractorLabel; reason?: string }>;
  keyNote?: string;
  /** v3 reviews: the key's verdict (v2 keys were sampled separately, bench/key-review.json). */
  key?: { verdict: KeyVerdict; reason?: string };
}
export interface DistractorReview {
  about: string;
  definition: string;
  date: string;
  decks: Array<{ id: string; cards: ReviewedCard[] }>;
  /** Reviewed objectives with no lesson file (failed validation on this recording). */
  noFile?: string[];
  totals: {
    decks: number; quizCards: number; distractors: number; absurd: number; decksWithAbsurd: number;
    wrongKeys?: number; ambiguousKeys?: number;
  };
}

interface Labels {
  about: string;
  definition: string;
  absurd: Array<{ deck: string; card: number; option: string; reason: string }>;
  keyNotes: Array<{ deck: string; card: number; note: string }>;
  keys?: Array<{ deck: string; card: number; verdict: "wrong" | "ambiguous"; reason: string }>;
}

export function stackOfFile(html: string): Stack {
  return JSON.parse(/<script[^>]*id="stack-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]!) as Stack;
}

/** Build a review from a labels file over the bench files (all of them, or `only`). */
export function buildReview(labelsPath: string, only?: string[]): DistractorReview {
  const labels = JSON.parse(readFileSync(labelsPath, "utf8")) as Labels;
  const withKeys = labels.keys !== undefined;
  const used = new Set<number>();
  const usedKeys = new Set<number>();
  const decks: DistractorReview["decks"] = [];
  const names = only !== undefined ? only.map((id) => `${id}.html`) : readdirSync(FILES).filter((n) => n.endsWith(".html")).sort();
  const noFile: string[] = [];
  for (const f of names) {
    const id = f.replace(/\.html$/, "");
    // TASK-34a9: a re-recorded deck that failed validation has no file; it is listed, not reviewed.
    if (!existsSync(path.join(FILES, f))) {
      noFile.push(id);
      continue;
    }
    const s = stackOfFile(readFileSync(path.join(FILES, f), "utf8"));
    const cards: ReviewedCard[] = [];
    s.cards.forEach((c, i) => {
      if (c.kind !== "quiz") return;
      const right = rightAnswer(c);
      if (right === undefined) return;
      const distractors = quizAnswers(c)
        .filter((b) => b !== right)
        .map((b) => {
          const at = labels.absurd.findIndex((a) => a.deck === id && a.card === i + 1 && a.option === b.label);
          if (at < 0) return { option: b.label, label: "plausible" as const };
          used.add(at);
          return { option: b.label, label: "absurd" as const, reason: labels.absurd[at]!.reason };
        });
      const note = labels.keyNotes.find((k) => k.deck === id && k.card === i + 1)?.note;
      let key: ReviewedCard["key"];
      if (withKeys) {
        const at = labels.keys!.findIndex((k) => k.deck === id && k.card === i + 1);
        if (at >= 0) usedKeys.add(at);
        key = at >= 0 ? { verdict: labels.keys![at]!.verdict, reason: labels.keys![at]!.reason } : { verdict: "correct" };
      }
      cards.push({ card: i + 1, question: primaryText(c), right: right.label, distractors, ...(note ? { keyNote: note } : {}), ...(key ? { key } : {}) });
    });
    decks.push({ id, cards });
  }
  const stale = labels.absurd.filter((_, i) => !used.has(i));
  if (stale.length > 0) throw new Error(`distractor labels match no distractor in bench/files: ${stale.map((s) => `${s.deck} card ${s.card} "${s.option}"`).join("; ")}`);
  const staleKeys = (labels.keys ?? []).filter((_, i) => !usedKeys.has(i));
  if (staleKeys.length > 0) throw new Error(`key verdicts match no quiz card: ${staleKeys.map((k) => `${k.deck} card ${k.card}`).join("; ")}`);
  return { about: labels.about, definition: labels.definition, date: labelsDate(labels.about), decks, ...(noFile.length > 0 ? { noFile } : {}), totals: reviewTotals(decks, withKeys) };
}

/** The review's date: the one in its "about" text, else 9 Nov (v2, v3). */
function labelsDate(about: string): string {
  return /on 10 Nov 2026/.test(about) ? "2026-11-10" : "2026-11-09";
}

/** Totals recomputed from the per-card labels (never trusted from a stored file). */
export function reviewTotals(decks: DistractorReview["decks"], withKeys = decks.some((d) => d.cards.some((c) => c.key !== undefined))): DistractorReview["totals"] {
  const all = decks.flatMap((d) => d.cards.flatMap((c) => c.distractors));
  const cards = decks.flatMap((d) => d.cards);
  return {
    decks: decks.length,
    quizCards: cards.length,
    distractors: all.length,
    absurd: all.filter((d) => d.label === "absurd").length,
    decksWithAbsurd: decks.filter((d) => d.cards.some((c) => c.distractors.some((x) => x.label === "absurd"))).length,
    ...(withKeys
      ? { wrongKeys: cards.filter((c) => c.key?.verdict === "wrong").length, ambiguousKeys: cards.filter((c) => c.key?.verdict === "ambiguous").length }
      : {}),
  };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): void {
  const labels = arg("--labels");
  const out = arg("--out");
  if (labels === undefined || out === undefined) {
    console.error("build-distractor-review: pass --labels and --out (the v2 review is frozen; see the header).");
    process.exit(1);
  }
  const onlyFile = arg("--only-file");
  const only = onlyFile === undefined ? undefined : readFileSync(path.resolve(onlyFile), "utf8").split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
  const text = JSON.stringify(buildReview(path.resolve(labels), only), null, 2) + "\n";
  const target = path.resolve(out);
  if (process.argv.includes("--check")) {
    if (!existsSync(target) || readFileSync(target, "utf8") !== text) {
      console.error(`build-distractor-review: STALE — ${path.relative(ROOT, target)} differs from the labels and the files; rerun it.`);
      process.exit(1);
    }
    console.log(`build-distractor-review: OK — ${path.relative(ROOT, target)} matches the labels and the bench files.`);
    return;
  }
  writeFileSync(target, text, "utf8");
  console.log(`build-distractor-review: wrote ${path.relative(ROOT, target)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
