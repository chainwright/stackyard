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

export type GenerateSuccess = {
  ok: true;
  stack: Stack;
  isFallback: boolean;  // true when the LLM was unavailable
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
};

export type GenerateStreamError = {
  type: "error";
  message: string;      // plain language; never a stack trace or raw error code
};

export type GenerateStreamMessage =
  | GenerateStreamStart
  | GenerateStreamCard
  | GenerateStreamDone
  | GenerateStreamError;
