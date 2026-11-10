// scripts/spare-cost.ts
// TASK-36c4b: the output cost of asking for one spare quiz card. Measured on
// the fixtures as the characters of one quiz card line of the model's JSON
// Lines stream (the line the spare adds), against the whole stream.
//   - the why fixture (tests/fixtures/why/water-cycle-with-why.json): the
//     stream as the model writes it today, a "why" on every quiz answer;
//   - the four generation fixtures (tests/fixtures/generation/*.json): decks
//     without "why", for the range.
// Tokens are an ESTIMATE at 4 characters per token (JSON-heavy English); the
// characters are the measurement.
//
//   node --import tsx/esm scripts/spare-cost.ts

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWhyFixture, streamText } from "./why-cost.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GEN = path.join(ROOT, "tests", "fixtures", "generation");

export const CHARS_PER_TOKEN = 4;

export interface SpareCost {
  /** The why fixture: mean characters of one quiz card line, and of the whole stream. */
  quizLineChars: number;
  streamChars: number;
  /** The added share of the stream, in per cent (one decimal). */
  percentAdded: number;
  /** Estimated output tokens for one more quiz card. */
  tokensAdded: number;
  /** The generation fixtures (no "why"): smallest and largest mean quiz line. */
  fixtureRange: [number, number];
}

const line = (card: unknown): number => JSON.stringify({ kind: "card", card }).length + 1;

export function spareCost(): SpareCost {
  const fx = loadWhyFixture();
  const quiz = fx.cards.filter((c) => c["kind"] === "quiz");
  const quizLineChars = Math.round(quiz.reduce((n, c) => n + line(c), 0) / quiz.length);
  const streamChars = streamText(fx, true).length;
  const means = readdirSync(GEN)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const s = (JSON.parse(readFileSync(path.join(GEN, f), "utf8")) as { stack: { cards: Array<{ kind: string }> } }).stack;
      const q = s.cards.filter((c) => c.kind === "quiz");
      return q.length === 0 ? 0 : Math.round(q.reduce((n, c) => n + line(c), 0) / q.length);
    })
    .filter((n) => n > 0);
  return {
    quizLineChars,
    streamChars,
    percentAdded: Math.round((1000 * quizLineChars) / streamChars) / 10,
    tokensAdded: Math.round(quizLineChars / CHARS_PER_TOKEN),
    fixtureRange: [Math.min(...means), Math.max(...means)],
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(spareCost()));
