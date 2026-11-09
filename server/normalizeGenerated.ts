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
//   m) a mistyped id ("…0100 01", with a space) withdrew a whole correct deck,
//      because the model's ids were trusted — so ids are ours now (re-minted);
//   b) text was cut in the middle of a word ("Now tell a p…");
//   e) wrong answers a child could defend reached the class.
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
import { fitBody, STORY_BODY_MAX } from "../src/shared/fitText.js";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import { shuffleQuizAnswers } from "../src/shared/shuffleAnswers.js";
import { ensureForwardLinks, gotoOf, nextCardAfter } from "../src/shared/flow.js";
import { isStockEndLine, soundsLikeEnding, isLongProse, isShortPair, isShortTerm, asksForClosingMessage } from "../src/shared/endLine.js";
import {
  pictogramName,
  pictogramNameOfSrc,
  pictogramDataUri,
  pictogramAlt,
  isPictogramCredit,
  PICTOGRAM_CREDIT,
} from "../src/shared/pictograms.js";
import {
  PICTURE_SLOT,
  PICTURE_CREDIT,
  QUIZ_QUESTION,
  QUIZ_TILES,
  FLASH_TERM,
  FLASH_BACK,
  FLASH_NEXT,
  END_HEADING,
  END_BODY,
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

/**
 * (TASK-31h) A model picture is a NAME from our set, nothing else. The returned
 * element's `src` and `alt` come from src/shared/pictograms.ts, never from the
 * model's text, so no model-controlled byte reaches `src`. A name we do not have
 * is dropped silently; so is every other kind of model picture (any `src`). An
 * element that already carries exactly one of OUR data URIs (a second pass over
 * a sanitised card) is kept, so sanitising is idempotent.
 */
function sanitizePicto(el: Record<string, unknown>): unknown | null {
  const name = pictogramName(el["picto"]) ?? pictogramNameOfSrc(el["src"]);
  if (name === null) return null;
  return {
    type: "image",
    id: mintId(),
    ...PICTURE_SLOT,
    src: pictogramDataUri(name),
    alt: pictogramAlt(name),
  };
}

function sanitizeRawElement(el: unknown): unknown | null {
  if (!isRecord(el)) return el;
  // (d) A picture the model invented ("images/cheval.png") can never be
  // exported, and a model-supplied data: URI is model-controlled bytes. The only
  // picture that survives is one chosen by NAME from our own set (TASK-31h).
  if (el["type"] === "image") return sanitizePicto(el);

  // (m) Element ids are ours: always a fresh v4, whatever the model wrote
  // (spaces, duplicates, numbers, nothing at all). Nothing refers to an element
  // by id, so there is nothing to remap.
  const withId: Record<string, unknown> = { ...el, id: mintId() };

  // (TASK-31c) The model is no longer asked for x / y / w / h (the layout is ours),
  // so any missing or non-numeric coordinate is filled from a default box for the
  // element's kind before clamping. Text and buttons are then re-laid from the
  // card template anyway; this only makes the raw element valid and on the canvas.
  const fallback = DEFAULT_BOX[typeof el["type"] === "string" ? el["type"] : ""];
  const pick = (key: "x" | "y" | "w" | "h"): number | undefined => {
    const v = el[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    return fallback?.[key];
  };
  const x = pick("x");
  const y = pick("y");
  const w = pick("w");
  const h = pick("h");
  if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
    const c = clampToCanvas({ x, y, w, h });
    return { ...withId, x: c.x, y: c.y, w: c.w, h: c.h };
  }
  return withId;
}

/** Where an element goes when the model gave no (or broken) coordinates. */
const DEFAULT_BOX: Record<string, { x: number; y: number; w: number; h: number }> = {
  text: { x: 48, y: 104, w: 704, h: 120 },
  button: { x: 48, y: 260, w: 344, h: 72 },
  field: { x: 48, y: 420, w: 704, h: 60 },
  image: { x: 48, y: 104, w: 320, h: 240 },
};

/**
 * Sanitise one parsed card (a raw JSON value) before validateCard: strip
 * un-exportable pictures, clamp coordinates, give every element a fresh id, and
 * make sure the card has SOME string id (the stack-level pass below re-mints
 * card ids once every goto can be resolved).
 */
export function sanitizeRawCard(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input["elements"])) return input;
  let elements = (input["elements"] as unknown[])
    .map(sanitizeRawElement)
    .filter((e) => e !== null);
  // At most one picture per card, and none on the end card (TASK-31h).
  const isImage = (e: unknown): boolean => isRecord(e) && e["type"] === "image";
  if (input["kind"] === "end") elements = elements.filter((e) => !isImage(e));
  else {
    let seen = false;
    elements = elements.filter((e) => {
      if (!isImage(e)) return true;
      if (seen) return false;
      seen = true;
      return true;
    });
  }
  const id = typeof input["id"] === "string" && input["id"].length > 0 ? input["id"] : mintId();
  return { ...input, id, elements };
}

