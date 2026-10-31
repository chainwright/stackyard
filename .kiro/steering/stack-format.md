# Stackyard — Stack Format

## Overview

A stack is a JSON document. It is the single source of truth for both the editor and the exported player.

## Schema

```ts
type Stack = {
  id: string;          // UUID v4
  title: string;       // Display title, max 120 chars
  theme: Theme;
  cards: Card[];       // At least 2 cards; exactly one must have kind "end"
};

type Theme = {
  background: string;  // CSS colour string
  foreground: string;  // CSS colour string
  font: string;        // CSS font-family string
};

type Card = {
  id: string;          // UUID v4, unique within the stack
  kind: "quiz" | "flash" | "story" | "end";
  elements: Element[];
  actions: Action[];   // Card-level actions (e.g., auto-advance)
};

type Element =
  | TextElement
  | ButtonElement
  | ImageElement
  | FieldElement;

type TextElement = {
  type: "text";
  id: string;
  x: number; y: number; w: number; h: number;  // px, relative to 800×600 canvas
  content: string;
};

type ButtonElement = {
  type: "button";
  id: string;
  x: number; y: number; w: number; h: number;
  label: string;
  actions: Action[];   // Fired when the button is clicked
};

type ImageElement = {
  type: "image";
  id: string;
  x: number; y: number; w: number; h: number;
  src: string;         // Data URI (inlined) or relative path during editing
  alt: string;
};

type FieldElement = {
  type: "field";       // Read-only display field (e.g., score counter)
  id: string;
  x: number; y: number; w: number; h: number;
  variable: string;    // Name of the runtime variable to display
};

type Action =
  | { type: "goto"; cardId: string }
  | { type: "score"; delta: number }           // Add delta to running score
  | { type: "sound"; sound: "cheer" | "buzz" }
  | { type: "set"; variable: string; value: string | number };
```

## Invariants

These must all pass before a stack can be exported. They are enforced by the validator in `shared/validator.ts` and tested with property-based tests.

1. **Unique IDs** — Every `stack.id`, `card.id`, and `element.id` is unique within the document.
2. **Valid goto targets** — Every `goto` action references a `cardId` that exists in `stack.cards`.
3. **Exactly one end card** — `stack.cards` contains exactly one card with `kind === "end"`.
4. **Quiz answer invariant** — A card with `kind === "quiz"` must have exactly one button whose actions include `{ type: "score", delta: 1 }` (the correct answer) and at least one button whose actions do not.
5. **Canvas bounds** — Every element's bounding box (`x + w ≤ 800`, `y + h ≤ 600`) fits within the card canvas.
6. **Non-empty title** — `stack.title` is not blank after trimming.
7. **At least one non-end card** — `stack.cards` contains at least one card that is not `kind === "end"`.
8. **Valid UUID v4 IDs** — Every `stack.id`, `card.id`, and `element.id` is a valid RFC 4122 v4 UUID (36 characters, version nibble `4`, variant bits `8`–`b`).
9. **No cycle in card-level goto graph** — The directed graph formed by card-level `goto` actions (edges from `card.actions` only, not button actions) contains no cycle. A cycle would cause the player to auto-navigate forever.

## Notes

- The canvas coordinate system is 800 × 600 px. The player scales it to fit the screen.
- Scores are integers. The `delta` on a `score` action is typically `1` (correct) or `0` (incorrect).
- The `end` card reads the `score` variable from runtime state to display the final tally.
- Images must be inlined as data URIs before export so the file is fully self-contained.
