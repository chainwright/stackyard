// server/normalizeGenerated.ts
// Repair and re-lay-out what the model returns (TASK-26 b, c, d, j).
//
// The model decides WORDS; this module decides WHERE they go and makes sure a
// pupil can always move on. Round-2 review of the live app found that the
// model's output was trusted as-is, with four consequences:
//   b) a flash card came back as ONE text plus a Next button — it never flipped
//      and Next only showed on the (missing) back, so the class was stuck;
//   c) every text sat at y=40, on top of the "Card N of M" line, and long
//      questions ran into the answer tiles;
//   d) an invented picture path ("images/cheval.png") made the deck impossible
//      to export;
//   j) answers came back in Title Case, and questions with "Question 3:" labels
//      that go wrong the moment a card is inserted.
//
// Two stages, both pure:
//   1. sanitizeRawCard / sanitizeRawStack — run on the parsed JSON BEFORE
//      validation: drop pictures that are not embedded data URIs and clamp
//      coordinates onto the canvas, so a model that only mis-sizes a box no
//      longer fails validation and burns a retry.
//   2. finaliseGeneratedStack / normalizeGeneratedCard — run on a VALID stack:
//      re-lay the card from the template, repair flash cards, tidy text, link
//      every card forward and shuffle which tile is right.

import type { Stack, Card, Element, TextElement, ButtonElement, Action } from "../src/shared/types.js";
import { validate } from "../src/shared/validator.js";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import { shuffleQuizAnswers } from "../src/shared/shuffleAnswers.js";
import { ensureForwardLinks, gotoOf, nextCardAfter } from "../src/shared/flow.js";
import {
  QUIZ_QUESTION,
  QUIZ_TILES,
  FLASH_TERM,
  FLASH_BACK,
  FLASH_NEXT,
  END_HEADING,
  END_SCORE,
  MAX_QUIZ_ANSWERS,
  MAX_STORY_CHOICES,
  storyLayout,
  clampToCanvas,
} from "../src/shared/layout.js";

// ---------------------------------------------------------------------------
// Stage 1 — raw sanitising (before validation)

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** True for an embedded picture (the only kind that can be exported). */
function isDataUri(v: unknown): boolean {
  return typeof v === "string" && /^data:/i.test(v);
}

function sanitizeRawElement(el: unknown): unknown | null {
  if (!isRecord(el)) return el;
  // (d) A picture the model invented ("images/cheval.png") can never be
  // exported. Only an embedded data: URI survives.
  if (el["type"] === "image" && !isDataUri(el["src"])) return null;

  const { x, y, w, h } = el;
  if (
    typeof x === "number" && typeof y === "number" &&
    typeof w === "number" && typeof h === "number" &&
    Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h)
  ) {
    const c = clampToCanvas({ x, y, w, h });
    return { ...el, x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return el;
}

/** Sanitise one parsed card (a raw JSON value) before validateCard. */
export function sanitizeRawCard(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input["elements"])) return input;
  const elements = (input["elements"] as unknown[])
    .map(sanitizeRawElement)
    .filter((e) => e !== null);
  return { ...input, elements };
}

/** Sanitise a whole parsed stack (a raw JSON value) before validate(). */
export function sanitizeRawStack(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input["cards"])) return input;
  return { ...input, cards: (input["cards"] as unknown[]).map(sanitizeRawCard) };
}

// ---------------------------------------------------------------------------
// Text tidying (j)

const MAX_QUESTION = 240;
const MAX_BODY = 600;
const MAX_TERM = 80;
const MAX_BACK = 500;
const MAX_LABEL = 90;