/** A fresh RFC 4122 v4 id. Ids belong to us, not to the model. */
function mintId(): string {
  return crypto.randomUUID();
}

/**
 * (m) Re-mint every card id (and the stack id), and rewrite every goto to match.
 *
 * The map is built from the model's card ids as it wrote them; a goto whose
 * target matches no card (a typo, a made-up id) goes to the NEXT card in deck
 * order instead — or is dropped from the last card, which has no next. A
 * duplicated model id maps to its first card; every card still gets a distinct
 * fresh id. So one mistyped character can never withdraw a correct deck.
 */
function remintCardIds(cards: unknown[]): unknown[] {
  const fresh = cards.map(() => mintId());
  const byOld = new Map<string, string>();
  cards.forEach((c, i) => {
    if (isRecord(c) && typeof c["id"] === "string" && !byOld.has(c["id"])) {
      byOld.set(c["id"], fresh[i]!);
    }
  });

  const rewrite = (actions: unknown, index: number): unknown => {
    if (!Array.isArray(actions)) return actions;
    const out: unknown[] = [];
    for (const a of actions) {
      if (!isRecord(a) || a["type"] !== "goto") {
        out.push(a);
        continue;
      }
      const target = typeof a["cardId"] === "string" ? byOld.get(a["cardId"]) : undefined;
      if (target !== undefined) {
        out.push({ ...a, cardId: target });
      } else if (index + 1 < fresh.length) {
        out.push({ ...a, cardId: fresh[index + 1]! });
      } // else: nowhere sensible to go from the last card — drop the goto
    }
    return out;
  };

  return cards.map((c, i) => {
    if (!isRecord(c)) return c;
    const elements = Array.isArray(c["elements"])
      ? (c["elements"] as unknown[]).map((el) =>
          isRecord(el) && el["type"] === "button"
            ? { ...el, actions: rewrite(el["actions"], i) }
            : el,
        )
      : c["elements"];
    return { ...c, id: fresh[i]!, elements, actions: rewrite(c["actions"], i) };
  });
}

/** Sanitise a whole parsed stack (a raw JSON value) before validate(). */
export function sanitizeRawStack(input: unknown): unknown {
  if (!isRecord(input) || !Array.isArray(input["cards"])) return input;
  const cards = remintCardIds((input["cards"] as unknown[]).map(sanitizeRawCard));
  return { ...input, id: mintId(), cards };
}

// ---------------------------------------------------------------------------
// Text tidying (j)

const MAX_QUESTION = 240;
const MAX_BODY = 600;
const MAX_TERM = 80;
const MAX_BACK = 500;
const MAX_LABEL = 90;
const MAX_END = 100;
const MAX_END_BODY = 300;

/** Words whose trailing dot is NOT a sentence end ("Dr. Thomas Edison"). */
const ABBREVIATIONS = new Set(["dr", "mr", "mrs", "ms", "st", "e.g", "i.e", "etc", "vs", "no"]);

