// scripts/build-distractor-review.ts
// TASK-34a1: expand the lesson-checker persona's distractor labels
// (bench/distractor-labels.json: only the absurd ones, with reasons) into
// bench/distractor-review.json: every wrong answer on every quiz card of every
// bench file, labelled "plausible" or "absurd". Every listed label must match a
// real distractor, or the build fails (so a re-record can't leave stale labels).
//
//   node --import tsx/esm scripts/build-distractor-review.ts           # write
//   node --import tsx/esm scripts/build-distractor-review.ts --check   # fail if stale

import { readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Stack } from "../src/shared/types.js";
import { quizAnswers, rightAnswer } from "../src/shared/lessonCheck.js";
import { primaryText } from "../src/shared/cardTitle.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = path.join(ROOT, "bench", "files");
const LABELS = path.join(ROOT, "bench", "distractor-labels.json");
const OUT = path.join(ROOT, "bench", "distractor-review.json");

export type DistractorLabel = "plausible" | "absurd";
export interface ReviewedCard {
  card: number;
  question: string;
  right: string;
  distractors: Array<{ option: string; label: DistractorLabel; reason?: string }>;
  keyNote?: string;
}
export interface DistractorReview {
  about: string;
  definition: string;
  date: string;
  decks: Array<{ id: string; cards: ReviewedCard[] }>;
  totals: { decks: number; quizCards: number; distractors: number; absurd: number; decksWithAbsurd: number };
}

interface Labels {
  about: string;
  definition: string;
  absurd: Array<{ deck: string; card: number; option: string; reason: string }>;
  keyNotes: Array<{ deck: string; card: number; note: string }>;
}

export function stackOfFile(html: string): Stack {
  return JSON.parse(/<script[^>]*id="stack-data"[^>]*>([\s\S]*?)<\/script>/.exec(html)![1]!) as Stack;
}

export function buildReview(): DistractorReview {
  const labels = JSON.parse(readFileSync(LABELS, "utf8")) as Labels;
  const used = new Set<number>();
  const decks: DistractorReview["decks"] = [];
  for (const f of readdirSync(FILES).filter((n) => n.endsWith(".html")).sort()) {
    const id = f.replace(/\.html$/, "");
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
      cards.push({ card: i + 1, question: primaryText(c), right: right.label, distractors, ...(note ? { keyNote: note } : {}) });
    });
    decks.push({ id, cards });
  }
  const stale = labels.absurd.filter((_, i) => !used.has(i));
  if (stale.length > 0) throw new Error(`distractor labels match no distractor in bench/files: ${stale.map((s) => `${s.deck} card ${s.card} "${s.option}"`).join("; ")}`);
  const all = decks.flatMap((d) => d.cards.flatMap((c) => c.distractors));
  return {
    about: labels.about,
    definition: labels.definition,
    date: "2026-11-09",
    decks,
    totals: {
      decks: decks.length,
      quizCards: decks.reduce((n, d) => n + d.cards.length, 0),
      distractors: all.length,
      absurd: all.filter((d) => d.label === "absurd").length,
      decksWithAbsurd: decks.filter((d) => d.cards.some((c) => c.distractors.some((x) => x.label === "absurd"))).length,
    },
  };
}

function main(): void {
  const text = JSON.stringify(buildReview(), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (!existsSync(OUT) || readFileSync(OUT, "utf8") !== text) {
      console.error("build-distractor-review: STALE — bench/distractor-review.json differs from the labels and the files; rerun it.");
      process.exit(1);
    }
    console.log("build-distractor-review: OK — TASK-34a1: bench/distractor-review.json matches the labels and the bench files.");
    return;
  }
  writeFileSync(OUT, text, "utf8");
  console.log(`build-distractor-review: wrote bench/distractor-review.json`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