function cap(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Drop a leading "Question 3:" / "Q3." / "Card 4 of 8 –" label. The card
 * counter already shows position, and inserting a card makes the typed number
 * wrong (J2 step 16). Leaves the text alone if stripping would empty it.
 */
export function stripQuestionPrefix(text: string): string {
  const stripped = text.replace(
    /^\s*(?:question|q|card)\s*#?\d+\s*(?:of\s*\d+)?\s*[:.)\-–—]\s*/i,
    "",
  );
  return stripped.trim().length > 0 ? stripped : text;
}

/** A text that is only a counter ("Question 3 of 6", "Card 2") — chrome, not content. */
function isCounterOnly(text: string): boolean {
  return /^\s*(?:question|q|card)\s*#?\d+\s*(?:of\s*\d+)?\s*[:.)\-–—]?\s*$/i.test(text);
}

const SMALL_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "with", "from", "into", "by", "as", "is", "it", "its", "are", "be", "than",
  "that", "this", "their", "they",
]);

/**
 * Turn an unmistakable Title Case answer ("Along Edges Of Tectonic Plates")
 * into sentence case ("Along edges of tectonic plates"). "Unmistakable" means
 * three or more words, every one capitalised, AND a small function word
 * capitalised mid-label — a real name like "Mount Vesuvius" or "Brian Boru" has
 * no such word and is left alone. Acronyms (DNA) and "I" are kept.
 */
export function sentenceCaseLabel(label: string): string {
  const words = label.trim().split(/\s+/);
  if (words.length < 3) return label;
  const capitalised = (w: string): boolean => /^[A-Z]/.test(w) || !/[A-Za-z]/.test(w);
  if (!words.every(capitalised)) return label;
  const smallCapitalised = words
    .slice(1)
    .some((w) => SMALL_WORDS.has(w.toLowerCase()) && /^[A-Z]/.test(w));
  if (!smallCapitalised) return label;
  return words
    .map((w, i) => {
      if (i === 0) return w;
      if (w === "I" || /^[A-Z]{2,}[.,!?]?$/.test(w)) return w;
      return w.toLowerCase();
    })
    .join(" ");
}

function cleanLabel(label: string): string {
  const base = cap(label.replace(/\s+/g, " "), MAX_LABEL);
  return sentenceCaseLabel(base.length > 0 ? base : "…");
}

// ---------------------------------------------------------------------------
// Flash repair (b)

