// server/stream-generate.ts
// Truly progressive (NDJSON) delivery for POST /api/generate.
//
// The streaming path asks the LLM for the stack as JSON Lines (one card per
// line, see promptBuilder.buildStream) and parses the token stream
// incrementally: the moment a card's line is complete and passes
// validateCard(), that card is written to the client. So the Start screen
// deals each card as it is actually produced by the model, not after the whole
// response has arrived.
//
// When the model finishes, the whole assembled stack is validated as a unit.
// If ANYTHING fails at any point — no API key, the LLM is unreachable, the
// stream dies halfway, a card line is malformed, or the assembled stack fails
// whole-stack validation — we stop the streamed attempt and fall back to the
// existing non-streaming generate() (retry + deterministic offline fallback).
// If cards were already dealt from the failed partial stream, a `reset` line
// tells the client to clear them before the replacement stack streams in; if
// even the fallback path fails, a single plain-language `error` line is sent.
//
// Security: the API key and raw LLM errors never reach the client. llmGateway
// guarantees the key never appears in any yielded value or thrown error, and
// generate() returns only GenerateSuccess | GenerateError.

import type {
  GenerateRequest,
  GenerateStreamMessage,
  Stack,
  Card,
  Theme,
} from "../src/shared/types.js";
import { generate as defaultGenerate } from "./stackGenerator.js";
import { validate, validateCard } from "../src/shared/validator.js";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import { callStream as defaultCallStream } from "./llmGateway.js";
import { buildStream as defaultBuildStream } from "./promptBuilder.js";

/** A sink for NDJSON lines. The HTTP route passes a writer backed by the
 *  ServerResponse; tests pass an array-collecting writer. */
export interface LineSink {
  write(obj: GenerateStreamMessage): void;
  end(): void;
}

const GENERIC_FAILURE =
  "We couldn't build your set of cards. Try rephrasing your description and have another go.";

/**
 * Pacing between fallback cards, OFFLINE FALLBACK ONLY. The deterministic
 * offline fallback has no real model latency, so without a delay every card
 * would land in the same tick and the cards would flash past mid-animation as
 * translucent overprints (built-app review round 2, P1 #3). At ~400 ms a card
 * the ten-card decks deal out over about four seconds, so each card visibly
 * lands. This pause is purely cosmetic and is used NOWHERE on the real LLM
 * path, where the gap between cards is the model's genuine output rate.
 */
const FALLBACK_DEAL_PACING_MS = 400;

// ---------------------------------------------------------------------------
// Dependency seam (tests stub these)

export interface StreamGenerateDeps {
  generate?: typeof defaultGenerate;
  callStream?: typeof defaultCallStream;
  buildStream?: typeof defaultBuildStream;
  /** Sleep used for fallback pacing; tests pass a no-op to run instantly. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * The client's connection signal. When the client disconnects mid-stream it
   * aborts, which `callStream` forwards to its upstream fetch so the server
   * stops paying for tokens nobody will read. The HTTP route passes
   * `req`'s close signal; tests pass their own controller or omit it.
   */
  signal?: AbortSignal;
}

const realSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Incremental JSON-Lines parser
//
// The LLM streams tokens, not whole lines. We buffer text and hand back one
// complete line (terminated by "\n") at a time; a line split across chunks is
// held until its newline arrives. Exported so tests can drive it directly.

export class LineBuffer {
  private buffer = "";

  /** Add a chunk of streamed text. */
  push(chunk: string): void {
    this.buffer += chunk;
  }

  /** Pull every complete line available now (without its trailing newline). */
  takeCompleteLines(): string[] {
    const lines: string[] = [];
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) >= 0) {
      lines.push(this.buffer.slice(0, nl).replace(/\r$/, ""));
      this.buffer = this.buffer.slice(nl + 1);
    }
    return lines;
  }

  /** Any trailing text with no newline yet (the model's final line). */
  takeRemainder(): string {
    const rest = this.buffer;
    this.buffer = "";
    return rest.replace(/\r$/, "");
  }
}

// ---------------------------------------------------------------------------
// JSON-Lines message shapes (the wire format the streaming prompt asks for)

interface StackHeaderLine {
  kind: "stack";
  id: string;
  title: string;
  theme: Theme;
}