/** True when the full-stop at `dotIndex` of `t` belongs to a known abbreviation. */
function isAbbreviationDot(t: string, dotIndex: number): boolean {
  const start = t.lastIndexOf(" ", dotIndex) + 1;
  return ABBREVIATIONS.has(t.slice(start, dotIndex).replace(/^[("'[]+/, "").toLowerCase());
}

/**
 * Shorten `text` to at most `max` characters WITHOUT cutting a word in half
 * (b). Whole sentences are kept if enough of them fit; otherwise the cut is at
 * the last word boundary. Whenever any text is dropped the result ends with
 * "…" (TASK-28i), so a shortened fact is never presented as complete. A "." is
 * a sentence end only if the character after it in the FULL text is white space
 * or the end (so "2.5 kilograms" is never cut after "2.") and the word before
 * it is not a known abbreviation ("Dr.", "e.g."). A single word longer than the
 * limit is hard-cut (nothing better exists).
 *
 * This used to be `slice(0, max - 1) + "…"`, which printed "Now tell a p…" on
 * the last card of a live Viking deck.
 */
export function cap(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;

  const window = t.slice(0, max);

  // 1. Whole sentences: the last sentence end inside the window, if it keeps a
  //    worthwhile share of the allowance (not just "Hi.").
  let lastEnd = -1;
  for (const m of t.matchAll(/[.!?]["')\]]?(?=\s|$)/g)) {
    const end = m.index! + m[0].length;
    // A full stop becomes "…" (same length); "!"/"?" get "…" added, so leave room.
    if (end > (m[0].startsWith(".") ? max : max - 1)) break;
    if (m[0].startsWith(".") && isAbbreviationDot(t, m.index!)) continue;
    lastEnd = end;
  }
  if (lastEnd >= Math.ceil(max * 0.4)) {
    // Text was dropped after this sentence: say so. A closing full stop is
    // replaced by the ellipsis ("…flour…" not "…flour.…").
    return t.slice(0, lastEnd).trim().replace(/\.(["')\]]?)$/, "$1") + "…";
  }

  // 2. A word boundary: either the window already ends on one, or back up to
  //    the last space. One character is kept back for the "…".
  const room = max - 1;
  const nextIsBreak = /\s/.test(t.charAt(room));
  let cut = nextIsBreak ? t.slice(0, room) : t.slice(0, room).slice(0, t.slice(0, room).lastIndexOf(" ") + 1 || 0);
  cut = cut.replace(/[\s,;:\-–—]+$/, "");
  // Never end on "Dr." / "Mrs." — an abbreviation promises a name that was cut.
  const lastWord = /(\S+)$/.exec(cut);
  if (lastWord && lastWord[1]!.endsWith(".") && ABBREVIATIONS.has(lastWord[1]!.slice(0, -1).toLowerCase())) {
    cut = cut.slice(0, lastWord.index).replace(/[\s,;:\-–—]+$/, "");
  }
  if (cut.length >= Math.ceil(max * 0.25)) return cut + "…";

  // 3. One very long word: hard cut.
  return window.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
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
  // Only text that is clearly the model's own header: "Question 3", "Card 2 of 8",
  // "Q3 of 6". A bare "Q0" / "Q1" can be a real answer or term, so it is kept
  // (TASK-31g).
  return (
    /^\s*(?:question|card)\s*#?\d+\s*(?:of\s*\d+)?\s*[:.)\-–—]?\s*$/i.test(text) ||
    /^\s*q\s*#?\d+\s*of\s*\d+\s*[:.)\-–—]?\s*$/i.test(text)
  );
}

const SMALL_WORDS = new Set([
  "a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or", "but",
  "with", "from", "into", "by", "as", "is", "it", "its", "are", "be", "than",
  "that", "this", "their", "they",
]);

/**
 * Soften an unmistakable Title Case answer ("Along Edges Of Tectonic Plates")
 * by lowercasing only its small FUNCTION words ("Along Edges of Tectonic
 * Plates"). "Unmistakable" means three or more words, every one capitalised,
 * AND a small function word capitalised mid-label.
 *
 * It never lowercases a content word. The first version lowercased everything
 * after the first word, which turned "The Battle Of Hastings" into "The battle
 * of hastings" and "Isle Of Man" into "Isle of man" (J4 P1-2): a name cannot be
 * told from a title-cased phrase without a dictionary, so the safe rewrite is the
 * one that cannot corrupt a name. The prompt asks the model for sentence case in
 * the first place; this only tidies a model that ignored it.
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
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(" ");
}

function cleanLabel(label: string): string {
  const base = cap(label.replace(/\s+/g, " "), MAX_LABEL);
  return sentenceCaseLabel(base.length > 0 ? base : "…");
}

// ---------------------------------------------------------------------------
// Flash repair (b)

const PRONOUN_SUBJECTS = new Set([
  "this", "that", "these", "those", "it", "its", "there", "here", "they", "he",
  "she", "we", "you", "i", "what", "which", "who", "one",
]);

/** True when `term` is only a pronoun / expletive, or starts with one. */
function isPronounTerm(term: string): boolean {
  const first = term.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z']/g, "") ?? "";
  return PRONOUN_SUBJECTS.has(first);
}

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
  //    A pronoun or "there" is not a term: "This is the process where…" must not
  //    become a card whose front says "This" (J4 P2-1).
  const verb = /^(.{1,40}?)\s+(?:is|are|means|refers to)\s+\S/i.exec(t);
  if (verb !== null) {
    const term = verb[1]!.trim();
    if (term.split(/\s+/).length <= 4 && !isPronounTerm(term)) return { term, back: t };
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
  // (e) A wrong answer that repeats the right one, or another wrong one, can only
  // confuse (and is trivially "defensible"): drop it while at least one wrong
  // answer remains. Labels are compared after tidying, case-insensitively.
  const norm = (l: string): string => cleanLabel(l).trim().toLowerCase();
  const seen = new Set<string>(right !== undefined ? [norm(right.label)] : []);
  const distinct = kept.filter((b) => {
    if (b === right) return true;
    const key = norm(b.label);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const hasWrong = distinct.some((b) => !isCorrect(b));
  const answerSet = hasWrong ? distinct : kept;
  const answers: Element[] = answerSet.map((b, i) => ({
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

  // A one-choice "Continue" card: shrink the body box to its (fitted) text and pull
  // the button up under it, instead of leaving a 300 px box with ~250 px of blank
  // ruled paper between the words and the button (TASK-27i, J3 P2-4).
  if (buttons.length === 1 && body.length > 0) {
    const fit = fitBody(cap(body.join("\n\n"), MAX_BODY), layout.body.w, layout.body.h, STORY_BODY_MAX);
    const bodyH = Math.min(layout.body.h, Math.max(120, fit.lines * fit.lineHeight + 40));
    layout.body = { ...layout.body, h: bodyH };
    layout.buttons[0] = {
      ...layout.buttons[0]!,
      y: Math.min(layout.body.y + bodyH + 32, 480),
    };
  }

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
  if (texts[0]) elements.push({ ...texts[0], ...END_HEADING, content: cap(texts[0].content, MAX_END) });
  // An optional longer message under the heading (TASK-29k); any further texts join it.
  const message = texts.slice(1).map((t) => t.content.trim()).filter((t) => t.length > 0).join(" ");
  if (texts[1] && message.length > 0) {
    elements.push({ ...texts[1], ...END_BODY, content: cap(message, MAX_END_BODY) });
  }
  for (const f of fields) elements.push({ ...f, ...END_SCORE });
  for (const e of card.elements) {
    if (e.type === "button" || e.type === "image") elements.push(clampToCanvas(e));
  }
  return { ...card, elements };
}

/**
 * One ending, not two (TASK-29k). A model asked for "a long encouraging message
 * on the last card" tends to put it in a flash or story card right before the
 * end card ("You did it!" / "Tap the card to see the answer"), after which the
 * real end card shows its own stock line. When the card just before the end card
 * is not a quiz and its front sounds like a sign-off, fold it into the end card:
 * its front becomes the heading (unless the model wrote its own heading) and its
 * longer text becomes the body. Links that pointed at it now point at the end card.
 */
export interface FoldContext {
  /** The teacher's sentence, when the server has it (TASK-30a). */
  prompt?: string;
}

export function foldEndLikeCard(stack: Stack, ctx: FoldContext = {}): Stack {
  const endIx = stack.cards.findIndex((c) => c.kind === "end");
  if (endIx < 1) return stack;
  const end = stack.cards[endIx]!;
  const fake = stack.cards[endIx - 1]!;
  if (fake.kind === "quiz" || fake.kind === "end") return stack;
  if (stack.cards.filter((c) => c.id !== fake.id && c.kind !== "end").length < 1) return stack;
  const fakeTexts = textsOf(fake);
  const front = (fakeTexts[0]?.content ?? "").trim();
  if (front.length === 0 || !soundsLikeEnding(front)) return stack;

  // (0) A short-term front in a deck of short-term flash cards is vocabulary:
  //     never folded, whatever its back length or the prompt (TASK-30a review fix).
  const rest = stack.cards.filter((c) => c.id !== fake.id && c.kind !== "end");
  const isVocabulary =
    isShortTerm(front) &&
    rest.length > 0 &&
    rest.every((c) => c.kind === "flash" && isShortTerm(textsOf(c)[0]?.content ?? ""));
  if (isVocabulary) return stack;

  // (1) The candidate's longer text must be long prose — a term, a translation or
  //     a one-line definition ("Well done → Maith thú") is a real card (TASK-30a).
  const prose = (fakeTexts[1]?.content ?? (fakeTexts.length === 1 ? front : "")).trim();
  if (!isLongProse(prose)) return stack;

  // (2) The deck's other flash cards must not be short term → translation pairs.
  const others = stack.cards.filter((c) => c.id !== fake.id && c.kind === "flash");
  if (others.length > 0) {
    const pairs = others.filter((c) => {
      const t = textsOf(c);
      return t.length >= 2 && isShortPair(t[0]!.content, t[1]!.content);
    });
    if (pairs.length >= Math.ceil(others.length / 2)) return stack;
  }

  // (3) The teacher asked for a closing message, or the model's end card has no body.
  const endTexts = textsOf(end);
  const endHasBody = endTexts.slice(1).some((t) => t.content.trim().length > 0);
  if (!asksForClosingMessage(ctx.prompt) && endHasBody) return stack;

  const ownHeading = (endTexts[0]?.content ?? "").trim();
  const headingText = ownHeading.length === 0 || isStockEndLine(ownHeading) ? front : ownHeading;
  const longText = (fakeTexts[1]?.content ?? "").trim();
  const bodyText = longText.length > 0 ? longText : headingText === front ? (endTexts[1]?.content ?? "").trim() : front;

  const newElements: Element[] = [];
  newElements.push({
    type: "text",
    id: endTexts[0]?.id ?? fakeTexts[0]!.id,
    ...END_HEADING,
    content: cap(headingText, MAX_END),
  });
  if (bodyText.length > 0) {
    newElements.push({
      type: "text",
      id: endTexts[1]?.id ?? fakeTexts[1]?.id ?? crypto.randomUUID(),
      ...END_BODY,
      content: cap(bodyText, MAX_END_BODY),
    });
  }
  for (const e of end.elements) if (e.type !== "text") newElements.push(e);

  const retarget = (actions: Action[]): Action[] =>
    actions.map((a) => (a.type === "goto" && a.cardId === fake.id ? { ...a, cardId: end.id } : a));
  const cards = stack.cards
    .filter((c) => c.id !== fake.id)
    .map((c) =>
      c.id === end.id
        ? { ...c, elements: newElements }
        : {
            ...c,
            actions: retarget(c.actions),
            elements: c.elements.map((e) => (e.type === "button" ? { ...e, actions: retarget(e.actions) } : e)),
          },
    );
  return { ...stack, cards };
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Re-lay-out and repair ONE card from the template. `ctx.next` / `ctx.ids` are
 * supplied when the whole stack is known; a lone streamed preview card passes
 * none (it only needs a clean layout to be dealt onto the pile).
 */
export function normalizeGeneratedCard(card: Card, ctx: Ctx = {}): Card {
  if (card.kind === "end") return normalizeEnd(card);
  // A pictogram (TASK-31h) is lifted out first so the per-kind layout never sees
  // it, then put back in the template's picture slot with its credit line.
  const { name, rest } = splitPictogram(card);
  const laid =
    rest.kind === "quiz" ? normalizeQuiz(rest, ctx)
    : rest.kind === "flash" ? normalizeFlash(rest, ctx)
    : normalizeStory(rest, ctx);
  return name === null ? laid : withPictogram(laid, name);
}

/** The first pictogram on a card (by its exact data URI), and the card without any pictogram or credit. */
function splitPictogram(card: Card): { name: string | null; rest: Card } {
  let name: string | null = null;
  const elements = card.elements.filter((e) => {
    if (e.type === "image") {
      const n = pictogramNameOfSrc(e.src);
      if (n === null) return true;
      if (name === null) name = n;
      return false;
    }
    return !(e.type === "text" && isPictogramCredit(e.content));
  });
  return { name, rest: { ...card, elements } };
}

/** Add the picture and its credit line, in their template slots, to a laid-out card. */
function withPictogram(card: Card, name: string): Card {
  return {
    ...card,
    elements: [
      ...card.elements,
      { type: "image", id: newId(), ...PICTURE_SLOT, src: pictogramDataUri(name), alt: pictogramAlt(name) },
      { type: "text", id: newId(), ...PICTURE_CREDIT, content: PICTOGRAM_CREDIT },
    ],
  };
}

/**
 * Everything the generator does to a VALID model stack before the teacher sees
 * it: normalise every card, link quiz answers forward, make sure every card has
 * a way on, and shuffle which tile is right. If the result somehow fails
 * validation (it should not — every step only re-positions, retargets or adds),
 * the un-normalised stack is returned linked and shuffled, never a broken one.
 */
export interface FinaliseResult {
  stack: Stack;
  /** True when a closing message was moved onto the end card (the Maker says so). */
  movedClosingMessage: boolean;
}

export function finaliseGeneratedStackDetailed(input: Stack, ctx: FoldContext = {}): FinaliseResult {
  // One ending: fold a fake sign-off card into the end card first (TASK-29k) —
  // only when it really is a closing message (TASK-30a).
  const folded = foldEndLikeCard(input, ctx);
  const didFold = folded !== input && validate(folded).valid;
  const stack = didFold ? folded : input;
  const ids = new Set(stack.cards.map((c) => c.id));
  const cards = stack.cards.map((card, i) =>
    normalizeGeneratedCard(card, { next: nextCardAfter(stack, i), ids }),
  );
  const normalised = shuffleQuizAnswers(
    ensureForwardLinks(linkQuizAnswersForward({ ...stack, cards })),
  );
  if (validate(normalised).valid) return { stack: normalised, movedClosingMessage: didFold };
  return {
    stack: shuffleQuizAnswers(ensureForwardLinks(linkQuizAnswersForward(stack))),
    movedClosingMessage: didFold,
  };
}

export function finaliseGeneratedStack(input: Stack, ctx: FoldContext = {}): Stack {
  return finaliseGeneratedStackDetailed(input, ctx).stack;
}
