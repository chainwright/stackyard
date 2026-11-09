// server/llmGateway.ts
// Thin wrapper around an OpenAI-compatible chat completion endpoint.
//
// Environment variables (all read only inside this module):
//   STACKYARD_LLM_API_KEY   — required; the bearer token sent in Authorization header
//   STACKYARD_LLM_BASE_URL  — optional; default https://api.openai.com/v1
//   STACKYARD_LLM_MODEL     — optional; default gpt-4o-mini
//
// Security invariants:
//   - The API key value never appears in any thrown error message or return value.
//   - No other module reads these env vars.

import { llmThinking } from "./llmThinking.js";

// ---------------------------------------------------------------------------
// Error types

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * WHY the model was unavailable. Set where the error is thrown so callers map
 * it to a fallback reason without sniffing the message text (the old
 * `msg.includes("time")` never matched "took too long", so the "timeout" reason
 * could never be produced — round-2 J4 N3).
 */
export type LlmFailureKind =
  | "timeout"    // a total or idle deadline fired
  | "cancelled"  // the client disconnected
  | "http"       // the upstream answered non-2xx
  | "network"    // the request could not be made
  | "empty"      // 2xx with no body
  | "dropped";   // the stream died mid-way

export class LlmUnavailableError extends Error {
  readonly kind: LlmFailureKind;
  constructor(message: string, kind: LlmFailureKind = "network") {
    super(message);
    this.name = "LlmUnavailableError";
    this.kind = kind;
  }
}

export class LlmMalformedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmMalformedError";
  }
}

// ---------------------------------------------------------------------------
// OpenAI-compatible request/response shapes (minimal)

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  response_format?: { type: "json_object" };
  max_tokens: number;
  temperature?: number;
  /** Anthropic's OpenAI-compatible endpoint thinks before it writes unless told not to (TASK-31c). */
  thinking?: { type: "disabled" };
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

// Streaming (Server-Sent Events) request/response shapes. The non-streaming
// request above forces a single JSON object; the streaming request does NOT set
// response_format (JSON mode and token streaming don't combine on every
// OpenAI-compatible endpoint) and instead relies on the prompt asking for JSON
// Lines — one card per line — so each completed line can be parsed on its own.
interface ChatCompletionStreamRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens: number;
  temperature?: number;
  thinking?: { type: "disabled" };
  stream: true;
}

// Each SSE `data:` line carries one chunk of this shape. We only read the
// incremental text in choices[0].delta.content.
interface ChatCompletionStreamChunk {
  choices: Array<{
    delta?: { content?: string | null };
  }>;
}

// ---------------------------------------------------------------------------
// Deadlines
//
// Every upstream request carries an explicit deadline so a hung or
// slow-trickling LLM can never pin a request (and its tokens) open forever.
// On a deadline we abort the upstream fetch and throw LlmUnavailableError; the
// caller then falls back with the usual plain-language message. The URL and key
// never appear in any abort path.

/** Non-streaming `call`: whole request must finish within this budget. */
export const CALL_TOTAL_DEADLINE_MS = 45_000;

/** Streaming `callStream`: whole stream must finish within this budget. */
export const STREAM_TOTAL_DEADLINE_MS = 90_000;

/**
 * Streaming `callStream`: abort if no chunk arrives for this long. Armed only
 * AFTER the first content delta (TASK-31c): before that the first-token
 * deadline applies, because a model that thinks first is silent for a while.
 */
export const STREAM_IDLE_DEADLINE_MS = 20_000;

/**
 * Streaming `callStream`: how long to wait for the FIRST content delta. A role-only
 * chunk or a ": ping" comment line does not count as content. Measured on the
 * live model with thinking on, the first text arrived at 20 to 24 s; 20 s was
 * too short to start counting before it (TASK-31c).
 */
export const STREAM_FIRST_TOKEN_DEADLINE_MS = 45_000;

// ---------------------------------------------------------------------------
// Config helpers (read env vars once per call to support test overrides)

