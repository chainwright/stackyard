// tests/timing-endcard.test.ts
// jsdom tests for:
//   (a) hold-before-goto timing: correct=900ms, wrong=600ms
//   (b) end-card rendering: heading, Score N of M, stamp row

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderCard } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import type { Card, Stack, Action } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Test helpers

const IDS = {
  stack:  "10000000-0000-4000-8000-000000000001",
  quiz:   "20000000-0000-4000-8000-000000000002",
  end:    "30000000-0000-4000-8000-000000000003",
  quiz2:  "40000000-0000-4000-8000-000000000004",
} as const;

function makeStack(cards: Card[]): Stack {
  return {
    id: IDS.stack,
    title: "Test Stack",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards,
  };
}

function makeQuizCard(id: string, nextId: string): Card {
  const correct: Action[] = [
    { type: "score", delta: 1 },
    { type: "goto", cardId: nextId },
  ];
  const wrong: Action[] = [{ type: "goto", cardId: nextId }];
  return {
    id,
    kind: "quiz",
    elements: [
      { type: "text",   id: "t1", x: 40, y: 60, w: 720, h: 80,  content: "What is 2+2?" },
      { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Four",  actions: correct },
      { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Five", actions: wrong },
    ],
    actions: [],
  };
}

function makeEndCard(id: string): Card {
  return {
    id,
    kind: "end",
    elements: [],
    actions: [],
  };
}

// ---------------------------------------------------------------------------
// (a) Hold-before-goto timing

describe("hold-before-goto timing", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.removeChild(root);
  });

  it("correct tile: navigate NOT called immediately after click", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const correctTile = root.querySelector<HTMLButtonElement>(".sy-tile");
    expect(correctTile).not.toBeNull();
    correctTile!.click();

    // No navigation yet — still within the 900 ms hold.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("correct tile: navigate called after 900 ms", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const correctTile = root.querySelector<HTMLButtonElement>(".sy-tile");
    correctTile!.click();

    vi.advanceTimersByTime(900);

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(IDS.end, false);
  });

  it("correct tile: navigate NOT called before 899 ms", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const correctTile = root.querySelector<HTMLButtonElement>(".sy-tile");
    correctTile!.click();

    vi.advanceTimersByTime(899);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("wrong tile: navigate NOT called immediately after click", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    // Second tile is the wrong answer.
    const tiles = root.querySelectorAll<HTMLButtonElement>(".sy-tile");
    const wrongTile = tiles[1]!;
    wrongTile.click();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("wrong tile: navigate called after 600 ms", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const tiles = root.querySelectorAll<HTMLButtonElement>(".sy-tile");
    const wrongTile = tiles[1]!;
    wrongTile.click();

    vi.advanceTimersByTime(600);

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(IDS.end, false);
  });

  it("wrong tile: navigate NOT called before 599 ms", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const tiles = root.querySelectorAll<HTMLButtonElement>(".sy-tile");
    const wrongTile = tiles[1]!;
    wrongTile.click();

    vi.advanceTimersByTime(599);
    expect(navigate).not.toHaveBeenCalled();
  });

  it("correct tile: stamp element is present in DOM immediately after click", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const correctTile = root.querySelector<HTMLButtonElement>(".sy-tile");
    correctTile!.click();

    // Stamp should be visible right away (before goto fires).
    const stamp = root.querySelector(".sy-stamp");
    expect(stamp).not.toBeNull();
    expect(stamp!.textContent).toBe("CORRECT ✓");
  });

  it("correct tile: score is incremented before the hold fires", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, navigate);

    const correctTile = root.querySelector<HTMLButtonElement>(".sy-tile");
    correctTile!.click();

    // Score should already be 1, even though navigate hasn't fired yet.
    expect(state.variables["score"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (b) End-card rendering

describe("end-card rendering (TASK-27l: no \"Score 0 of 0\", neutral heading, announcement)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.removeChild(root);
  });

  it("renders 'Well done!' heading when end card has no text element", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const end  = makeEndCard(IDS.end);
    const stack = makeStack([quiz, end]);
    const state = createRuntime(stack);
    state.variables["score"] = 1;

    renderCard(end, root, state, vi.fn());

    const h1 = root.querySelector("h1.sy-end-heading");
    expect(h1).not.toBeNull();
    expect(h1!.textContent).toBe("Well done!");
  });

  it("renders the end card's own text as the heading", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const end: Card = {
      id: IDS.end,
      kind: "end",
      elements: [
        { type: "text", id: "tx1", x: 0, y: 0, w: 800, h: 80, content: "Brilliant work!" },
      ],
      actions: [],
    };
    const stack = makeStack([quiz, end]);
    const state = createRuntime(stack);
    state.variables["score"] = 1; // a teacher's own heading is kept when there IS a score

    renderCard(end, root, state, vi.fn());

    const h1 = root.querySelector("h1.sy-end-heading");
    expect(h1!.textContent).toBe("Brilliant work!");
  });

  it("renders 'Score N of M' where M is the number of quiz cards", () => {
    const quiz1 = makeQuizCard(IDS.quiz, IDS.quiz2);
    const quiz2 = makeQuizCard(IDS.quiz2, IDS.end);
    const end   = makeEndCard(IDS.end);
    const stack = makeStack([quiz1, quiz2, end]);
    const state = createRuntime(stack);
    state.variables["score"] = 2;

    renderCard(end, root, state, vi.fn());

    const scoreLine = root.querySelector("[data-testid='end-score']");
    expect(scoreLine).not.toBeNull();
    expect(scoreLine!.textContent).toBe("Score 2 of 2");
  });

  it("renders 'Score 0 of M' when no correct answers", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const end  = makeEndCard(IDS.end);
    const stack = makeStack([quiz, end]);
    const state = createRuntime(stack);
    // score stays 0

    renderCard(end, root, state, vi.fn());

    const scoreLine = root.querySelector("[data-testid='end-score']");
    expect(scoreLine!.textContent).toBe("Score 0 of 1");
  });

  it("stamp collection: one slot per question, the earned ones stamped (score 1 of 1)", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const end  = makeEndCard(IDS.end);
    const stack = makeStack([quiz, end]);
    const state = createRuntime(stack);
    state.variables["score"] = 1;

    renderCard(end, root, state, vi.fn());

    // One quiz → one slot, earned.
    expect(root.querySelectorAll(".sy-end-slot").length).toBe(1);
    expect(root.querySelectorAll(".sy-end-slot-earned").length).toBe(1);
    expect(root.querySelectorAll(".sy-end-slot-empty").length).toBe(0);
  });

  it("stamp collection: two questions, one earned and one empty (score 1 of 2)", () => {
    const quiz1 = makeQuizCard(IDS.quiz, IDS.quiz2);
    const quiz2 = makeQuizCard(IDS.quiz2, IDS.end);
    const end   = makeEndCard(IDS.end);
    const stack = makeStack([quiz1, quiz2, end]);
    const state = createRuntime(stack);
    state.variables["score"] = 1;

    renderCard(end, root, state, vi.fn());

    // Two quizzes → two slots: one earned, one empty.
    expect(root.querySelectorAll(".sy-end-slot").length).toBe(2);
    expect(root.querySelectorAll(".sy-end-slot-earned").length).toBe(1);
    expect(root.querySelectorAll(".sy-end-slot-empty").length).toBe(1);
  });

  it("stamp collection: all slots empty when score is 0", () => {
    const quiz1 = makeQuizCard(IDS.quiz, IDS.quiz2);
    const quiz2 = makeQuizCard(IDS.quiz2, IDS.end);
    const end  = makeEndCard(IDS.end);
    const stack = makeStack([quiz1, quiz2, end]);
    const state = createRuntime(stack);
    // score = 0 (default)

    renderCard(end, root, state, vi.fn());

    expect(root.querySelectorAll(".sy-end-slot").length).toBe(2);
    expect(root.querySelectorAll(".sy-end-slot-earned").length).toBe(0);
    expect(root.querySelectorAll(".sy-end-slot-empty").length).toBe(2);
  });

  it("end card still renders ring holes", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const end  = makeEndCard(IDS.end);
    const stack = makeStack([quiz, end]);
    const state = createRuntime(stack);

    renderCard(end, root, state, vi.fn());

    const holes = root.querySelectorAll(".sy-ring-hole");
    expect(holes.length).toBe(2);
  });

  it("end card still renders three offset card edges", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const end  = makeEndCard(IDS.end);
    const stack = makeStack([quiz, end]);
    const state = createRuntime(stack);

    renderCard(end, root, state, vi.fn());

    expect(root.querySelector(".sy-card-edge-1")).not.toBeNull();
    expect(root.querySelector(".sy-card-edge-2")).not.toBeNull();
    expect(root.querySelector(".sy-card-edge-3")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// (c) Typography — quiz text elements use sy-question class

describe("typography tokens (TASK-27i: story body 30px and centred)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.removeChild(root);
  });

  it("quiz card text elements use .sy-question class (44px weight 800)", () => {
    const quiz = makeQuizCard(IDS.quiz, IDS.end);
    const stack = makeStack([quiz, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(quiz, root, state, vi.fn());

    const questionEl = root.querySelector("p.sy-question");
    expect(questionEl).not.toBeNull();
    expect(questionEl!.textContent).toBe("What is 2+2?");
  });

  it("story card body uses the .sy-story class (bigger, centred)", () => {
    const story: Card = {
      id: IDS.quiz,
      kind: "story",
      elements: [
        { type: "text", id: "tx", x: 40, y: 60, w: 720, h: 80, content: "Once upon a time" },
      ],
      actions: [],
    };
    const stack = makeStack([story, makeEndCard(IDS.end)]);
    const state = createRuntime(stack);

    renderCard(story, root, state, vi.fn());

    // The story body is p.sy-story (30px, centred — TASK-27i); other text stays .sy-text.
    const bodyEl = root.querySelector("p.sy-story");
    expect(bodyEl).not.toBeNull();
    expect(bodyEl!.textContent).toBe("Once upon a time");
  });
});
