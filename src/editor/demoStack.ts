// src/editor/demoStack.ts
// A demo Vikings-in-Ireland stack used only by the screenshot harness so the
// built screens match the docs/design/maker mockups. Not shipped in the app.

import type { Stack } from "../shared/types.js";

let n = 0;
function uuid(): string {
  // Deterministic valid v4 UUIDs for the demo.
  n += 1;
  const hex = n.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex}`;
}

export function demoStack(): Stack {
  const endId = uuid();
  const next = (fromQuiz: string) => fromQuiz; // placeholder
  void next;

  const quiz = (
    meta: string,
    question: string,
    answers: [string, string, string, string],
    correctIndex: number,
    goto: string,
  ) => {
    return {
      id: uuid(),
      kind: "quiz" as const,
      elements: [
        { type: "text" as const, id: uuid(), x: 48, y: 48, w: 400, h: 32, content: meta },
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
            { type: "goto" as const, cardId: goto },
          ],
        })),
      ],
      actions: [],
    };
  };

  const flash = (term: string, back: string) => ({
    id: uuid(),
    kind: "flash" as const,
    elements: [
      { type: "text" as const, id: uuid(), x: 48, y: 264, w: 704, h: 72, content: term },
      { type: "text" as const, id: uuid(), x: 48, y: 360, w: 704, h: 160, content: back },
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

  const c1 = quiz("Card 1 of 10", "Who sailed to Ireland first?", ["Vikings", "Romans", "Greeks", "Egyptians"], 0, endId);
  const c2 = quiz("Card 2 of 10", "What is a longship?", ["A fast boat", "A house", "A sword", "A town"], 0, endId);
  const c3 = quiz("Card 3 of 10", "Where did the Vikings build a town in 841?", ["Dublin", "Cork", "Galway", "Sligo"], 0, endId);
  const c4 = flash("Longphort", "A longphort was a fortified ship harbour the Vikings built on the coast. They used it to raid and to trade. Dublin began as a longphort in 841.");
  const c6 = quiz("Card 6 of 10", "Who led the first raid?", ["A chieftain", "A monk", "A king", "A farmer"], 0, endId);
  const c7 = quiz("Card 7 of 10", "What did they trade?", ["Silver", "Cars", "Phones", "Plastic"], 0, endId);
  const c5 = story(
    "The longship lands on the River Liffey at dawn. The crew can raid the monastery for its silver, or they can stay and build a longphort by the water. What should they do?",
    "Raid the monastery", c6.id,
    "Build a longphort", c7.id,
  );
  const c8 = quiz("Card 8 of 10", "Which king fought back?", ["Brian Boru", "Niall", "Conor", "Diarmuid"], 0, endId);
  const c9 = flash("Thingmote", "A raised mound where the Norse of Dublin held their assembly.");

  return {
    id: uuid(),
    title: "Vikings in Ireland",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "'Stackyard Reading', sans-serif" },
    cards: [c1, c2, c3, c4, c5, c6, c7, c8, c9, end],
  };
}