function getApiKey(): string {
  const key = process.env["STACKYARD_LLM_API_KEY"] ?? "";
  if (key.trim() === "") {
    throw new ConfigurationError(
      "STACKYARD_LLM_API_KEY is not set. Add it to your environment before starting the server."
    );
  }
  return key;
}

function getBaseUrl(): string {
  return (
    (process.env["STACKYARD_LLM_BASE_URL"] ?? "").trim() ||
    "https://api.openai.com/v1"
  );
}

/**
 * JSON mode is an OpenAI-style extension. Some OpenAI-compatible endpoints
 * reject `{type: "json_object"}` (Anthropic's accepts only `json_schema`), so it
 * can be switched off with STACKYARD_LLM_JSON_MODE=off; the prompt still asks for
 * JSON and the validator + one retry still guard the result.
 */
function jsonModeEnabled(): boolean {
  return (process.env["STACKYARD_LLM_JSON_MODE"] ?? "").trim().toLowerCase() !== "off";
}

/**
 * Some models reject `temperature` (Anthropic's newer models: "`temperature` is
 * deprecated for this model"). STACKYARD_LLM_TEMPERATURE=off leaves it out; the
 * retry then relies on the validator's errors alone, not a lower temperature.
 */
function temperatureEnabled(): boolean {
  return (process.env["STACKYARD_LLM_TEMPERATURE"] ?? "").trim().toLowerCase() !== "off";
}

/**
 * Output token budget. 4096 is enough for compact JSON, but some models
 * pretty-print a 10-card stack past it and the JSON arrives cut off
 * ("Unterminated string"), found on the first live Anthropic call (5 Nov).
 * STACKYARD_LLM_MAX_TOKENS raises it; clamped to 1,000–32,000.
 */
function getMaxTokens(): number {
  const n = Number((process.env["STACKYARD_LLM_MAX_TOKENS"] ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) return 4096;
  return Math.min(32000, Math.max(1000, Math.floor(n)));
}

/** Thinking mode (TASK-31c): see server/llmThinking.ts for the measurement and the rules. */
export { llmThinking };

function thinkingField(): { thinking?: { type: "disabled" } } {
  return llmThinking() === "off" ? { thinking: { type: "disabled" as const } } : {};
}

function getModel(): string {
  return (
    (process.env["STACKYARD_LLM_MODEL"] ?? "").trim() || "gpt-4o-mini"
  );
}

// ---------------------------------------------------------------------------
// Public API

export interface CallOptions {
  temperature?: number;
  /**
   * An external abort signal (e.g. the client's connection). When it aborts,
   * `callStream` aborts the upstream request so the server stops paying for
   * tokens nobody will read. Honoured by both `call` and `callStream`.
   */
  signal?: AbortSignal;
}

/**
 * Call the configured LLM with a system + user message pair.
 * Returns the raw content string from the first choice.
 *
 * @throws ConfigurationError  if STACKYARD_LLM_API_KEY is absent
 * @throws LlmUnavailableError for network failures or non-2xx responses
 * @throws LlmMalformedError   if the response body cannot be parsed as JSON
 */
export async function call(
  messages: { system: string; user: string },
  options: CallOptions = {}
): Promise<string> {
  const apiKey = getApiKey(); // throws ConfigurationError if missing
  const baseUrl = getBaseUrl();
  const model = getModel();
  const temperature = options.temperature ?? 0.7;

  const body: ChatCompletionRequest = {
    model,
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    ...(jsonModeEnabled() ? { response_format: { type: "json_object" as const } } : {}),
    max_tokens: getMaxTokens(),
    ...(temperatureEnabled() ? { temperature } : {}),
    ...thinkingField(),
  };

  // Abort the upstream request if the whole call outlasts its total deadline.
  const controller = new AbortController();
  let timedOut = false;
  const deadline = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, CALL_TOTAL_DEADLINE_MS);
  // The client's connection (TASK-27 z5): when it goes away, stop paying.
  const external = options.signal;
  const onExternalAbort = (): void => controller.abort();
  if (external !== undefined) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  let response: Response;
  try {
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Use the key here but never surface the value in any error path below
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // Network failure or a deadline abort — do not include any detail that
      // might contain the key or the URL.
      if (timedOut) {
        throw new LlmUnavailableError(
          "The AI service took too long to respond. Try again in a moment.",
          "timeout",
        );
      }
      throw new LlmUnavailableError(
        "We couldn't reach the AI service. Check your internet connection and try again.",
        "network",
      );
    }

    if (!response.ok) {
      // Non-2xx — redact; do not echo the key or raw response body
      throw new LlmUnavailableError(
        `The AI service returned an error (HTTP ${response.status}). Try again in a moment.`,
        "http",
      );
    }

    let parsed: unknown;
    try {
      parsed = await response.json() as unknown;
    } catch {
      if (timedOut) {
        throw new LlmUnavailableError(
          "The AI service took too long to respond. Try again in a moment.",
          "timeout",
        );
      }
      throw new LlmMalformedError(
        "The AI service returned a response we couldn't read. Please try again."
      );
    }
    return extractContent(parsed);
  } finally {
    clearTimeout(deadline);
    external?.removeEventListener("abort", onExternalAbort);
  }
}

