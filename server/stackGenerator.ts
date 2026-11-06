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
  FallbackReason,
} from "../src/shared/types.js";
import { validate } from "../src/shared/validator.js";
import { sanitizeRawStack, finaliseGeneratedStack } from "./normalizeGenerated.js";
import { build as buildPrompt, buildRetry } from "./promptBuilder.js";
import { buildReadyMade } from "./fallback.js";
import { call, LlmUnavailableError, ConfigurationError } from "./llmGateway.js";

// ---------------------------------------------------------------------------
// Internal helpers

/**
 * Attempt one LLM call, then parse and validate the result.
 * Returns the parsed Stack on success, or errors[] on validation failure.
 * Re-throws LlmUnavailableError so the outer handler can fall back.
 *
 * `onModelCall` is invoked exactly once, immediately before the real upstream
 * call, so the caller can count real paid model calls for the daily budget
 * (J4 M2, 5 Nov panel) — one unit per attempt/retry, never per request.
 */
async function attempt(
  messages: { system: string; user: string },
  temperature: number,
  onModelCall?: () => void,
): Promise<
  | { ok: true; stack: import("../src/shared/types.js").Stack }
  | { ok: false; errors: string[] }
> {
  // LlmUnavailableError and ConfigurationError are intentionally NOT caught here —
  // they propagate up to generate() where they trigger the fallback path.
  onModelCall?.();
  const raw = await call(messages, { temperature });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Treat unparseable JSON as a validation failure so we retry once.
    return { ok: false, errors: ["invalid-shape"] };
  }

  // Drop pictures the model invented and clamp coordinates onto the canvas
  // BEFORE validating, so a merely mis-sized box doesn't fail validation and burn
  // a paid retry (TASK-26 c, d).
  const result = validate(sanitizeRawStack(parsed));
  if (result.valid) {
    // Re-lay every card from the template, repair flash cards, tidy the text,
    // point quiz answers at the next card (the model often points them all at the
    // end card, which ends the game on the first click), make sure every card has
    // a way forward, and vary which tile is right. Each step only re-positions,
    // retargets or adds, so the invariants hold (TASK-26 b, c, j).
    return { ok: true, stack: finaliseGeneratedStack(result.stack) };
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
  /**
   * Called once per REAL upstream model call (first attempt AND retry),
   * immediately before the call. The server uses this to count paid calls for
   * the daily budget — one unit per call, never per request (J4 M2).
   */
  onModelCall?: () => void;
}

/**
 * Infer the honest fallback reason from a thrown error (never leaks details).
 * Maps from the error's `kind`, set where the gateway throws it — never from the
 * message text (the old text sniffing searched for "time" while the message said
 * "took too long", so "timeout" could never be produced; J4 N3).
 */
export function reasonFromError(err: unknown): FallbackReason {
  if (err instanceof ConfigurationError) return "no-key";
  if (err instanceof LlmUnavailableError) {
    return err.kind === "timeout" ? "timeout" : "error";
  }
  return "error";
}

/**
 * Generate a Stack from a teacher's prompt.
 * Never throws — all errors are represented in the return type.
 *
 * When `opts.forceFallback` is true, no model call is made: the request is
 * answered from the deterministic ready-made decks (daily budget exhausted),
 * labelled `fallbackReason: "cap"`.
 */
export async function generate(
  request: GenerateRequest,
  opts: GenerateOptions = {}
): Promise<GenerateSuccess | GenerateError> {
  if (opts.forceFallback) {
    const ready = buildReadyMade(request);
    return {
      ok: true,
      stack: ready.stack,
      isFallback: true,
      isReadyMadeExample: !ready.matched,
      fallbackReason: "cap",
    };
  }
  try {
    // --- First attempt (temperature 0.7) ---
    const firstMessages = buildPrompt(request);
    const first = await attempt(firstMessages, 0.7, opts.onModelCall);

    if (first.ok) {
      return { ok: true, stack: first.stack, isFallback: false };
    }

    // --- Retry attempt (temperature 0.2) ---
    const retryMessages = buildRetry(request, first.errors);
    const retry = await attempt(retryMessages, 0.2, opts.onModelCall);

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
    // A missing key, an unreachable/erroring model, or a deadline → return the
    // deterministic ready-made deck, labelled with the honest reason so the
    // Maker can say WHY (never "no internet" when the teacher is online).
    const ready = buildReadyMade(request);
    const reason = reasonFromError(err);
    // One line for the operator, the same as the stream path logs: the reason
    // and the gateway's own redacted message (an HTTP status at most; the
    // gateway never puts the key, the URL or a response body in it).
    console.warn(
      `[generate] fallback reason=${reason}` +
        (err instanceof Error ? ` detail=${err.message}` : ""),
    );
    return {
      ok: true,
      stack: ready.stack,
      isFallback: true,
      isReadyMadeExample: !ready.matched,
      fallbackReason: reason,
    };
  }
}
