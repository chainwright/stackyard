// src/shared/types.ts
// Types only — no runtime logic.

export type Stack = {
  id: string;        // UUID v4
  title: string;     // Display title, max 120 chars
  theme: Theme;
  cards: Card[];     // At least 2 cards; exactly one must have kind "end"
};

export type Theme = {
  background: string;  // CSS colour string
  foreground: string;  // CSS colour string
  font: string;        // CSS font-family string
};

export type Card = {
  id: string;          // UUID v4, unique within the stack
  kind: "quiz" | "flash" | "story" | "end";
  elements: Element[];
  actions: Action[];   // Card-level actions (e.g., auto-advance)
};

export type Element =
  | TextElement
  | ButtonElement
  | ImageElement
  | FieldElement;

export type TextElement = {
  type: "text";
  id: string;
  x: number; y: number; w: number; h: number;  // px, relative to 800×600 canvas
  content: string;
};

export type ButtonElement = {
  type: "button";
  id: string;
  x: number; y: number; w: number; h: number;
  label: string;
  actions: Action[];  // Fired when the button is clicked
};

export type ImageElement = {
  type: "image";
  id: string;
  x: number; y: number; w: number; h: number;
  src: string;        // Data URI (inlined) or relative path during editing
  alt: string;
};

export type FieldElement = {
  type: "field";      // Read-only display field (e.g., score counter)
  id: string;
  x: number; y: number; w: number; h: number;
  variable: string;   // Name of the runtime variable to display
};

export type Action =
  | { type: "goto"; cardId: string }
  | { type: "score"; delta: number }          // Add delta to running score
  | { type: "sound"; sound: "cheer" | "buzz" }
  | { type: "set"; variable: string; value: string | number };

// ---------------------------------------------------------------------------
// Validation

export type ValidationResult =
  | { valid: true; stack: Stack }
  | { valid: false; errors: string[] };

// ---------------------------------------------------------------------------
// LLM generate request / response

export type GenerateRequest = {
  prompt: string;
};

/**
 * Why a ready-made deck was served instead of a model-generated one. Used so
 * the Maker can tell the teacher the TRUTH (never "no internet" when they are
 * online — J1/J3/J5, 5 Nov panel):
 *   - "no-key"  — the server has no model API key configured
 *   - "cap"     — today's model-call budget is used up
 *   - "timeout" — the model didn't answer in time
 *   - "error"   — the model call failed for another reason
 * Absent on the normal (model) success path.
 */
export type FallbackReason = "no-key" | "cap" | "timeout" | "error";

export type GenerateSuccess = {
  ok: true;
  stack: Stack;
  isFallback: boolean;  // true when the LLM was unavailable
  /**
   * True when the fallback returned a ready-made deck for a sentence that did
   * NOT match a Start-screen example — i.e. the closest ready-made example, not
   * cards built from the teacher's words. The UI uses this to say so honestly.
   * Absent / false on the normal LLM path and when the sentence matched an
   * example.
   */
  isReadyMadeExample?: boolean;
  /** Why the fallback happened (only present when isFallback is true). */
  fallbackReason?: FallbackReason;
};

export type GenerateError = {
  ok: false;
  message: string;  // plain language; never a stack trace or raw error code
};

// ---------------------------------------------------------------------------
// Progressive (streaming) generate protocol — NDJSON
//
// When a client asks for `Accept: application/x-ndjson`, POST /api/generate
// streams one JSON object per line so the Start screen can "deal" each card
// onto the stack as it arrives. The non-streaming JSON path (GenerateSuccess /
// GenerateError) is unchanged and still the default.
//
// Line order:
//   1. exactly one `start`
//   2. zero or more `card` (in deck order), each already shape-validated
//   3. exactly one terminator: `done` (full validated stack) or `error`
//
// A mid-stream failure emits `error` and stops; the client shows the
// plain-language message and returns to the Start screen.

export type GenerateStreamStart = {
  type: "start";
  total: number;        // number of cards that will be streamed
  title: string;        // stack title (for the shell)
  isFallback: boolean;  // true when the LLM was unavailable
  /** True when this is the closest ready-made example for an unmatched
   *  free-text sentence (see GenerateSuccess.isReadyMadeExample). */
  isReadyMadeExample?: boolean;
  /** Why the fallback happened (only present when isFallback is true). */
  fallbackReason?: FallbackReason;
};

export type GenerateStreamCard = {
  type: "card";
  index: number;        // 0-based position in the deck
  card: Card;           // one card, already shape-validated server-side
};

export type GenerateStreamDone = {
  type: "done";
  stack: Stack;         // the whole stack, validated as a unit
  isFallback: boolean;
  /** True when this is the closest ready-made example for an unmatched
   *  free-text sentence (see GenerateSuccess.isReadyMadeExample). */
  isReadyMadeExample?: boolean;
  /** Why the fallback happened (only present when isFallback is true). */
  fallbackReason?: FallbackReason;
};

export type GenerateStreamError = {
  type: "error";
  message: string;      // plain language; never a stack trace or raw error code
};

// Emitted only on the progressive LLM path, when cards already dealt from a
// partial stream turn out to be unusable (the stream died, a card was
// malformed, or the assembled stack failed validation) and we restart from a
// clean fallback/retry. The client MUST clear every card it has dealt so far;
// a fresh `start` then follows with the replacement stack. Never appears on a
// stream that succeeds first time.
export type GenerateStreamReset = {
  type: "reset";
};

export type GenerateStreamMessage =
  | GenerateStreamStart
  | GenerateStreamCard
  | GenerateStreamDone
  | GenerateStreamError
  | GenerateStreamReset;