/** Pull the first choice's content string from a parsed response, or throw. */
function extractContent(parsed: unknown): string {

  // Extract content from the expected shape
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "choices" in parsed &&
    Array.isArray((parsed as ChatCompletionResponse).choices) &&
    (parsed as ChatCompletionResponse).choices.length > 0
  ) {
    const content = (parsed as ChatCompletionResponse).choices[0]?.message?.content;
    if (typeof content === "string") {
      return content;
    }
  }

  throw new LlmMalformedError(
    "The AI service returned an unexpected response shape. Please try again."
  );
}

/**
 * Call the configured LLM with `stream: true` and yield the content deltas as
 * they arrive, so a caller can parse completed JSON-Lines cards incrementally
 * instead of waiting for the whole response.
 *
 * Same endpoint, key handling, base URL and model as {@link call}; the only
 * differences are `stream: true` and no `response_format` (see
 * ChatCompletionStreamRequest). The key handling and no-secrets guarantees are
 * identical: the key is read only from the environment, sent only in the
 * Authorization header, and never appears in any yielded value or thrown error.
 *
 * Deadlines: the whole stream must finish within STREAM_TOTAL_DEADLINE_MS, and
 * no more than STREAM_IDLE_DEADLINE_MS may pass between chunks. Either deadline
 * aborts the upstream fetch and throws LlmUnavailableError. The caller may also
 * pass `options.signal` (e.g. the client's connection): when it aborts, the
 * upstream request is aborted too so the server stops paying for tokens nobody
 * will read. No abort path ever surfaces the URL or key.
 *
 * @throws ConfigurationError  if STACKYARD_LLM_API_KEY is absent
 * @throws LlmUnavailableError for network failures, non-2xx responses, a
 *                             deadline, a client disconnect, or a stream that
 *                             dies before any usable output
 */
