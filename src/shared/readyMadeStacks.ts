// src/shared/readyMadeStacks.ts
// Ready-made, complete stacks for the three Start-screen examples. They are the
// OFFLINE FALLBACK: when the LLM is unavailable (no key, down, blocked), the
// generator deals one of these real decks instead of a placeholder
// "Correct Answer"/"Wrong Answer" stub (the built-app review's P0 #4).
//
//   - The sentence that matches an example → that example's deck.
//   - Any other sentence → the closest deck, flagged `isReadyMade` so the UI can
//     say honestly that it's a ready-made example, not generated from the words.
//
// Every deck is written for 4th class (~9–10 years old), passes the validator,
// and has its quiz answers linked forward (play walks the whole deck in order
// and the last card shows the real score). Shared so the server fallback and
// the editor demo use the same source of truth.

import type { Stack, Card, Element } from "./types.js";
import { linkQuizAnswersForward } from "./linkForward.js";
import { shuffleQuizAnswers } from "./shuffleAnswers.js";
import { READY_MADE_IMAGES } from "./readyMadeImages.js";
import { creditLine } from "./deckImageTypes.js";

/** Link quiz answers forward, then shuffle which tile the correct answer sits
 *  on (deterministic per stack id), so the right answer is not always tile A
 *  (J3 P0, 5 Nov panel). */
function finalise(stack: Stack): Stack {
  return shuffleQuizAnswers(linkQuizAnswersForward(stack));
}

/**
 * Place one public-domain image (picked via the Openverse MCP server, TASK-23 d)
 * and its credit line on the FIRST card of a deck, keyed by `deckKey`. The image
 * sits top-right and the credit line runs along the bottom, both inside the
 * 800×600 canvas and clear of the existing elements. Returns a NEW stack; the
 * input is unchanged. If there is no image for the key, the stack is returned
 * as-is.
 */
function withDeckImage(uuid: () => string, stack: Stack, deckKey: string): Stack {
  const img = READY_MADE_IMAGES[deckKey];
  // Target the first card that renders image elements. Flash cards use a fixed
  // front/back layout that ignores image elements, so for an all-flash deck
  // (Irish words) the image lands on the first quiz/story card instead.
  const targetIndex = stack.cards.findIndex(
    (c) => c.kind === "quiz" || c.kind === "story",
  );
  const first = targetIndex >= 0 ? stack.cards[targetIndex] : undefined;
  if (img === undefined || first === undefined) return stack;

  // A small thumbnail tucked in the top strip ABOVE the question (which starts
  // at y:104), and a credit line along the bottom. Both fit the canvas
  // (x+w ≤ 800, y+h ≤ 600): the image is y:8..104, the credit y:566..594.
  const imageEl: Element = {
    type: "image",
    id: uuid(),
    x: 504, y: 8, w: 150, h: 90,
    src: img.dataUri,
    alt: `${deckKey} illustration`,
  };
  const creditEl: Element = {
    type: "text",
    id: uuid(),
    x: 48, y: 566, w: 704, h: 28,
    content: creditLine(img),
  };

  const cards = stack.cards.slice();
  cards[targetIndex] = { ...first, elements: [...first.elements, imageEl, creditEl] };
  return { ...stack, cards };
}

// ---------------------------------------------------------------------------
// Deterministic valid v4 UUIDs, namespaced per deck so no two decks collide.

function makeUuid(prefix: string): () => string {
  let n = 0;
  return () => {
    n += 1;
    const hex = (n).toString(16).padStart(12, "0");
    return `${prefix}-0000-4000-8000-${hex}`;
  };
}

// ---------------------------------------------------------------------------
// Card builders (shared layout, matching the mockups and demoStack)

