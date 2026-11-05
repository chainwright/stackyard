// tests/play-through.test.ts
// Playing a stack walks every card in order and the end card shows the real
// score (P0 #1 in the built-app review: answering must NOT jump to the end).
//
// Uses the shared mountPlayer — the exact code the exported file runs.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mountPlayer } from "../src/player/mount.js";
import { linkQuizAnswersForward } from "../src/shared/linkForward.js";
import { validate } from "../src/shared/validator.js";
import type { Stack, Card } from "../src/shared/types.js";

// jsdom has no ResizeObserver; the scaler needs one.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

/** An N-question quiz stack, answers linked forward to the next card. */
function linearQuizStack(nQuiz: number): Stack {
  const endId = "aaaaaaaa-0000-4000-8000-0000000000ee";
  const cards: Card[] = [];
  for (let i = 0; i < nQuiz; i++) {
    const p = String(i).padStart(12, "0");
    cards.push({
      id: `bbbbbbbb-0000-4000-8000-${p}`,
      kind: "quiz",
      elements: [
        { type: "text", id: `cccccccc-0000-4000-8000-${p}`, x: 48, y: 104, w: 704, h: 128, content: `Question number ${i}` },
        { type: "button", id: `dddddddd-0000-4000-8000-${p}`, x: 48, y: 296, w: 344, h: 96, label: `Right ${i}`, actions: [{ type: "score", delta: 1 }, { type: "sound", sound: "cheer" }, { type: "goto", cardId: endId }] },
        { type: "button", id: `eeeeeeee-0000-4000-8000-${p}`, x: 408, y: 296, w: 344, h: 96, label: `Wrong ${i}`, actions: [{ type: "score", delta: 0 }, { type: "sound", sound: "buzz" }, { type: "goto", cardId: endId }] },
      ],
      actions: [],
    });
  }
  cards.push({ id: endId, kind: "end", elements: [{ type: "field", id: "ffffffff-0000-4000-8000-000000000001", x: 48, y: 420, w: 704, h: 60, variable: "score" }], actions: [] });
  const stack: Stack = { id: "11111111-0000-4000-8000-000000000001", title: "Flow", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" }, cards };
  return linkQuizAnswersForward(stack);
}

describe("play-through: every card in order, end shows the real score", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    root.remove();
  });

  it("answering the right tile on each quiz advances to the next card and ends with the full score", () => {
    const N = 5;
    const stack = linearQuizStack(N);
    expect(validate(stack).valid).toBe(true);

    mountPlayer(stack, root);

    for (let i = 0; i < N; i++) {
      // The current card shows its own question (card i), in order.
      expect(root.querySelector(".sy-question")?.textContent).toBe(`Question number ${i}`);
      // The meta counts every card in the deck (N quizzes + 1 end = N + 1).
      expect(root.querySelector(".sy-meta-chrome .sy-meta")?.textContent).toBe(`Card ${i + 1} of ${N + 1}`);

      // Click the right answer (first tile) and let the 900ms correct-hold run.
      const right = Array.from(root.querySelectorAll<HTMLButtonElement>(".sy-tile")).find((b) => b.textContent?.includes(`Right ${i}`))!;
      expect(right).toBeDefined();
      right.click();
      // 900ms correct-hold, then the 240ms flip before the next card renders.
      vi.advanceTimersByTime(900 + 240);
    }

    // We are on the end card, and it shows the real score (every answer correct).
    const endScore = root.querySelector('[data-testid="end-score"]');
    expect(endScore?.textContent).toBe(`Score ${N} of ${N}`);
  });

  it("a wrong answer still advances to the next card (score stays behind)", () => {
    const N = 3;
    const stack = linearQuizStack(N);
    mountPlayer(stack, root);

    // Answer the first two wrong, the last right.
    for (let i = 0; i < N; i++) {
      expect(root.querySelector(".sy-question")?.textContent).toBe(`Question number ${i}`);
      const want = i === N - 1 ? `Right ${i}` : `Wrong ${i}`;
      const tile = Array.from(root.querySelectorAll<HTMLButtonElement>(".sy-tile")).find((b) => b.textContent?.includes(want))!;
      tile.click();
      // Wrong hold 600ms / right hold 900ms, then the 240ms flip. 900+240 covers both.
      vi.advanceTimersByTime(900 + 240);
    }

    const endScore = root.querySelector('[data-testid="end-score"]');
    expect(endScore?.textContent).toBe(`Score 1 of ${N}`);
  });
});