function parseHeaderLine(line: string): StackHeaderLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { kind?: unknown }).kind !== "stack"
  ) {
    return null;
  }
  const r = raw as Record<string, unknown>;
  const theme = r["theme"];
  if (
    typeof r["id"] !== "string" ||
    typeof r["title"] !== "string" ||
    typeof theme !== "object" ||
    theme === null
  ) {
    return null;
  }
  const t = theme as Record<string, unknown>;
  if (
    typeof t["background"] !== "string" ||
    typeof t["foreground"] !== "string" ||
    typeof t["font"] !== "string"
  ) {
    return null;
  }
  return {
    kind: "stack",
    id: r["id"],
    title: r["title"],
    theme: {
      background: t["background"],
      foreground: t["foreground"],
      font: t["font"],
    },
  };
}

/** Parse a card line ({"kind":"card","card":{...}}) into its Card payload. */
function parseCardLine(line: string): unknown | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { kind?: unknown }).kind !== "card" ||
    !("card" in raw)
  ) {
    return null;
  }
  return (raw as { card: unknown }).card;
}

// ---------------------------------------------------------------------------
// The streamed LLM attempt
//
// Returns the fully assembled + validated Stack on success, or null if the
// attempt failed for ANY reason (so the caller falls back). Cards are written
// to `sink` as they complete; `dealt` reports how many card lines were emitted
// so the caller knows whether a `reset` is needed before falling back.

type StreamAttemptResult =
  | { ok: true; stack: Stack }
  | { ok: false; dealtCards: number };

async function attemptStreamedLlm(
  request: GenerateRequest,
  sink: LineSink,
  deps: Required<Pick<StreamGenerateDeps, "callStream" | "buildStream">>,
  signal?: AbortSignal,
): Promise<StreamAttemptResult> {
  const messages = deps.buildStream(request);
  const lineBuffer = new LineBuffer();

  // Mutable state kept on an object so narrowing survives across the closure.
  const state: { header: StackHeaderLine | null } = { header: null };
  let startWritten = false;
  const cards: Card[] = [];
  let dealtCards = 0;

  // Process one complete JSON line. Returns false if the line is unusable
  // (malformed header/card), which aborts the attempt.
  const handleLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true; // ignore blank lines

    if (state.header === null) {
      const parsed = parseHeaderLine(trimmed);
      if (parsed === null) return false;
      state.header = parsed;
      sink.write({
        type: "start",
        total: 0, // unknown up front on the streamed path; client shows "…"
        title: parsed.title,
        isFallback: false,
      });
      startWritten = true;
      return true;
    }

    const cardPayload = parseCardLine(trimmed);
    if (cardPayload === null) return false;
    const check = validateCard(cardPayload);
    if (!check.valid) return false;
    cards.push(check.card);
    sink.write({ type: "card", index: dealtCards, card: check.card });
    dealtCards++;
    return true;
  };

  try {
    const callOptions = signal === undefined
      ? { temperature: 0.7 }
      : { temperature: 0.7, signal };
    for await (const delta of deps.callStream(messages, callOptions)) {
      lineBuffer.push(delta);
      for (const line of lineBuffer.takeCompleteLines()) {
        if (!handleLine(line)) {
          return { ok: false, dealtCards };
        }
      }
    }
  } catch {
    // Network drop, non-2xx, missing key, or a dead stream — fall back.
    return { ok: false, dealtCards };
  }

  // Flush a trailing line with no newline (the model's last card).
  const remainder = lineBuffer.takeRemainder().trim();
  if (remainder.length > 0) {
    if (!handleLine(remainder)) {
      return { ok: false, dealtCards };
    }
  }

  const finalHeader = state.header;
  if (finalHeader === null || !startWritten || cards.length === 0) {
    return { ok: false, dealtCards };
  }

  // Assemble and validate the whole stack as a unit (the single source of
  // truth for every cross-card invariant).
  const assembled: unknown = {
    id: finalHeader.id,
    title: finalHeader.title,
    theme: finalHeader.theme,
    cards,
  };
  const whole = validate(assembled);
  if (!whole.valid) {
    return { ok: false, dealtCards };
  }
  // Quiz answers advance to the next card (not straight to the end). The final
  // `done` stack the editor loads carries the corrected links; see
  // linkQuizAnswersForward. Only existing cards are retargeted, so it stays valid.
  return { ok: true, stack: linkQuizAnswersForward(whole.stack) };
}

