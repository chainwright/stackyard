// tests/maker/play-overlay.test.ts
// TASK-17 / TASK-R3: "Try It" — in-editor play via the shared mountPlayer.
// The editor shell stays; the canvas area plays the live card, starting at the
// card being edited, and flips on every card change. "Back to Editing" returns.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, h } from "preact";
import { App } from "../../src/editor/app.js";
import { STORAGE_KEY } from "../../src/editor/persistence.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import { quizStack } from "./fixtures.js";

// jsdom has no ResizeObserver / MutationObserver guards needed by the scaler.
class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] =
  FakeResizeObserver;

let mounted: HTMLElement | null = null;

function mountApp(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(h(App, {}), root);
  mounted = root;
  return root;
}

async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

/** Poll until `pred()` is truthy or the attempt budget runs out. */
async function waitFor(pred: () => boolean, tries = 120): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("TASK-R3: Try It (in-editor play)", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  it("plays the selected card inside the editor shell, and flips to 'Trying It'", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizStack()));
    const root = mountApp();
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    // The editor shell stays (top bar, card list, toolbar), and the canvas
    // becomes the Try It area with the live player card.
    const area = root.querySelector(".tryit-area")!;
    expect(area).not.toBeNull();
    expect(root.querySelector(".toolbar")).not.toBeNull();
    expect(root.querySelector(".cardlist")).not.toBeNull();
    // Try It is now pressed ("Trying It").
    const tryBtn = root.querySelector<HTMLButtonElement>(".tryit")!;
    expect(tryBtn.getAttribute("aria-pressed")).toBe("true");
    expect(tryBtn.textContent).toContain("Trying It");
    // The live card is rendered (the first/selected card's question).
    await waitFor(() => (area.textContent ?? "").includes("Where did the Vikings"));
    expect(area.textContent).toContain("Where did the Vikings build a town in 841?");
    // There is a Back to Editing pill.
    expect(root.querySelector(".try-pill")).not.toBeNull();
  });

  it("starts play at the card being edited, not card 1", async () => {
    // A two-content-card stack; select the SECOND card, then Try It.
    const stack = quizStack();
    // Add a second quiz card before the end so there is a non-first card.
    const second = JSON.parse(JSON.stringify(stack.cards[0])) as typeof stack.cards[0];
    second.id = "22000000-0000-4000-8000-0000000000aa";
    second.elements = second.elements.map((e, i) => ({ ...e, id: `2200000${i}-0000-4000-8000-0000000000bb` }));
    const textEl = second.elements.find((e) => e.type === "text");
    if (textEl && textEl.type === "text") textEl.content = "What is a longship?";
    stack.cards = [stack.cards[0]!, second, stack.cards[1]!];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stack));

    const root = mountApp();
    // Select the second card via the card list.
    const entries = root.querySelectorAll<HTMLButtonElement>(".card-entry");
    entries[1]!.click();
    await flush();
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    const area = root.querySelector(".tryit-area")!;
    await waitFor(() => (area.textContent ?? "").includes("What is a longship?"));
    // Play started on the selected (second) card, not card 1.
    expect(area.textContent).toContain("What is a longship?");
    expect(area.textContent).not.toContain("Where did the Vikings build a town in 841?");
  });

  it("disables the toolbar (visually and for keyboard) while Trying the card", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizStack()));
    const root = mountApp();

    // Before Try It, the toolbar tools are live (Add Text is enabled).
    const addTextBefore = Array.from(root.querySelectorAll<HTMLButtonElement>(".tool-card")).find(
      (b) => b.textContent?.includes("Add Text"),
    )!;
    expect(addTextBefore.disabled).toBe(false);

    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    // While trying, the toolbar is dimmed and every control is disabled (so it
    // also leaves the tab order for keyboard).
    const toolbar = root.querySelector(".toolbar")!;
    expect(toolbar.classList.contains("toolbar-disabled")).toBe(true);
    const controls = toolbar.querySelectorAll<HTMLButtonElement>("button");
    expect(controls.length).toBeGreaterThan(0);
    controls.forEach((b) => expect(b.disabled).toBe(true));
  });

  it("Back to Editing returns to the editor with an unchanged stack", async () => {
    const stack = quizStack();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
    const before = JSON.stringify(stack);
    const root = mountApp();

    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();
    const area = root.querySelector(".tryit-area")!;
    await waitFor(() => (area.textContent ?? "").includes("Where did the Vikings"));

    root.querySelector<HTMLButtonElement>(".try-pill")!.click();
    // Back to Editing flips the card out (240ms) before switching to the editor.
    await waitFor(() => root.querySelector(".tryit-area") === null, 200);
    await flush();

    expect(root.querySelector(".tryit-area")).toBeNull();
    expect(root.querySelector(".workspace")).not.toBeNull();
    // The editing canvas and inspector are back.
    expect(root.querySelector(".canvas-scale")).not.toBeNull();
    expect(root.querySelector(".inspector")).not.toBeNull();
    // Playing wrote nothing back to the stack.
    const saved = localStorage.getItem(STORAGE_KEY)!;
    expect(JSON.parse(saved)).toEqual(JSON.parse(before));
  });

  it("answering through to the end card shows the score", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizStack()));
    const root = mountApp();
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    const area = root.querySelector(".tryit-area")!;
    await waitFor(() => area.querySelectorAll(".sy-tile").length > 0);
    const dublin = Array.from(area.querySelectorAll<HTMLButtonElement>(".sy-tile")).find(
      (b) => b.textContent?.includes("Dublin"),
    );
    expect(dublin).not.toBeUndefined();

    // Correct-answer hold (900ms) then the flip (240ms) before the end card.
    dublin!.click();
    await waitFor(() => area.querySelector('[data-testid="end-score"]') !== null, 400);

    const endScore = area.querySelector('[data-testid="end-score"]');
    expect(endScore?.textContent).toContain("Score 1 of 1");
  });

  it("Try It uses the same mountPlayer as the exported player entry", async () => {
    const { readFileSync } = await import("node:fs");
    const trySrc = readFileSync("src/editor/TryItCanvas.tsx", "utf8");
    const indexSrc = readFileSync("src/player/index.ts", "utf8");
    expect(trySrc).toContain('from "../player/mount.js"');
    expect(trySrc).toContain("mountPlayer(");
    expect(indexSrc).toContain('from "./mount.js"');
    expect(indexSrc).toContain("mountPlayer(");
  });
});
