// server/stackGenerator.ts
// Orchestrates the full stack generation flow:
//   1. Build prompt → call LLM (temperature 0.7) → parse JSON → validate.
//   2. On validation failure: build retry prompt → call LLM (temperature 0.2) → parse → validate.
//   3. On second failure: return GenerateError with a plain-language message.
//   4. On LlmUnavailableError at any point: return fallback stack with isFallback: true.
//
// Security invariants:
//   - The API key never appears in the returned value (guaranteed by llmGateway).
//   - Raw LLM error details are never forwarded to the caller.

import type {
  GenerateRequest,
  GenerateSuccess,
  GenerateError,
} from "../src/shared/types.js";
import { validate } from "../src/shared/validator.js";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import { build as buildPrompt, buildRetry } from "./promptBuilder.js";
import { buildReadyMade } from "./fallback.js";
import { call, LlmUnavailableError } from "./llmGateway.js";

// ---------------------------------------------------------------------------
// Internal helpers

/**
 * Attempt one LLM call, then parse and validate the result.
 * Returns the parsed Stack on success, or errors[] on validation failure.
 * Re-throws LlmUnavailableError so the outer handler can fall back.
 */
async function attempt(
  messages: { system: string; user: string },
  temperature: number
): Promise<
  | { ok: true; stack: import("../src/shared/types.js").Stack }
  | { ok: false; errors: string[] }
> {
  // LlmUnavailableError and ConfigurationError are intentionally NOT caught here —
  // they propagate up to generate() where they trigger the fallback path.
  const raw = await call(messages, { temperature });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Treat unparseable JSON as a validation failure so we retry once.
    return { ok: false, errors: ["invalid-shape"] };
  }

  const result = validate(parsed);
  if (result.valid) {
    // The model often points every quiz answer at the end card, which ends the
    // game on the first click. Rewrite quiz answers to advance to the next card
    // so the class walks the whole deck. The rewrite only retargets existing
    // cards, so the stack stays valid (invariant 2 preserved).
    return { ok: true, stack: linkQuizAnswersForward(result.stack) };
  }
  return { ok: false, errors: result.errors };
}

// ---------------------------------------------------------------------------
// Public API

/** Options for generate(). */
export interface GenerateOptions {
  /**
   * Skip the model entirely and return the ready-made offline deck (as if the
   * LLM were unavailable). Used when the global daily budget is exhausted so the
   * public instance degrades to ready-made decks without spending the paid key.
   */
  forceFallback?: boolean;
}

/**
 * Generate a Stack from a teacher's prompt.
 * Never throws — all errors are represented in the return type.
 *
 * When `opts.forceFallback` is true, no model call is made: the request is
 * answered from the deterministic ready-made decks (same path as an unavailable
 * LLM), with the honest ready-made labelling the fallback already carries.
 */
export async function generate(
  request: GenerateRequest,
  opts: GenerateOptions = {}
): Promise<GenerateSuccess | GenerateError> {
  if (opts.forceFallback) {
    const ready = buildReadyMade(request);
    return { ok: true, stack: ready.stack, isFallback: true, isReadyMadeExample: !ready.matched };
  }
  try {
    // --- First attempt (temperature 0.7) ---
    const firstMessages = buildPrompt(request);
    const first = await attempt(firstMessages, 0.7);

    if (first.ok) {
      return { ok: true, stack: first.stack, isFallback: false };
    }

    // --- Retry attempt (temperature 0.2) ---
    const retryMessages = buildRetry(request, first.errors);
    const retry = await attempt(retryMessages, 0.2);

    if (retry.ok) {
      return { ok: true, stack: retry.stack, isFallback: false };
    }

    // Both attempts failed — return a plain-language error.
    // Do not include raw error codes or stack trace.
    return {
      ok: false,
      message:
        "We couldn't build your set of cards. Try rephrasing your description and have another go.",
    };
  } catch (err) {
    // LlmUnavailableError (or any unexpected error) → return deterministic fallback.
    // We treat *any* uncaught error here as "LLM unavailable" to keep the API key
    // and internal details out of the response.
    if (err instanceof LlmUnavailableError) {
      const ready = buildReadyMade(request);
      return { ok: true, stack: ready.stack, isFallback: true, isReadyMadeExample: !ready.matched };
    }

    // ConfigurationError or truly unexpected errors also fall back rather than
    // crashing — the server route layer can log the real error separately.
    const ready = buildReadyMade(request);
    return { ok: true, stack: ready.stack, isFallback: true, isReadyMadeExample: !ready.matched };
  }
}