function quizCard(
  uuid: () => string,
  question: string,
  answers: [string, string, string, string],
  correctIndex: number,
): Card {
  return {
    id: uuid(),
    kind: "quiz",
    elements: [
      { type: "text", id: uuid(), x: 48, y: 104, w: 704, h: 128, content: question },
      ...answers.map((label, i) => ({
        type: "button" as const,
        id: uuid(),
        x: i % 2 === 0 ? 48 : 408,
        y: i < 2 ? 296 : 424,
        w: 344,
        h: 96,
        label,
        actions: [
          { type: "score" as const, delta: i === correctIndex ? 1 : 0 },
          { type: "sound" as const, sound: (i === correctIndex ? "cheer" : "buzz") as "cheer" | "buzz" },
          // goto filled in by linkQuizAnswersForward.
        ],
      })),
    ],
    actions: [],
  };
}

function flashCard(
  uuid: () => string,
  term: string,
  back: string,
  gotoId: string,
): Card {
  return {
    id: uuid(),
    kind: "flash",
    elements: [
      { type: "text", id: uuid(), x: 48, y: 264, w: 704, h: 72, content: term },
      { type: "text", id: uuid(), x: 48, y: 360, w: 704, h: 120, content: back },
      {
        type: "button",
        id: uuid(),
        x: 408, y: 496, w: 344, h: 72,
        label: "Next Card",
        actions: [{ type: "goto", cardId: gotoId }],
      },
    ],
    actions: [],
  };
}

/**
 * A story "consequence" card: a short panel of what happened after a choice,
 * with a single "Continue" button that rejoins the deck. Used so each branch of
 * a story goes to its OWN card before the two paths meet again.
 */
function storyConsequence(uuid: () => string, body: string, gotoId: string): Card {
  return {
    id: uuid(),
    kind: "story",
    elements: [
      { type: "text", id: uuid(), x: 48, y: 104, w: 704, h: 300, content: body },
      {
        type: "button",
        id: uuid(),
        x: 408, y: 440, w: 344, h: 80,
        label: "Continue",
        actions: [{ type: "goto", cardId: gotoId }],
      },
    ],
    actions: [],
  };
}

function endCard(uuid: () => string, id: string): Card {
  return {
    id,
    kind: "end",
    elements: [
      { type: "text", id: uuid(), x: 48, y: 120, w: 704, h: 72, content: "Well done!" },
      { type: "field", id: uuid(), x: 48, y: 420, w: 704, h: 60, variable: "score" },
    ],
    actions: [],
  };
}

const THEME = {
  background: "#FBF8F1",
  foreground: "#1E2A47",
  font: "'Stackyard Reading', sans-serif",
} as const;

// ---------------------------------------------------------------------------
// Deck 1 — Vikings in Ireland quiz

