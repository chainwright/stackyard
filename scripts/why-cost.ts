// scripts/why-cost.ts
// TASK-34a7: the output-size cost of the "why" field. The same deck
// (tests/fixtures/why/water-cycle-with-why.json) is written as the model's
// JSON Lines with and without every "why"; characters per card are compared.
//
//   node --import tsx/esm scripts/why-cost.ts

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const WHY_FIXTURE = path.join(ROOT, "tests", "fixtures", "why", "water-cycle-with-why.json");

export interface WhyFixture { prompt: string; header: Record<string, unknown>; cards: Array<Record<string, unknown>> }

export function loadWhyFixture(): WhyFixture {
  return JSON.parse(readFileSync(WHY_FIXTURE, "utf8")) as WhyFixture;
}

/** Deep copy without any "why" key. */
export function dropWhy<T>(v: T): T {
  return JSON.parse(JSON.stringify(v, (k, x) => (k === "why" ? undefined : x))) as T;
}

/** The stream the model would send: header line, then one line per card. */
export function streamText(fx: WhyFixture, withWhy: boolean): string {
  const cards = withWhy ? fx.cards : dropWhy(fx.cards);
  return [JSON.stringify(fx.header), ...cards.map((c) => JSON.stringify({ kind: "card", card: c }))].join("\n") + "\n";
}

export interface WhyCost {
  cards: number;
  quizCards: number;
  withoutChars: number;
  withChars: number;
  perCardWithout: number;
  perCardWith: number;
  perQuizAdded: number;
  percentAdded: number;
}

export function whyCost(fx: WhyFixture = loadWhyFixture()): WhyCost {
  const without = streamText(fx, false).length;
  const withWhy = streamText(fx, true).length;
  const quiz = fx.cards.filter((c) => c["kind"] === "quiz").length;
  const n = fx.cards.length;
  return {
    cards: n,
    quizCards: quiz,
    withoutChars: without,
    withChars: withWhy,
    perCardWithout: Math.round(without / n),
    perCardWith: Math.round(withWhy / n),
    perQuizAdded: Math.round((withWhy - without) / quiz),
    percentAdded: Math.round((100 * (withWhy - without)) / without),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) console.log(JSON.stringify(whyCost()));
