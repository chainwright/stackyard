// server/fallback.ts
// The OFFLINE FALLBACK: when the LLM is unavailable, the generator returns a
// real, complete ready-made stack instead of a placeholder. The sentence that
// matches a Start-screen example gets that example's deck; any other sentence
// gets the closest ready-made deck, flagged so the UI can say honestly that it
// is a ready-made example (not generated from the teacher's words).
//
// This replaces the old three-card "Correct Answer"/"Wrong Answer" stub that
// read as fake to anyone clicking around (built-app review P0 #4). The ready-
// made decks live in src/shared/readyMadeStacks.ts so the server fallback and
// the editor share one source of truth; each passes the validator and plays
// through card by card (quiz answers linked forward).

import type { GenerateRequest, Stack } from "../src/shared/types.js";
import { pickReadyMade, type ReadyMade } from "../src/shared/readyMadeStacks.js";

/**
 * Pick the ready-made deck for a request, with the `matched` flag that tells
 * the caller whether the sentence clearly matched an example (true) or whether
 * this is the closest ready-made deck for a free-text sentence (false).
 */
export function buildReadyMade(request: GenerateRequest): ReadyMade {
  return pickReadyMade(request.prompt);
}

/**
 * Build the fallback Stack for a request (the picked ready-made deck).
 * Kept as the simple Stack-returning entry point the generator uses.
 */
export function build(request: GenerateRequest): Stack {
  return buildReadyMade(request).stack;
}