export function vikingsStack(): Stack {
  const uuid = makeUuid("a1a1a1a1");
  const endId = uuid();

  // Card 1 is factually true: the Vikings began raiding Ireland around 795,
  // long after people already lived there — so "who sailed first?" is wrong
  // (J1/J3, 5 Nov panel). Ask who the raiders of 795 were instead.
  const c1 = quizCard(uuid, "Which people began raiding Ireland around the year 795?", ["Vikings", "Romans", "Greeks", "Egyptians"], 0);
  const c2 = quizCard(uuid, "What is a longship?", ["A long Viking boat", "A house", "A sword", "A town"], 0);
  const c3 = quizCard(uuid, "Where did the Vikings build a town in 841?", ["Dublin", "Cork", "Galway", "Sligo"], 0);
  const c8 = quizCard(uuid, "Who led a Viking raiding party?", ["A chieftain", "A monk", "A baker", "A farmer"], 0);
  // Narrowed so exactly one answer is defensible: the Vikings of Dublin traded
  // silver, wool, salt and amber alike, so the old distractors were all true
  // too (lesson-checker agent, TASK-23). Ask for a precious METAL and use
  // metals they did NOT trade as distractors (no joke options).
  const c9 = quizCard(uuid, "Which precious metal did the Vikings trade in Dublin?", ["Silver", "Tin", "Lead", "Copper"], 0);
  const c10 = quizCard(uuid, "Which Irish king fought the Vikings at Clontarf?", ["Brian Boru", "Niall", "Conor", "Diarmuid"], 0);
  // Flash + story reference later ids; build them after the ids exist.
  const c11 = flashCard(uuid, "Thingmote", "A raised mound where the Norse of Dublin held their meetings.", endId);

  // The two story choices each lead to their OWN consequence card, and both
  // consequences rejoin the deck at c8 (visibly AFTER the choice) — a real
  // branch, not two buttons pointing at one card (built-app review P0 #2).
  const c6 = storyConsequence(
    uuid,
    "The crew raids the monastery. The monks hide the silver, but the Vikings carry off a golden cross and sail away before dawn.",
    c8.id,
  );
  const c7 = storyConsequence(
    uuid,
    "The crew stays and builds a longphort by the water. Over the years the camp grows into the town of Dublin.",
    c8.id,
  );
  const c5 = {
    id: uuid(),
    kind: "story" as const,
    elements: [
      { type: "text" as const, id: uuid(), x: 48, y: 104, w: 704, h: 224, content: "The longship lands on the River Liffey at dawn. The crew can raid the monastery for its silver, or stay and build a longphort by the water. What should they do?" },
      { type: "button" as const, id: uuid(), x: 48, y: 360, w: 344, h: 80, label: "Raid the monastery", actions: [{ type: "goto" as const, cardId: c6.id }] },
      { type: "button" as const, id: uuid(), x: 408, y: 360, w: 344, h: 80, label: "Build a longphort", actions: [{ type: "goto" as const, cardId: c7.id }] },
    ],
    actions: [],
  };
  const c4 = flashCard(uuid, "Longphort", "A longphort was a fortified ship harbour the Vikings built on a river or sheltered inlet. Dublin began as a longphort on the River Liffey in 841.", c5.id);
  const end = endCard(uuid, endId);

  const stack: Stack = {
    id: uuid(),
    title: "Vikings in Ireland",
    theme: THEME,
    cards: [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, end],
  };
  return finalise(withDeckImage(uuid, stack, "vikings"));
}

// ---------------------------------------------------------------------------
// Deck 2 — Times tables game

export function timesTablesStack(): Stack {
  const uuid = makeUuid("b2b2b2b2");
  const endId = uuid();

  const cards: Card[] = [
    quizCard(uuid, "What is 3 × 4?", ["12", "7", "9", "34"], 0),
    quizCard(uuid, "What is 6 × 7?", ["42", "36", "48", "13"], 0),
    quizCard(uuid, "What is 8 × 8?", ["64", "16", "56", "72"], 0),
    quizCard(uuid, "What is 9 × 6?", ["54", "45", "63", "15"], 0),
    quizCard(uuid, "What is 7 × 5?", ["35", "30", "40", "12"], 0),
    quizCard(uuid, "What is 12 × 3?", ["36", "33", "15", "39"], 0),
    quizCard(uuid, "What is 11 × 4?", ["44", "40", "48", "15"], 0),
    quizCard(uuid, "What is 12 × 12?", ["144", "124", "132", "122"], 0),
    endCard(uuid, endId),
  ];

  const stack: Stack = {
    id: uuid(),
    title: "Times Tables Game",
    theme: THEME,
    cards,
  };
  return finalise(withDeckImage(uuid, stack, "times-tables"));
}

// ---------------------------------------------------------------------------
// Deck 3 — Irish words flashcards

