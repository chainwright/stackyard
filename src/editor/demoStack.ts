// src/editor/demoStack.ts
// A demo Vikings-in-Ireland stack used by the screenshot harness (so the built
// screens match the docs/design/maker mockups) and injected into the running
// app for review. Every quiz answer advances to the NEXT card, so playing it
// walks the whole deck in order and the end card shows the real score — it is
// not the "every answer jumps to the end" bug the built-app review hit.

import type { Stack } from "../shared/types.js";
import { linkQuizAnswersForward } from "../shared/linkForward.js";

let n = 0;
function uuid(): string {
  // Deterministic valid v4 UUIDs for the demo.
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

export function demoStack(): Stack {
  n = 0;
  const endId = uuid();

  // A quiz card. Answers carry score + sound; the goto is filled in afterwards
  // by linkQuizAnswersForward so each answer advances to the next card.
  const quiz = (
    question: string,
    answers: [string, string, string, string],
    correctIndex: number,
  ) => {
    return {
      id: uuid(),
      kind: "quiz" as const,
      elements: [
        // The "Card N of M" meta line is DERIVED chrome drawn by the renderer
        // from the deck position — not a stored element. Only the question text
        // lives in the stack.
        { type: "text" as const, id: uuid(), x: 48, y: 104, w: 704, h: 128, content: question },
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
            // goto filled in by linkQuizAnswersForward (next card in the deck).
          ],
        })),
      ],
      actions: [],
    };
  };

  // A flash card. It carries a "Next card" button so the deck is playable in
  // order (the goto is set once the following card's id is known).
  const flash = (term: string, back: string, gotoId: string) => ({
    id: uuid(),
    kind: "flash" as const,
    elements: [
      { type: "text" as const, id: uuid(), x: 48, y: 264, w: 704, h: 72, content: term },
      { type: "text" as const, id: uuid(), x: 48, y: 360, w: 704, h: 120, content: back },
      {
        type: "button" as const,
        id: uuid(),
        x: 408, y: 496, w: 344, h: 72,
        label: "Next Card",
        actions: [{ type: "goto" as const, cardId: gotoId }],
      },
    ],
    actions: [],
  });

  const story = (body: string, b1: string, g1: string, b2: string, g2: string) => ({
    id: uuid(),
    kind: "story" as const,
    elements: [
      { type: "text" as const, id: uuid(), x: 48, y: 104, w: 704, h: 224, content: body },
      {
        type: "button" as const,
        id: uuid(),
        x: 48, y: 360, w: 344, h: 80,
        label: b1,
        actions: [{ type: "goto" as const, cardId: g1 }],
      },
      {
        type: "button" as const,
        id: uuid(),
        x: 408, y: 360, w: 344, h: 80,
        label: b2,
        actions: [{ type: "goto" as const, cardId: g2 }],
      },
    ],
    actions: [],
  });

  const end = {
    id: endId,
    kind: "end" as const,
    elements: [
      { type: "text" as const, id: uuid(), x: 48, y: 120, w: 704, h: 72, content: "Well done!" },
      { type: "field" as const, id: uuid(), x: 48, y: 420, w: 704, h: 60, variable: "score" },
    ],
    actions: [],
  };

  // Build the cards. We need the later cards' ids to wire the flash "Next"
  // buttons and the story branches, so build from the back where needed.
  const c9 = flash("Thingmote", "A raised mound where the Norse of Dublin held their assembly.", endId);
  const c8 = quiz("Which king fought back?", ["Brian Boru", "Niall", "Conor", "Diarmuid"], 0);
  const c7 = quiz("What did they trade?", ["Silver", "Cars", "Phones", "Plastic"], 0);
  const c6 = quiz("Who led the first raid?", ["A chieftain", "A monk", "A king", "A farmer"], 0);
  const c5 = story(
    "The longship lands on the River Liffey at dawn. The crew can raid the monastery for its silver, or they can stay and build a longphort by the water. What should they do?",
    "Raid the monastery", c6.id,
    "Build a longphort", c6.id,
  );
  const c4 = flash(
    "Longphort",
    "A longphort was a fortified ship harbour the Vikings built on the coast. They used it to raid and to trade. Dublin began as a longphort in 841.",
    c5.id,
  );
  const c3 = quiz("Where did the Vikings build a town in 841?", ["Dublin", "Cork", "Galway", "Sligo"], 0);
  const c2 = quiz("What is a longship?", ["A fast boat", "A house", "A sword", "A town"], 0);
  const c1 = quiz("Who sailed to Ireland first?", ["Vikings", "Romans", "Greeks", "Egyptians"], 0);

  const stack: Stack = {
    id: uuid(),
    title: "Vikings in Ireland",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "'Stackyard Reading', sans-serif" },
    cards: [c1, c2, c3, c4, c5, c6, c7, c8, c9, end],
  };

  // Quiz answers advance to the next card in deck order (the last quiz, c8,
  // targets c9; the deck then flows c9 → end). Non-quiz navigation is untouched.
  return linkQuizAnswersForward(stack);
}
