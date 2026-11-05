// server/stream-generate.ts
// Progressive (NDJSON) delivery for POST /api/generate.
//
// The generator still produces a whole Stack in one step (the LLM returns full
// JSON; the fallback builds all cards). Progressive delivery streams that
// finished stack to the client card-by-card so the Start screen can deal each
// card onto the pile with its real question, instead of just showing
// "Working…". This keeps the LLM contract, the 16 KB request limit, and all
// existing validation.
//
// Validation on the streamed path:
//   - Every card is shape-validated with validateCard() the moment before it
//     is written. A malformed card stops the stream with a plain-language
//     `error` line (clean fallback), never a stack trace.
//   - The full stack is validated as a unit (generate() already did so for LLM
//     output; we re-validate here as the single source of truth before the
//     `done` line) so the client receives a stack that passes every invariant.
//
// Security: the API key and raw LLM errors never reach this layer — generate()
// returns only GenerateSuccess | GenerateError.

import type {
  GenerateRequest,
  GenerateStreamMessage,
  Stack,
} from "../src/shared/types.js";
import { generate as defaultGenerate } from "./stackGenerator.js";
import { validate, validateCard } from "../src/shared/validator.js";

/** A sink for NDJSON lines. The HTTP route passes a writer backed by the
 *  ServerResponse; tests pass an array-collecting writer. */
export interface LineSink {
  write(obj: GenerateStreamMessage): void;
  end(): void;
}

const GENERIC_FAILURE =
  "We couldn't build your set of cards. Try rephrasing your description and have another go.";

/**
 * Generate a stack and stream it to `sink` as NDJSON messages.
 *
 * @param request   The validated generate request.
 * @param sink      Where NDJSON lines are written.
 * @param deps      Injectable generator (tests stub this).
 */
export async function streamGenerate(
  request: GenerateRequest,
  sink: LineSink,
  deps: { generate?: typeof defaultGenerate } = {},
): Promise<void> {
  const generate = deps.generate ?? defaultGenerate;

  let outcome: Awaited<ReturnType<typeof generate>>;
  try {
    outcome = await generate(request);
  } catch {
    // generate() is documented never to throw, but guard anyway: a clean,
    // plain-language error, never a stack trace.
    sink.write({ type: "error", message: GENERIC_FAILURE });
    sink.end();
    return;
  }

  if (!outcome.ok) {
    sink.write({ type: "error", message: outcome.message });
    sink.end();
    return;
  }

  const stack: Stack = outcome.stack;

  // `start` header.
  sink.write({
    type: "start",
    total: stack.cards.length,
    title: stack.title,
    isFallback: outcome.isFallback,
  });

  // Stream each card, shape-validating it first. A malformed card (should not
  // happen for a stack that already passed validate(), but we never trust a
  // half-formed document) stops the stream with a clean error.
  for (let i = 0; i < stack.cards.length; i++) {
    const card = stack.cards[i]!;
    const check = validateCard(card);
    if (!check.valid) {
      sink.write({ type: "error", message: GENERIC_FAILURE });
      sink.end();
      return;
    }
    sink.write({ type: "card", index: i, card });
  }

  // Validate the full stack as a unit before signalling completion.
  const whole = validate(stack);
  if (!whole.valid) {
    sink.write({ type: "error", message: GENERIC_FAILURE });
    sink.end();
    return;
  }

  sink.write({ type: "done", stack: whole.stack, isFallback: outcome.isFallback });
  sink.end();
}
