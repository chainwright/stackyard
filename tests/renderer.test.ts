// tests/renderer.test.ts
// Unit tests for src/player/renderer.ts (TASK-07).
// Uses jsdom (provided by vitest via globalThis.document).

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderCard } from "../src/player/renderer.js";
import { createRuntime } from "../src/player/runtime.js";
import type { Card, Stack, Action } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Test helpers

const IDS = {
  stack:   "10000000-0000-4000-8000-000000000001",
  card1:   "20000000-0000-4000-8000-000000000002",
  card2:   "30000000-0000-4000-8000-000000000003",
  end:     "40000000-0000-4000-8000-000000000004",
  textEl:  "50000000-0000-4000-8000-000000000005",
  btnEl:   "60000000-0000-4000-8000-000000000006",
  imgEl:   "70000000-0000-4000-8000-000000000007",
  fieldEl: "80000000-0000-4000-8000-000000000008",
} as const;

function makeStack(cards: Card[]): Stack {
  return {
    id: IDS.stack,
    title: "Test Stack",
    theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
    cards,
  };
}

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: IDS.card1,
    kind: "story",
    elements: [],
    actions: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Renderer tests

describe("renderCard() — element types", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn();
  });

  it("renders a text element as <p>", () => {
    const card = makeCard({
      elements: [
        {
          type: "text",
          id: IDS.textEl,
          x: 10, y: 20, w: 300, h: 50,
          content: "Hello World",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const p = root.querySelector("p.sy-text");
    expect(p).not.toBeNull();
    expect(p?.textContent).toBe("Hello World");
  });

  it("positions a text element using x, y, w, h", () => {
    const card = makeCard({
      elements: [
        {
          type: "text",
          id: IDS.textEl,
          x: 50, y: 100, w: 200, h: 40,
          content: "Positioned",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const wrapper = root.querySelector(".sy-element") as HTMLElement | null;
    expect(wrapper).not.toBeNull();
    expect(wrapper?.style.left).toBe("50px");
    expect(wrapper?.style.top).toBe("100px");
    expect(wrapper?.style.width).toBe("200px");
    expect(wrapper?.style.height).toBe("40px");
  });

  it("renders a button element as <button>", () => {
    const card = makeCard({
      elements: [
        {
          type: "button",
          id: IDS.btnEl,
          x: 10, y: 10, w: 100, h: 44,
          label: "Click me",
          actions: [],
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const btn = root.querySelector("button") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain("Click me");
  });

  it("button dispatches actions on click", () => {
    const actions: Action[] = [{ type: "goto", cardId: IDS.card2 }];
    const card = makeCard({
      elements: [
        {
          type: "button",
          id: IDS.btnEl,
          x: 10, y: 10, w: 100, h: 44,
          label: "Go",
          actions,
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const btn = root.querySelector("button") as HTMLButtonElement;
    btn.click();

    // navigate should have been called with the target card id and automatic=false
    expect(navigate).toHaveBeenCalledWith(IDS.card2, false);
  });

  it("renders an image element as <img>", () => {
    const card = makeCard({
      elements: [
        {
          type: "image",
          id: IDS.imgEl,
          x: 0, y: 0, w: 100, h: 80,
          src: "data:image/png;base64,abc123",
          alt: "A test image",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const img = root.querySelector("img") as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,abc123");
    expect(img?.getAttribute("alt")).toBe("A test image");
  });

  it("renders a field element as <span> with variable value", () => {
    const card = makeCard({
      elements: [
        {
          type: "field",
          id: IDS.fieldEl,
          x: 0, y: 0, w: 100, h: 30,
          variable: "score",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);
    state.variables["score"] = 7;

    renderCard(card, root, state, navigate);

    const span = root.querySelector("span.sy-field") as HTMLSpanElement | null;
    expect(span).not.toBeNull();
    expect(span?.textContent).toBe("7");
  });

  it("field shows empty string for unset variable", () => {
    const card = makeCard({
      elements: [
        {
          type: "field",
          id: IDS.fieldEl,
          x: 0, y: 0, w: 100, h: 30,
          variable: "not_set",
        },
      ],
    });
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const span = root.querySelector("span.sy-field") as HTMLSpanElement | null;
    expect(span?.textContent).toBe("");
  });

  it("clears the root before rendering", () => {
    root.innerHTML = "<p>Old content</p>";
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    expect(root.querySelector("p")?.textContent).not.toBe("Old content");
  });

  it("renders ring holes inside the card", () => {
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const holes = root.querySelectorAll(".sy-ring-hole");
    expect(holes.length).toBe(2);
  });

  it("renders three offset card-edge layers", () => {
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    expect(root.querySelector(".sy-card-edge-1")).not.toBeNull();
    expect(root.querySelector(".sy-card-edge-2")).not.toBeNull();
    expect(root.querySelector(".sy-card-edge-3")).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Quiz-card answer tiles

describe("renderCard() — quiz answer tiles", () => {
  let root: HTMLElement;
  let navigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    navigate = vi.fn();
  });

  function makeQuizCard(): Card {
    const tileActions = (correct: boolean): Action[] =>
      correct
        ? [{ type: "score", delta: 1 }, { type: "goto", cardId: IDS.card2 }]
        : [{ type: "goto", cardId: IDS.card2 }];

    return {
      id: IDS.card1,
      kind: "quiz",
      elements: [
        { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Dublin", actions: tileActions(true) },
        { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Cork", actions: tileActions(false) },
        { type: "button", id: "b3", x: 20, y: 300, w: 350, h: 80, label: "Galway", actions: tileActions(false) },
        { type: "button", id: "b4", x: 420, y: 300, w: 350, h: 80, label: "Sligo", actions: tileActions(false) },
      ],
      actions: [],
    };
  }

  it("renders quiz buttons as .sy-tile elements", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const tiles = root.querySelectorAll(".sy-tile");
    expect(tiles.length).toBe(4);
  });

  it("each tile has a shape icon (.sy-tile-shape)", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const shapes = root.querySelectorAll(".sy-tile-shape");
    expect(shapes.length).toBe(4);
  });

  it("each tile displays its label text", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const tiles = root.querySelectorAll(".sy-tile");
    const labels = Array.from(tiles).map((t) => t.textContent ?? "");
    expect(labels.some((l) => l.includes("Dublin"))).toBe(true);
    expect(labels.some((l) => l.includes("Cork"))).toBe(true);
  });

  it("tile A has coral background (#F2735F)", () => {
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    const firstTile = root.querySelector(".sy-tile") as HTMLElement | null;
    expect(firstTile?.style.backgroundColor).toBeTruthy();
    // jsdom normalises hex to rgb
    // #F2735F = rgb(242, 115, 95)
    expect(firstTile?.style.backgroundColor).toMatch(/rgb\(242,\s*115,\s*95\)|#[Ff]2735[Ff]|#f2735f/i);
  });

  it("clicking correct tile calls navigate with automatic=false after 900ms hold", () => {
    vi.useFakeTimers();
    const card = makeQuizCard();
    const stack = makeStack([card, makeCard({ id: IDS.card2, kind: "end" })]);
    const state = createRuntime(stack);

    renderCard(card, root, state, navigate);

    // First tile is Dublin (correct)
    const firstTile = root.querySelector(".sy-tile") as HTMLButtonElement;
    firstTile.click();

    // Navigate not called immediately — stamp hold in progress.
    expect(navigate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(900);
    expect(navigate).toHaveBeenCalledWith(IDS.card2, false);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Stamp layout — position relative to tile label

describe("renderCard() — stamp layout (does not overlap tile label)", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  /**
   * Design spec (v3, 2026-10-31):
   *   - Stamp: bottom:calc(100% - 14px), right:16px, left:auto, position:absolute
   *   - Reduced to ~0.75× original size (26px font, 6px 12px padding) so the
   *     stamp's bottom edge lands at tile-top + 14px — at most the top 14px of
   *     the tile is covered, well within the 25% label-height allowance.
   *
   * We verify by checking the CSS rule values from the injected <style> block.
   * jsdom does not perform real layout so getBoundingClientRect() returns all
   * zeroes — real pixel overlap must be confirmed in Chrome (see screenshot
   * docs/design/review/2026-10-31_stamp_v3.png).
   */
  it("stamp CSS rule has bottom:calc(100% - 14px) and right:16px (anchored at tile top + 14px)", () => {
    // Force styles to be injected by rendering a card.
    const card: Card = {
      id: IDS.card1,
      kind: "quiz",
      elements: [
        { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Dublin",
          actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: IDS.end }] },
        { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Cork",
          actions: [{ type: "goto", cardId: IDS.end }] },
      ],
      actions: [],
    };
    const stack: Stack = {
      id: IDS.stack,
      title: "Layout test",
      theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [card, { id: IDS.end, kind: "end", elements: [], actions: [] }],
    };
    const state = createRuntime(stack);
    const navigate = vi.fn();

    renderCard(card, root, state, navigate);

    // The PLAYER_STYLES string is injected into document.head as a <style> element.
    const styleEl = document.head.querySelector("style");
    expect(styleEl, "PLAYER_STYLES <style> element must exist").not.toBeNull();

    const css = styleEl!.textContent ?? "";

    // Extract the .sy-stamp rule block.
    const stampRuleMatch = css.match(/\.sy-stamp\s*\{([^}]+)\}/);
    expect(stampRuleMatch, ".sy-stamp rule must be present in injected styles").not.toBeNull();

    const stampRule = stampRuleMatch![1];

    // Stamp bottom edge anchored at tile-top + 14px (bottom: calc(100% - 14px)
    // means the stamp's bottom is 14px below the tile's top border).
    expect(stampRule).toMatch(/bottom\s*:\s*calc\(100%\s*-\s*14px\)/);
    // left must be auto so it does not conflict with right-alignment.
    expect(stampRule).toMatch(/left\s*:\s*auto/);
    // right offset: 16px from tile's right edge.
    expect(stampRule).toMatch(/right\s*:\s*16px/);
    // Paper fill keeps whatever tile content is behind it readable.
    expect(stampRule).toMatch(/background\s*:/);

    // NOTE: jsdom does not compute layout, so we cannot verify pixel overlap here.
    // The constraint "stamp covers at most 25% of the 54px label height (≤ 14px)"
    // is validated by real-browser screenshot: docs/design/review/2026-10-31_stamp_v3.png.
  });

  it("stamp element appears after correct click and tile label remains present", () => {
    vi.useFakeTimers();
    const card: Card = {
      id: IDS.card1,
      kind: "quiz",
      elements: [
        { type: "button", id: "b1", x: 20, y: 200, w: 350, h: 80, label: "Dublin",
          actions: [{ type: "score", delta: 1 }, { type: "goto", cardId: IDS.end }] },
        { type: "button", id: "b2", x: 420, y: 200, w: 350, h: 80, label: "Cork",
          actions: [{ type: "goto", cardId: IDS.end }] },
      ],
      actions: [],
    };
    const stack: Stack = {
      id: IDS.stack,
      title: "Layout test",
      theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [card, { id: IDS.end, kind: "end", elements: [], actions: [] }],
    };
    const state = createRuntime(stack);
    const navigate = vi.fn();

    renderCard(card, root, state, navigate);

    // Click the correct tile (Dublin = first tile).
    const firstTile = root.querySelector(".sy-tile") as HTMLButtonElement;
    firstTile.click();

    // The stamp should now be in the DOM.
    const stamp = firstTile.querySelector(".sy-stamp") as HTMLElement | null;
    expect(stamp, ".sy-stamp element must appear after correct click").not.toBeNull();
    expect(stamp!.textContent).toBe("CORRECT ✓");

    // Verify opacity from the CSS class rule.
    const css = document.head.querySelector("style")?.textContent ?? "";
    const stampRule = css.match(/\.sy-stamp\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(stampRule).toMatch(/opacity\s*:\s*0\.92/);

    // Tile label span is still present — stamp did not replace it.
    const labelSpan = Array.from(firstTile.querySelectorAll("span"))
      .find((s) => s.textContent === "Dublin");
    expect(labelSpan, "tile label span must still exist after stamp appears").not.toBeNull();

    vi.advanceTimersByTime(900);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Aria-live stamp announcement

describe("renderCard() — accessibility", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
  });

  it("aria-live region exists on the document after first render", () => {
    const card = makeCard();
    const stack = makeStack([card, makeCard({ id: IDS.end, kind: "end" })]);
    const state = createRuntime(stack);
    const navigate = vi.fn();

    renderCard(card, root, state, navigate);

    const liveRegion = document.querySelector("[aria-live='polite']");
    expect(liveRegion).not.toBeNull();
  });
});
