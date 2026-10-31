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
import { build as buildPrompt, buildRetry } from "./promptBuilder.js";
import { build as buildFallback } from "./fallback.js";
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
    return { ok: true, stack: result.stack };
  }
  return { ok: false, errors: result.errors };
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Generate a Stack from a teacher's prompt.
 * Never throws — all errors are represented in the return type.
 */
export async function generate(
  request: GenerateRequest
): Promise<GenerateSuccess | GenerateError> {
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
      const fallbackStack = buildFallback(request);
      return { ok: true, stack: fallbackStack, isFallback: true };
    }

    // ConfigurationError or truly unexpected errors also fall back rather than
    // crashing — the server route layer can log the real error separately.
    const fallbackStack = buildFallback(request);
    return { ok: true, stack: fallbackStack, isFallback: true };
  }
}
