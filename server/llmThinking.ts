// server/llmThinking.ts
// Whether the model's "thinking" is on for this deployment (TASK-31c). Its own
// tiny module so the stream's timing log can name the mode without importing the
// gateway (and so tests that stub the gateway keep working). Reads only
// STACKYARD_LLM_THINKING and the base URL's HOST; never the key, never logs the URL.
//
// Measured on claude-haiku-5-5 through Anthropic's OpenAI-compatible endpoint
// (9 Nov, water-cycle sentence, 12 cards): with thinking on the first text
// arrived at 20 to 24 s and the stack at 30 to 33 s; with
// `"thinking": {"type": "disabled"}` the first text came at 0.58 s and the whole
// stack at 11.0 s. (`reasoning_effort: "low"` did not help: first text 20 s.)
//
// STACKYARD_LLM_THINKING=off sends the field, =on sends nothing (the model's own
// default). Unset: off for the host api.anthropic.com, nothing sent for any other
// host (other OpenAI-compatible providers may reject an unknown field).

export function llmThinking(): "on" | "off" {
  const v = (process.env["STACKYARD_LLM_THINKING"] ?? "").trim().toLowerCase();
  if (v === "off") return "off";
  if (v === "on") return "on";
  const base = (process.env["STACKYARD_LLM_BASE_URL"] ?? "").trim() || "https://api.openai.com/v1";
  try {
    return new URL(base).hostname.toLowerCase() === "api.anthropic.com" ? "off" : "on";
  } catch {
    return "on";
  }
}