/** Split one block of flash text into a term and an explanation, if it cleanly can. */
export function splitTermAndExplanation(text: string): { term: string; back: string } | null {
  const t = text.trim();
  if (t.length === 0) return null;

  // 1. Newline: first line is the term, the rest the explanation.
  const lines = t.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length >= 2 && lines[0]!.length <= 60) {
    return { term: lines[0]!.replace(/[:\-–—]\s*$/, "").trim(), back: lines.slice(1).join("\n") };
  }

  // 2. A clear separator: "Term: explanation", "Term – explanation".
  const sep = /\s*(?::\s+|\s[–—-]\s|\s=\s)/.exec(t);
  if (sep !== null && sep.index > 0) {
    const term = t.slice(0, sep.index).trim();
    const back = t.slice(sep.index + sep[0].length).trim();
    if (term.length >= 1 && term.length <= 40 && term.split(/\s+/).length <= 6 && back.length >= 3) {
      return { term, back };
    }
  }

  // 3. "Evaporation is when …" / "A tributary means …": the subject is the term
  //    and the whole sentence is the explanation.
  const verb = /^(.{1,40}?)\s+(?:is|are|means|refers to)\s+\S/i.exec(t);
  if (verb !== null) {
    const term = verb[1]!.trim();
    if (term.split(/\s+/).length <= 4) return { term, back: t };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Per-kind layout

function newId(): string {
  return crypto.randomUUID();
}

function textsOf(card: Card): TextElement[] {
  return card.elements.filter((e): e is TextElement => e.type === "text" && !isCounterOnly(e.content));
}

function buttonsOf(card: Card): ButtonElement[] {
  return card.elements.filter((e): e is ButtonElement => e.type === "button");
}

/** Everything that is neither text nor button (a field, an embedded picture). */
function othersOf(card: Card): Element[] {
  return card.elements
    .filter((e) => e.type !== "text" && e.type !== "button")
    .map((e) => clampToCanvas(e));
}

function isCorrect(b: ButtonElement): boolean {
  return b.actions.some((a) => a.type === "score" && a.delta === 1);
}

interface Ctx {
  /** The card after this one in deck order (undefined for a lone preview card). */
  next?: Card | undefined;
  /** Every card id in the stack (undefined for a lone preview card). */
  ids?: Set<string> | undefined;
}

/** Keep a goto only if it targets a real card (or we can't tell). */
function keepGoto(actions: Action[], ctx: Ctx): Action[] {
  const g = gotoOf(actions);
  if (g === null) return actions;
  if (ctx.ids !== undefined && !ctx.ids.has(g)) return actions.filter((a) => a.type !== "goto");
  return actions;
}

function normalizeQuiz(card: Card, ctx: Ctx): Card {
  const texts = textsOf(card);
  const question: Element[] = texts[0]
    ? [{
        ...texts[0],
        ...QUIZ_QUESTION,
        content: cap(stripQuestionPrefix(texts[0].content), MAX_QUESTION),
      }]
    : [];

  // Keep at most four answers, always including the right one.
  const buttons = buttonsOf(card);
  const right = buttons.find(isCorrect);
  let kept = buttons.slice(0, MAX_QUIZ_ANSWERS);
  if (right !== undefined && !kept.includes(right)) {
    kept = [...kept.slice(0, MAX_QUIZ_ANSWERS - 1), right];
  }
  const answers: Element[] = kept.map((b, i) => ({
    ...b,
    ...QUIZ_TILES[i]!,
    label: cleanLabel(b.label),
    actions: keepGoto(b.actions, ctx),
  }));

  return { ...card, elements: [...question, ...answers, ...othersOf(card)] };
}

function normalizeStory(card: Card, ctx: Ctx): Card {
  const texts = textsOf(card);
  const body = texts.map((t) => stripQuestionPrefix(t.content).trim()).filter((t) => t.length > 0);
  const buttons = buttonsOf(card).slice(0, MAX_STORY_CHOICES);
  const layout = storyLayout(buttons.length);

  const bodyEl: Element[] =
    body.length > 0
      ? [{
          type: "text",
          id: texts[0]!.id,
          ...layout.body,
          content: cap(body.join("\n\n"), MAX_BODY),
        }]
      : [];
  const buttonEls: Element[] = buttons.map((b, i) => ({
    ...b,
    ...layout.buttons[i]!,
    label: cleanLabel(b.label),
    actions: keepGoto(b.actions, ctx),
  }));
  return { ...card, elements: [...bodyEl, ...buttonEls, ...othersOf(card)] };
}

/** Make a flash card's front + back + Next, or convert it to a story card. */
function normalizeFlash(card: Card, ctx: Ctx): Card {
  const texts = textsOf(card);
  let term: string | null = null;
  let back = "";

  if (texts.length >= 2) {
    term = texts[0]!.content.trim();
    back = texts.slice(1).map((t) => t.content.trim()).filter((t) => t.length > 0).join("\n");
  } else if (texts.length === 1) {
    const split = splitTermAndExplanation(texts[0]!.content);
    if (split !== null) {
      term = split.term;
      back = split.back;
    } else {
      // A bare paragraph with no clean term: read it as a story card with a
      // Continue button — always playable, nothing lost.
      return flashToStory(card, texts[0]!.content, ctx);
    }
  } else {
    return flashToStory(card, "Keep going when you're ready.", ctx);
  }

  const firstButton = buttonsOf(card)[0];
  const baseActions = firstButton ? keepGoto(firstButton.actions, ctx) : [];
  const actions: Action[] =
    gotoOf(baseActions) !== null || ctx.next === undefined
      ? baseActions
      : [...baseActions, { type: "goto", cardId: ctx.next.id }];

  const termEl: TextElement = {
    type: "text",
    id: texts[0]?.id ?? newId(),
    ...FLASH_TERM,
    content: cap(term ?? "", MAX_TERM),
  };
  const elements: Element[] = [termEl];
  if (back.length > 0) {
    elements.push({
      type: "text",
      id: texts[1]?.id ?? newId(),
      ...FLASH_BACK,
      content: cap(back, MAX_BACK),
    });
  }
  elements.push({
    type: "button",
    id: firstButton?.id ?? newId(),
    ...FLASH_NEXT,
    label: firstButton && firstButton.label.trim().length > 0 ? cap(firstButton.label, 30) : "Next Card",
    actions,
  });
  return { ...card, elements: [...elements, ...othersOf(card)] };
}

function flashToStory(card: Card, body: string, ctx: Ctx): Card {
  const story: Card = { ...card, kind: "story" };
  const firstText = card.elements.find((e): e is TextElement => e.type === "text");
  const withBody: Card = {
    ...story,
    elements: [
      {
        type: "text",
        id: firstText?.id ?? newId(),
        x: 48, y: 104, w: 704, h: 300,
        content: body,
      },
      ...card.elements.filter((e) => e.type === "button"),
      ...othersOf(card),
    ],
  };
  const out = normalizeStory(withBody, ctx);
  // A story with no button gains "Continue" in ensureForwardLinks; do it here
  // too when we know the next card, so a lone preview is already playable.
  const hasButton = out.elements.some((e) => e.type === "button");
  if (!hasButton && ctx.next !== undefined) {
    return {
      ...out,
      elements: [
        ...out.elements,
        {
          type: "button",
          id: newId(),
          x: 408, y: 440, w: 344, h: 80,
          label: "Continue",
          actions: [{ type: "goto", cardId: ctx.next.id }],
        },
      ],
    };
  }
  return out;
}

function normalizeEnd(card: Card): Card {
  const texts = textsOf(card);
  const fields = card.elements.filter((e) => e.type === "field");
  const elements: Element[] = [];
  if (texts[0]) elements.push({ ...texts[0], ...END_HEADING, content: cap(texts[0].content, MAX_TERM) });
  for (const f of fields) elements.push({ ...f, ...END_SCORE });
  for (const e of card.elements) {
    if (e.type === "button" || e.type === "image") elements.push(clampToCanvas(e));
  }
  return { ...card, elements };
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Re-lay-out and repair ONE card from the template. `ctx.next` / `ctx.ids` are
 * supplied when the whole stack is known; a lone streamed preview card passes
 * none (it only needs a clean layout to be dealt onto the pile).
 */
export function normalizeGeneratedCard(card: Card, ctx: Ctx = {}): Card {
  switch (card.kind) {
    case "quiz": return normalizeQuiz(card, ctx);
    case "flash": return normalizeFlash(card, ctx);
    case "story": return normalizeStory(card, ctx);
    case "end": return normalizeEnd(card);
  }
}

/**
 * Everything the generator does to a VALID model stack before the teacher sees
 * it: normalise every card, link quiz answers forward, make sure every card has
 * a way on, and shuffle which tile is right. If the result somehow fails
 * validation (it should not — every step only re-positions, retargets or adds),
 * the un-normalised stack is returned linked and shuffled, never a broken one.
 */
export function finaliseGeneratedStack(stack: Stack): Stack {
  const ids = new Set(stack.cards.map((c) => c.id));
  const cards = stack.cards.map((card, i) =>
    normalizeGeneratedCard(card, { next: nextCardAfter(stack, i), ids }),
  );
  const normalised = shuffleQuizAnswers(
    ensureForwardLinks(linkQuizAnswersForward({ ...stack, cards })),
  );
  if (validate(normalised).valid) return normalised;
  return shuffleQuizAnswers(ensureForwardLinks(linkQuizAnswersForward(stack)));
}
