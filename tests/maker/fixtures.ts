// tests/maker/fixtures.ts
// Shared hand-built valid-stack fixtures for the Maker unit tests.
// All IDs are valid RFC 4122 v4 UUIDs so every fixture passes validate().

import type { Stack } from "../../src/shared/types.js";

/** A minimal valid stack: one quiz card + one end card. */
export function quizStack(): Stack {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    title: "Vikings Quiz",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "20000000-0000-4000-8000-000000000002",
        kind: "quiz",
        elements: [
          {
            type: "text",
            id: "40000000-0000-4000-8000-000000000004",
            x: 40, y: 40, w: 720, h: 120,
            content: "Where did the Vikings build a town in 841?",
          },
          {
            type: "button",
            id: "50000000-0000-4000-8000-000000000005",
            x: 40, y: 200, w: 340, h: 80,
            label: "Dublin",
            actions: [
              { type: "score", delta: 1 },
              { type: "sound", sound: "cheer" },
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
          {
            type: "button",
            id: "60000000-0000-4000-8000-000000000006",
            x: 420, y: 200, w: 340, h: 80,
            label: "Cork",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
          // A third answer (TASK-32b.1): a healthy quiz has 3 or 4, and the
          // "Before you share" check flags a two-answer one.
          {
            type: "button",
            id: "61000000-0000-4000-8000-000000000061",
            x: 40, y: 300, w: 340, h: 80,
            label: "Galway",
            actions: [
              { type: "score", delta: 0 },
              { type: "sound", sound: "buzz" },
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
        ],
        actions: [],
      },
      endCard(),
    ],
  };
}

/** A valid stack: one story card (with a goto button) + one end card. */
export function storyStack(): Stack {
  return {
    id: "11000000-0000-4000-8000-000000000001",
    title: "A Short Story",
    theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" },
    cards: [
      {
        id: "21000000-0000-4000-8000-000000000002",
        kind: "story",
        elements: [
          {
            type: "text",
            id: "41000000-0000-4000-8000-000000000004",
            x: 40, y: 40, w: 720, h: 120,
            content: "Once upon a time...",
          },
          {
            type: "button",
            id: "51000000-0000-4000-8000-000000000005",
            x: 300, y: 460, w: 200, h: 60,
            label: "Next",
            actions: [
              { type: "goto", cardId: "30000000-0000-4000-8000-000000000003" },
            ],
          },
        ],
        actions: [],
      },
      endCard(),
    ],
  };
}

/** The shared end card used by the fixtures above. */
export function endCard() {
  return {
    id: "30000000-0000-4000-8000-000000000003",
    kind: "end" as const,
    elements: [
      {
        type: "field" as const,
        id: "70000000-0000-4000-8000-000000000007",
        x: 40, y: 40, w: 720, h: 80,
        variable: "score",
      },
    ],
    actions: [],
  };
}