export function irishWordsStack(): Stack {
  const uuid = makeUuid("c3c3c3c3");
  const endId = uuid();

  // Ten flashcards (Irish word → meaning), then a short check quiz, then end.
  // Flash cards chain forward via their "Next Card" button.
  const words: [string, string][] = [
    ["Dia duit", "Hello (literally, God be with you)."],
    ["Slán", "Goodbye."],
    ["Go raibh maith agat", "Thank you."],
    ["Le do thoil", "Please."],
    ["Madra", "Dog."],
    ["Cat", "Cat."],
    ["Uisce", "Water."],
    ["Bainne", "Milk."],
    ["Scoil", "School."],
    ["Cara", "Friend."],
  ];

  const uuids: string[] = [];
  // Pre-allocate card ids so each flash card can link to the next.
  const checkQuizId = `c3c3c3c3-0000-4000-8000-${(1000).toString(16).padStart(12, "0")}`;
  // We build cards in order and wire each flash "Next" to the following card.
  const flashCards: Card[] = [];
  // Reserve ids deterministically by building backwards.
  // Simpler: build forward, then fix up gotos.
  const cards: Card[] = [];
  for (let i = 0; i < words.length; i++) {
    const [term, meaning] = words[i]!;
    // Placeholder goto; fixed up after all ids are known.
    cards.push(flashCard(uuid, term, meaning, endId));
  }
  // A short check quiz at the end before the score.
  const check = quizCard(uuid, 'What does "Go raibh maith agat" mean?', ["Thank you", "Hello", "Goodbye", "Please"], 0);
  const end = endCard(uuid, endId);

  // Wire each flashcard's "Next Card" to the following card (last flash → check).
  const ordered = [...cards, check, end];
  for (let i = 0; i < cards.length; i++) {
    const nextId = ordered[i + 1]!.id;
    const nextBtn = cards[i]!.elements.find((e) => e.type === "button");
    if (nextBtn && nextBtn.type === "button") {
      nextBtn.actions = [{ type: "goto", cardId: nextId }];
    }
  }
  void uuids; void flashCards; void checkQuizId;

  const stack: Stack = {
    id: uuid(),
    title: "Everyday Words in Irish",
    theme: THEME,
    cards: ordered,
  };
  return finalise(withDeckImage(uuid, stack, "irish-words"));
}

// ---------------------------------------------------------------------------
// Matching a prompt to a ready-made deck

export interface ReadyMade {
  /** A stable key for the deck. */
  key: "vikings" | "times-tables" | "irish-words";
  /** The ready-made stack. */
  stack: Stack;
  /**
   * True when the prompt clearly matches this example (so the UI can treat it
   * as the intended deck). False when it is the *closest* deck chosen for an
   * unmatched free-text sentence (so the UI says it's a ready-made example).
   */
  matched: boolean;
}

const BUILDERS: Record<ReadyMade["key"], () => Stack> = {
  vikings: vikingsStack,
  "times-tables": timesTablesStack,
  "irish-words": irishWordsStack,
};

/** Keyword signals per deck; higher overlap wins. */
const SIGNALS: Record<ReadyMade["key"], string[]> = {
  vikings: ["viking", "ireland", "irish history", "longship", "dublin", "norse"],
  "times-tables": ["times table", "times tables", "multiplication", "multiply", "maths", "math", "times", "tables"],
  "irish-words": ["irish word", "irish words", "as gaeilge", "gaeilge", "flashcard", "flashcards", "vocabulary", "words in irish"],
};

function scorePrompt(prompt: string, key: ReadyMade["key"]): number {
  const p = prompt.toLowerCase();
  let score = 0;
  for (const signal of SIGNALS[key]) {
    if (p.includes(signal)) score += signal.includes(" ") ? 2 : 1;
  }
  return score;
}

/**
 * Pick the ready-made deck for `prompt`. If the prompt clearly matches one
 * example, `matched` is true and that deck is returned. Otherwise the deck with
 * the best keyword overlap is returned with `matched: false` (defaulting to the
 * Vikings deck when nothing matches), so a free-text sentence still gets a real,
 * complete set of cards — flagged as a ready-made example.
 */
export function pickReadyMade(prompt: string): ReadyMade {
  const keys = Object.keys(BUILDERS) as ReadyMade["key"][];
  let best: ReadyMade["key"] = "vikings";
  let bestScore = -1;
  for (const key of keys) {
    const s = scorePrompt(prompt, key);
    if (s > bestScore) {
      bestScore = s;
      best = key;
    }
  }
  return { key: best, stack: BUILDERS[best](), matched: bestScore > 0 };
}
