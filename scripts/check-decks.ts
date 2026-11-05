// scripts/check-decks.ts
// Ready-made deck content check (TASK-23 a.2), run by the
// `ready-made-content-check` hook on save of src/shared/readyMadeStacks.ts.
//
// For each of the three ready-made decks it asserts:
//   1. every quiz card has exactly one correct answer (invariant 4),
//   2. the correct answer's position varies across the deck's quiz cards
//      (not always tile A — the J3 P0 regression),
//   3. no two answers on a card are the same label,
//   4. no answer label is longer than the two-line wrap width.
//
// It also checks each deck image's CREDIT is truthful (TASK-25 b):
//   5. a credit that names "Openverse" must carry a real openverse.org source
//      URL — so we never claim an image came from Openverse when it did not.
//
// Exits 0 when all three decks pass, 1 with a report otherwise. The deck
// builders are the single source of truth, so this runs them and inspects the
// result — it never parses the TS by hand.
//
//   node --import tsx/esm scripts/check-decks.ts

import {
  vikingsStack,
  timesTablesStack,
  irishWordsStack,
} from "../src/shared/readyMadeStacks.js";
import { READY_MADE_IMAGES } from "../src/shared/readyMadeImages.js";
import { creditLine } from "../src/shared/deckImageTypes.js";
import type { Stack, Card, ButtonElement } from "../src/shared/types.js";

// Answer tiles are 344px wide at 32px type and wrap to at most two lines
// (src/player/renderer.ts). ~18 characters fit on a line at that size, so a
// label over ~36 characters would overflow two lines. Use 40 as a safe cap.
const MAX_ANSWER_CHARS = 40;

function quizCards(stack: Stack): Card[] {
  return stack.cards.filter((c) => c.kind === "quiz");
}

function answers(card: Card): ButtonElement[] {
  return card.elements.filter(
    (e): e is ButtonElement => e.type === "button" && e.actions.some((a) => a.type === "score"),
  );
}

function correctIndex(card: Card): number {
  return answers(card).findIndex((b) => b.actions.some((a) => a.type === "score" && a.delta === 1));
}

function checkDeck(name: string, stack: Stack): string[] {
  const problems: string[] = [];
  const quizzes = quizCards(stack);

  for (const [i, card] of quizzes.entries()) {
    const ans = answers(card);
    const correct = ans.filter((b) => b.actions.some((a) => a.type === "score" && a.delta === 1));
    if (correct.length !== 1) {
      problems.push(`${name}: quiz card ${i + 1} has ${correct.length} correct answers (need exactly 1).`);
    }
    // No duplicate labels within a card.
    const labels = ans.map((b) => b.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) {
      problems.push(`${name}: quiz card ${i + 1} has duplicate answer labels.`);
    }
    // No over-long label.
    for (const b of ans) {
      if (b.label.length > MAX_ANSWER_CHARS) {
        problems.push(`${name}: quiz card ${i + 1} answer "${b.label}" is ${b.label.length} chars (> ${MAX_ANSWER_CHARS}).`);
      }
    }
  }

  // Correct position must vary across the deck's quiz cards (if there are ≥2).
  if (quizzes.length >= 2) {
    const positions = new Set(quizzes.map(correctIndex));
    if (positions.size < 2) {
      problems.push(`${name}: the correct answer is always in the same position across all ${quizzes.length} quiz cards.`);
    }
  }

  return problems;
}

/**
 * Credit provenance (TASK-25 b): a credit line that names "Openverse" must
 * carry a real openverse.org source URL. This blocks the live-check bug where
 * our own CC0 drawings were credited "… — https://openverse.org" even though
 * they never came from Openverse.
 */
export function checkImageCredits(
  images: Record<string, import("../src/shared/deckImageTypes.js").DeckImage> = READY_MADE_IMAGES,
): string[] {
  const problems: string[] = [];
  for (const [deckKey, img] of Object.entries(images)) {
    const line = creditLine(img);
    const namesOpenverse = /openverse/i.test(line);
    const hasOpenverseUrl =
      typeof img.creditSource === "string" &&
      /^https?:\/\/(?:[^/]*\.)?openverse\.org(?:[/?#]|$)/i.test(img.creditSource);
    if (namesOpenverse && !hasOpenverseUrl) {
      problems.push(
        `${deckKey}: image credit names Openverse but has no real openverse.org source URL ("${line}").`,
      );
    }
  }
  return problems;
}

function main(): void {
  const decks: Array<[string, Stack]> = [
    ["vikings", vikingsStack()],
    ["times-tables", timesTablesStack()],
    ["irish-words", irishWordsStack()],
  ];

  let problems: string[] = [];
  for (const [name, stack] of decks) {
    const found = checkDeck(name, stack);
    for (const p of found) console.error(`  [DRIFT] ${p}`);
    problems = problems.concat(found);
  }

  const creditProblems = checkImageCredits();
  for (const p of creditProblems) console.error(`  [DRIFT] ${p}`);
  problems = problems.concat(creditProblems);

  if (problems.length > 0) {
    console.error(`check-decks: ${problems.length} problem(s) in the ready-made decks.`);
    process.exit(1);
  }
  console.log("check-decks: OK — all three ready-made decks pass the content checks.");
}

// Run only when invoked directly (node … scripts/check-decks.ts), not when a
// test imports `checkImageCredits` from this module.
import { fileURLToPath } from "node:url";
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
