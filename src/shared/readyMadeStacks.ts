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

import type { Stack, Card } from "./types.js";
import { linkQuizAnswersForward } from "./linkForward.js";

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

  const c1 = quizCard(uuid, "Who sailed to Ireland first?", ["Vikings", "Romans", "Greeks", "Egyptians"], 0);
  const c2 = quizCard(uuid, "What is a longship?", ["A fast boat", "A house", "A sword", "A town"], 0);
  const c3 = quizCard(uuid, "Where did the Vikings build a town in 841?", ["Dublin", "Cork", "Galway", "Sligo"], 0);
  const c6 = quizCard(uuid, "Who led the first raid?", ["A chieftain", "A monk", "A king", "A farmer"], 0);
  const c7 = quizCard(uuid, "What did the Vikings trade in Dublin?", ["Silver", "Cars", "Phones", "Plastic"], 0);
  const c8 = quizCard(uuid, "Which Irish king fought the Vikings at Clontarf?", ["Brian Boru", "Niall", "Conor", "Diarmuid"], 0);
  // Flash + story reference later ids; build them after the ids exist.
  const c9 = flashCard(uuid, "Thingmote", "A raised mound where the Norse of Dublin held their meetings.", endId);
  const c5 = {
    id: uuid(),
    kind: "story" as const,
    elements: [
      { type: "text" as const, id: uuid(), x: 48, y: 104, w: 704, h: 224, content: "The longship lands on the River Liffey at dawn. The crew can raid the monastery for its silver, or stay and build a longphort by the water. What should they do?" },
      { type: "button" as const, id: uuid(), x: 48, y: 360, w: 344, h: 80, label: "Raid the monastery", actions: [{ type: "goto" as const, cardId: c6.id }] },
      { type: "button" as const, id: uuid(), x: 408, y: 360, w: 344, h: 80, label: "Build a longphort", actions: [{ type: "goto" as const, cardId: c6.id }] },
    ],
    actions: [],
  };
  const c4 = flashCard(uuid, "Longphort", "A longphort was a fortified ship harbour the Vikings built on the coast. Dublin began as a longphort in 841.", c5.id);
  const end = endCard(uuid, endId);

  const stack: Stack = {
    id: uuid(),
    title: "Vikings in Ireland",
    theme: THEME,
    cards: [c1, c2, c3, c4, c5, c6, c7, c8, c9, end],
  };
  return linkQuizAnswersForward(stack);
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
  return linkQuizAnswersForward(stack);
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
  return linkQuizAnswersForward(stack);
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