export async function* callStream(
  messages: { system: string; user: string },
  options: CallOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = getApiKey(); // throws ConfigurationError if missing
  const baseUrl = getBaseUrl();
  const model = getModel();
  const temperature = options.temperature ?? 0.7;

  const body: ChatCompletionStreamRequest = {
    model,
    messages: [
      { role: "system", content: messages.system },
      { role: "user", content: messages.user },
    ],
    max_tokens: getMaxTokens(),
    ...(temperatureEnabled() ? { temperature } : {}),
    ...thinkingField(),
    stream: true,
  };

  // One controller drives the upstream abort. It fires on the total deadline,
  // the idle (no-chunk) deadline, or the caller's external signal (a client
  // disconnect). We track WHY so the thrown message is accurate; none of these
  // reasons ever includes the URL or key.
  const controller = new AbortController();
  let abortReason: "total" | "idle" | "first" | "client" | null = null;

  const totalTimer = setTimeout(() => {
    if (abortReason === null) abortReason = "total";
    controller.abort();
  }, STREAM_TOTAL_DEADLINE_MS);

  // Until the first CONTENT delta arrives, only the first-token deadline runs
  // (role-only chunks and ": ping" lines do not count and do not reset it). After
  // it, the idle timer is reset by every chunk; if it ever fires, no chunk has
  // arrived for STREAM_IDLE_DEADLINE_MS and we give up on the stall.
  let sawContent = false;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const firstTokenTimer = setTimeout(() => {
    if (abortReason === null) abortReason = "first";
    controller.abort();
  }, STREAM_FIRST_TOKEN_DEADLINE_MS);
  const armIdle = (): void => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (abortReason === null) abortReason = "idle";
      controller.abort();
    }, STREAM_IDLE_DEADLINE_MS);
  };

  const external = options.signal;
  const onExternalAbort = (): void => {
    if (abortReason === null) abortReason = "client";
    controller.abort();
  };
  if (external) {
    if (external.aborted) onExternalAbort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }

  const clearTimers = (): void => {
    clearTimeout(totalTimer);
    clearTimeout(firstTokenTimer);
    clearTimeout(idleTimer);
    if (external) external.removeEventListener("abort", onExternalAbort);
  };

  // Map an abort reason to a plain-language message; the key/URL never appear.
  const abortError = (): LlmUnavailableError => {
    if (abortReason === "client") {
      // Nobody is listening — the caller disconnected. Still surface a clean
      // unavailable error for any logging upstream; the key never appears.
      return new LlmUnavailableError(
        "The request was cancelled before the AI service finished.",
        "cancelled",
      );
    }
    return new LlmUnavailableError(
      "The AI service took too long to respond. Try again in a moment.",
      "timeout",
    );
  };

  let response: Response;
  try {
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          // Use the key here but never surface the value in any error path below
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      // Network failure or an abort — do not include any detail that might
      // contain the key or the URL.
      if (abortReason !== null) throw abortError();
      throw new LlmUnavailableError(
        "We couldn't reach the AI service. Check your internet connection and try again.",
        "network",
      );
    }

    if (!response.ok) {
      // Non-2xx — redact; do not echo the key or raw response body
      throw new LlmUnavailableError(
        `The AI service returned an error (HTTP ${response.status}). Try again in a moment.`,
        "http",
      );
    }

    const body$ = response.body;
    if (body$ === null) {
      throw new LlmUnavailableError(
        "The AI service returned an empty response. Try again in a moment.",
        "empty",
      );
    }

    const reader = body$.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let value: Uint8Array | undefined;
        let done: boolean;
        try {
          ({ value, done } = await reader.read());
        } catch {
          // A deadline/client abort surfaces here as a read rejection; a true
          // socket drop also lands here. Distinguish by abortReason.
          if (abortReason !== null) throw abortError();
          throw new LlmUnavailableError(
            "The connection to the AI service dropped. Try again in a moment.",
            "dropped",
          );
        }
        // A chunk (or stream end) arrived — restart the idle clock, but only once
        // content has started (before that the first-token deadline governs).
        if (sawContent) armIdle();
        if (value) buffer += decoder.decode(value, { stream: true });

        // SSE events are separated by a blank line; each event may hold one or
        // more `data:` lines. We process complete lines as they appear so a
        // chunk that splits a line mid-way is held in `buffer` until finished.
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const rawLine = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          const line = rawLine.replace(/\r$/, "").trim();
          if (line.length === 0) continue;
          if (!line.startsWith("data:")) continue;
          const data = line.slice("data:".length).trim();
          if (data === "[DONE]") return;

          let chunk: ChatCompletionStreamChunk;
          try {
            chunk = JSON.parse(data) as ChatCompletionStreamChunk;
          } catch {
            // A malformed SSE data line is skipped — not fatal on its own.
            continue;
          }
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            if (!sawContent) {
              sawContent = true;
              clearTimeout(firstTokenTimer);
              armIdle();
            }
            yield delta;
          }
        }

        if (done) break;
      }
    } finally {
      reader.releaseLock();
    }
  } finally {
    clearTimers();
  }
}
