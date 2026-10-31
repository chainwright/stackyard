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

// ---------------------------------------------------------------------------
// Error types

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmUnavailableError";
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
  response_format: { type: "json_object" };
  max_tokens: number;
  temperature: number;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

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

function getModel(): string {
  return (
    (process.env["STACKYARD_LLM_MODEL"] ?? "").trim() || "gpt-4o-mini"
  );
}

// ---------------------------------------------------------------------------
// Public API

export interface CallOptions {
  temperature?: number;
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
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature,
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Use the key here but never surface the value in any error path below
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network failure — do not include any detail that might contain the key
    throw new LlmUnavailableError(
      "We couldn't reach the AI service. Check your internet connection and try again."
    );
  }

  if (!response.ok) {
    // Non-2xx — redact; do not echo the key or raw response body
    throw new LlmUnavailableError(
      `The AI service returned an error (HTTP ${response.status}). Try again in a moment.`
    );
  }

  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new LlmMalformedError(
      "The AI service returned a response we couldn't read. Please try again."
    );
  }

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