// ---------------------------------------------------------------------------
// Fallback / retry path (non-streaming generate(), then paced streaming out)
//
// Used when the streamed LLM attempt failed. generate() runs the full
// retry-then-deterministic-fallback logic and returns a whole stack (or an
// error). We then stream that stack out card by card, with a small cosmetic
// pause BETWEEN FALLBACK CARDS ONLY so the dealing shows in a demo.

async function streamFallback(
  request: GenerateRequest,
  sink: LineSink,
  deps: Required<Pick<StreamGenerateDeps, "generate" | "sleep">>,
): Promise<void> {
  let outcome: Awaited<ReturnType<typeof defaultGenerate>>;
  try {
    outcome = await deps.generate(request);
  } catch {
    sink.write({ type: "error", message: GENERIC_FAILURE });
    sink.end();
    return;
  }

  if (!outcome.ok) {
    sink.write({ type: "error", message: outcome.message });
    sink.end();
    return;
  }

  const stack = outcome.stack;
  const isReadyMadeExample = outcome.isReadyMadeExample === true;

  sink.write({
    type: "start",
    total: stack.cards.length,
    title: stack.title,
    isFallback: outcome.isFallback,
    isReadyMadeExample,
  });

  for (let i = 0; i < stack.cards.length; i++) {
    const card = stack.cards[i]!;
    const check = validateCard(card);
    if (!check.valid) {
      sink.write({ type: "error", message: GENERIC_FAILURE });
      sink.end();
      return;
    }
    // OFFLINE-FALLBACK-ONLY pacing: a cosmetic gap so a demo sees the deal.
    if (i > 0) await deps.sleep(FALLBACK_DEAL_PACING_MS);
    sink.write({ type: "card", index: i, card });
  }

  const whole = validate(stack);
  if (!whole.valid) {
    sink.write({ type: "error", message: GENERIC_FAILURE });
    sink.end();
    return;
  }

  sink.write({ type: "done", stack: whole.stack, isFallback: outcome.isFallback, isReadyMadeExample });
  sink.end();
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Generate a stack and stream it to `sink` as NDJSON messages, progressively.
 *
 * Order on the happy path: `start`, one `card` per card as the model produces
 * it, then `done` with the whole validated stack. If the streamed attempt
 * fails after dealing some cards, a `reset` clears the client before the
 * fallback stack streams in; if it fails before any card, we fall back
 * silently. A total failure sends one plain-language `error`.
 *
 * @param request   The validated generate request.
 * @param sink      Where NDJSON lines are written.
 * @param deps      Injectable generator / stream / prompt (tests stub these).
 */
export async function streamGenerate(
  request: GenerateRequest,
  sink: LineSink,
  deps: StreamGenerateDeps = {},
): Promise<void> {
  const generate = deps.generate ?? defaultGenerate;
  const callStream = deps.callStream ?? defaultCallStream;
  const buildStream = deps.buildStream ?? defaultBuildStream;
  const sleep = deps.sleep ?? realSleep;
  const signal = deps.signal;

  // 1. Try the real progressive LLM stream.
  const attempt = await attemptStreamedLlm(
    request,
    sink,
    { callStream, buildStream },
    signal,
  );

  if (attempt.ok) {
    sink.write({ type: "done", stack: attempt.stack, isFallback: false });
    sink.end();
    return;
  }

  // 1b. If the client disconnected, don't do any more work — there is nobody
  //     to read the fallback, and callStream has already aborted the upstream
  //     request. Stop here so we don't spend tokens (or writes) on a dead
  //     connection.
  if (signal?.aborted) {
    sink.end();
    return;
  }

  // 2. The streamed attempt failed. If cards were already dealt from the
  //    partial stream, tell the client to clear them before the replacement.
  if (attempt.dealtCards > 0) {
    sink.write({ type: "reset" });
  }

  // 3. Fall back to the non-streaming retry + deterministic fallback path.
  await streamFallback(request, sink, { generate, sleep });
}
