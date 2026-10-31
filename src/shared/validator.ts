// src/shared/validator.ts
// validate(input: unknown): ValidationResult
// Checks all seven invariants; collects all failures before returning.
// Does not throw. No `any`. TypeScript strict mode.

import type {
  Stack,
  Card,
  Element,
  Action,
  ButtonElement,
  ValidationResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Type guards

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function isNumber(v: unknown): v is number {
  return typeof v === "number";
}

function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function parseAction(raw: unknown): Action | null {
  if (!isRecord(raw)) return null;
  const type = raw["type"];
  if (type === "goto" && isString(raw["cardId"])) {
    return { type: "goto", cardId: raw["cardId"] };
  }
  if (type === "score" && isNumber(raw["delta"])) {
    return { type: "score", delta: raw["delta"] };
  }
  if (
    type === "sound" &&
    (raw["sound"] === "cheer" || raw["sound"] === "buzz")
  ) {
    return { type: "sound", sound: raw["sound"] };
  }
  if (
    type === "set" &&
    isString(raw["variable"]) &&
    (isString(raw["value"]) || isNumber(raw["value"]))
  ) {
    return {
      type: "set",
      variable: raw["variable"],
      value: raw["value"],
    };
  }
  return null;
}

function parseElement(raw: unknown): Element | null {
  if (!isRecord(raw)) return null;
  const { type, id, x, y, w, h } = raw;
  if (
    !isString(id) ||
    !isNumber(x) ||
    !isNumber(y) ||
    !isNumber(w) ||
    !isNumber(h)
  ) {
    return null;
  }
  if (type === "text" && isString(raw["content"])) {
    return { type: "text", id, x, y, w, h, content: raw["content"] };
  }
  if (
    type === "button" &&
    isString(raw["label"]) &&
    isArray(raw["actions"])
  ) {
    const actions: Action[] = [];
    for (const a of raw["actions"]) {
      const parsed = parseAction(a);
      if (parsed === null) return null;
      actions.push(parsed);
    }
    return { type: "button", id, x, y, w, h, label: raw["label"], actions };
  }
  if (type === "image" && isString(raw["src"]) && isString(raw["alt"])) {
    return { type: "image", id, x, y, w, h, src: raw["src"], alt: raw["alt"] };
  }
  if (type === "field" && isString(raw["variable"])) {
    return { type: "field", id, x, y, w, h, variable: raw["variable"] };
  }
  return null;
}

function parseCard(raw: unknown): Card | null {
  if (!isRecord(raw)) return null;
  const { id, kind, elements, actions } = raw;
  if (
    !isString(id) ||
    (kind !== "quiz" &&
      kind !== "flash" &&
      kind !== "story" &&
      kind !== "end") ||
    !isArray(elements) ||
    !isArray(actions)
  ) {
    return null;
  }
  const parsedElements: Element[] = [];
  for (const el of elements) {
    const parsed = parseElement(el);
    if (parsed === null) return null;
    parsedElements.push(parsed);
  }
  const parsedActions: Action[] = [];
  for (const a of actions) {
    const parsed = parseAction(a);
    if (parsed === null) return null;
    parsedActions.push(parsed);
  }
  return {
    id,
    kind,
    elements: parsedElements,
    actions: parsedActions,
  };
}

function parseStack(raw: unknown): Stack | null {
  if (!isRecord(raw)) return null;
  const { id, title, theme, cards } = raw;
  if (!isString(id) || !isString(title)) return null;
  if (!isRecord(theme)) return null;
  const { background, foreground, font } = theme;
  if (!isString(background) || !isString(foreground) || !isString(font)) {
    return null;
  }
  if (!isArray(cards)) return null;
  const parsedCards: Card[] = [];
  for (const c of cards) {
    const parsed = parseCard(c);
    if (parsed === null) return null;
    parsedCards.push(parsed);
  }
  return {
    id,
    title,
    theme: { background, foreground, font },
    cards: parsedCards,
  };
}

// ---------------------------------------------------------------------------
// Invariant checks

/** RFC 4122 v4 UUID: version nibble = 4, variant bits = 8-b */
const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuidV4(id: string): boolean {
  return UUID_V4_RE.test(id);
}

/** Collect all goto actions recursively from a list of actions. */
function collectGotos(actions: Action[]): string[] {
  return actions
    .filter((a): a is Extract<Action, { type: "goto" }> => a.type === "goto")
    .map((a) => a.cardId);
}

/** Collect all button elements from a card. */
function buttons(card: Card): ButtonElement[] {
  return card.elements.filter(
    (el): el is ButtonElement => el.type === "button"
  );
}

/** True if a button's actions contain exactly a score action with delta === 1. */
function isCorrectButton(btn: ButtonElement): boolean {
  return btn.actions.some((a) => a.type === "score" && a.delta === 1);
}

function checkInvariants(stack: Stack): string[] {
  const errors: string[] = [];

  // 1. Unique IDs — stack.id, every card.id, every element.id must all be unique.
  const seen = new Set<string>();
  const addId = (id: string): boolean => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  };

  if (!addId(stack.id)) errors.push("duplicate-id");
  for (const card of stack.cards) {
    if (!addId(card.id) && !errors.includes("duplicate-id")) {
      errors.push("duplicate-id");
    }
    for (const el of card.elements) {
      if (!addId(el.id) && !errors.includes("duplicate-id")) {
        errors.push("duplicate-id");
      }
    }
  }

  // 2. Valid goto targets — every goto cardId must exist in stack.cards.
  const cardIds = new Set(stack.cards.map((c) => c.id));
  let invalidGoto = false;
  for (const card of stack.cards) {
    for (const target of collectGotos(card.actions)) {
      if (!cardIds.has(target)) { invalidGoto = true; break; }
    }
    if (invalidGoto) break;
    for (const btn of buttons(card)) {
      for (const target of collectGotos(btn.actions)) {
        if (!cardIds.has(target)) { invalidGoto = true; break; }
      }
      if (invalidGoto) break;
    }
    if (invalidGoto) break;
  }
  if (invalidGoto) errors.push("invalid-goto");

  // 3. Exactly one end card.
  const endCount = stack.cards.filter((c) => c.kind === "end").length;
  if (endCount !== 1) errors.push("end-card-count");

  // 4. Quiz answer invariant — each quiz card must have exactly one correct button.
  for (const card of stack.cards) {
    if (card.kind !== "quiz") continue;
    const btns = buttons(card);
    const correctCount = btns.filter(isCorrectButton).length;
    const incorrectCount = btns.filter((b) => !isCorrectButton(b)).length;
    if (correctCount !== 1 || incorrectCount < 1) {
      errors.push("quiz-answer");
      break;
    }
  }

  // 5. Canvas bounds — every element must fit within 800×600.
  let outOfBounds = false;
  for (const card of stack.cards) {
    for (const el of card.elements) {
      if (el.x + el.w > 800 || el.y + el.h > 600) {
        outOfBounds = true;
        break;
      }
    }
    if (outOfBounds) break;
  }
  if (outOfBounds) errors.push("canvas-bounds");

  // 6. Non-empty title.
  if (stack.title.trim() === "") errors.push("blank-title");

  // 7. At least one non-end card.
  const nonEndCount = stack.cards.filter((c) => c.kind !== "end").length;
  if (nonEndCount < 1) errors.push("no-content-cards");

  // 8. All IDs must be valid RFC 4122 v4 UUIDs.
  let invalidId = false;
  if (!isUuidV4(stack.id)) invalidId = true;
  if (!invalidId) {
    for (const card of stack.cards) {
      if (!isUuidV4(card.id)) { invalidId = true; break; }
      for (const el of card.elements) {
        if (!isUuidV4(el.id)) { invalidId = true; break; }
      }
      if (invalidId) break;
    }
  }
  if (invalidId) errors.push("invalid-id");

  // 9. No cycle in card-level goto graph.
  // Build adjacency list: edges from card.actions gotos only (not button actions).
  // Use iterative DFS with three-colour visited set (white=0, grey=1, black=2).
  const adjacency = new Map<string, string[]>();
  for (const card of stack.cards) {
    const targets: string[] = [];
    for (const action of card.actions) {
      if (action.type === "goto" && cardIds.has(action.cardId)) {
        targets.push(action.cardId);
      }
    }
    adjacency.set(card.id, targets);
  }

  // Three-colour DFS: 0 = unvisited, 1 = in-stack (grey), 2 = done (black)
  const colour = new Map<string, 0 | 1 | 2>();
  for (const card of stack.cards) {
    colour.set(card.id, 0);
  }

  let hasCycle = false;
  for (const card of stack.cards) {
    if (colour.get(card.id) !== 0 || hasCycle) continue;

    // Iterative DFS using an explicit stack of [nodeId, neighbourIndex] frames
    const dfsStack: Array<{ id: string; nextIdx: number }> = [];
    colour.set(card.id, 1);
    dfsStack.push({ id: card.id, nextIdx: 0 });

    while (dfsStack.length > 0 && !hasCycle) {
      const frame = dfsStack[dfsStack.length - 1]!;
      const neighbours = adjacency.get(frame.id) ?? [];

      if (frame.nextIdx < neighbours.length) {
        const neighbourId = neighbours[frame.nextIdx]!;
        frame.nextIdx++;

        const c = colour.get(neighbourId);
        if (c === 1) {
          // Back edge — cycle found
          hasCycle = true;
        } else if (c === 0) {
          colour.set(neighbourId, 1);
          dfsStack.push({ id: neighbourId, nextIdx: 0 });
        }
        // c === 2: already fully explored, skip
      } else {
        // All neighbours visited — mark node black and pop
        colour.set(frame.id, 2);
        dfsStack.pop();
      }
    }
  }

  if (hasCycle) errors.push("goto-cycle");

  return errors;
}

// ---------------------------------------------------------------------------
// Public API

export function validate(input: unknown): ValidationResult {
  const stack = parseStack(input);
  if (stack === null) {
    return { valid: false, errors: ["invalid-shape"] };
  }
  const errors = checkInvariants(stack);
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, stack };
}
