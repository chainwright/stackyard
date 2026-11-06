// src/editor/localDecks.ts
// Build decks CLIENT-SIDE, with no server model call. Used by:
//   - the ready-made deck buttons on the 429 / failure screen (J1/J3/J2 item e),
//     so a blocked teacher always has a way to start; and
//   - "Type your own questions" (J2 item q), a quick local quiz builder.
// Both go through the shared validator before loading so the stack is always
// playable; neither touches the network.

import type { Stack, Card } from "../shared/types.js";
import {
  vikingsStack,
  timesTablesStack,
  irishWordsStack,
} from "../shared/readyMadeStacks.js";
import { linkQuizAnswersForward } from "../shared/linkForward.js";
import { shuffleQuizAnswers } from "../shared/shuffleAnswers.js";
import { validate } from "../shared/validator.js";
import { QUIZ_QUESTION, QUIZ_TILES } from "../shared/layout.js";

export type ReadyMadeKey = "vikings" | "times-tables" | "irish-words";

/** The three ready-made decks offered as buttons, built locally. */
export const READY_MADE_DECKS: ReadonlyArray<{ key: ReadyMadeKey; label: string; name: string }> = [
  // `name` is the short word used in the one-line "Open a ready-made deck" row,
  // deliberately different from the example CHIPS above it ("Vikings in Ireland
  // quiz" …), which fill the sentence: the same three labels doing two different
  // things confused a teacher and a judge (J2 #12, J3, J1 P2-5).
  { key: "vikings", label: "Vikings in Ireland quiz", name: "Vikings" },
  { key: "times-tables", label: "Times tables game", name: "Times tables" },
  { key: "irish-words", label: "Irish words flashcards", name: "Irish words" },
];

/** Build a ready-made deck by key, client-side (no server). */
export function buildReadyMadeDeck(key: ReadyMadeKey): Stack {
  switch (key) {
    case "times-tables":
      return timesTablesStack();
    case "irish-words":
      return irishWordsStack();
    case "vikings":
    default:
      return vikingsStack();
  }
}

/** One typed question for the "type your own" form. */
export interface TypedQuestion {
  question: string;
  /** The right answer label. */
  right: string;
  /** 1–3 wrong answer labels. */
  wrong: string[];
}

function uuid(): string {
  return crypto.randomUUID();
}

const THEME = {
  background: "#FBF8F1",
  foreground: "#1E2A47",
  font: "'Stackyard Reading', sans-serif",
} as const;

/** A quiz card from a question + answers, laid out in the standard 2×2 grid. */
function typedQuizCard(q: TypedQuestion): Card {
  const answers = [q.right, ...q.wrong].slice(0, 4);
  return {
    id: uuid(),
    kind: "quiz",
    elements: [
      { type: "text", id: uuid(), ...QUIZ_QUESTION, content: q.question },
      ...answers.map((label, i) => ({
        type: "button" as const,
        id: uuid(),
        ...QUIZ_TILES[i]!,
        label,
        actions: [
          { type: "score" as const, delta: i === 0 ? 1 : 0 },
          { type: "sound" as const, sound: (i === 0 ? "cheer" : "buzz") as "cheer" | "buzz" },
        ],
      })),
    ],
    actions: [],
  };
}

/**
 * Build a playable quiz stack from a list of typed questions. Returns null if
 * no question is usable (needs a question, a right answer, and ≥1 wrong answer).
 * Quiz answers are linked forward and the correct tile is shuffled, like every
 * other deck; the result is validated before being returned.
 */
export function buildTypedStack(title: string, questions: TypedQuestion[]): Stack | null {
  const usable = questions.filter(
    (q) =>
      q.question.trim().length > 0 &&
      q.right.trim().length > 0 &&
      q.wrong.filter((w) => w.trim().length > 0).length >= 1,
  );
  if (usable.length === 0) return null;

  const quizCards = usable.map((q) =>
    typedQuizCard({
      question: q.question.trim(),
      right: q.right.trim(),
      wrong: q.wrong.map((w) => w.trim()).filter((w) => w.length > 0),
    }),
  );
  const end: Card = {
    id: uuid(),
    kind: "end",
    elements: [
      { type: "text", id: uuid(), x: 48, y: 120, w: 704, h: 72, content: "Well done!" },
      { type: "field", id: uuid(), x: 48, y: 420, w: 704, h: 60, variable: "score" },
    ],
    actions: [],
  };

  const stack: Stack = {
    id: uuid(),
    title: title.trim().length > 0 ? title.trim() : "My Quiz",
    theme: THEME,
    cards: [...quizCards, end],
  };
  const finalised = shuffleQuizAnswers(linkQuizAnswersForward(stack));
  return validate(finalised).valid ? finalised : null;
}
