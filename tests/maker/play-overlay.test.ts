// tests/maker/play-overlay.test.ts
// TASK-17: Play mode via the shared mountPlayer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { App } from "../../src/editor/app.js";
import { EditorStore } from "../../src/editor/store.js";
import { STORAGE_KEY } from "../../src/editor/persistence.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import { quizStack } from "./fixtures.js";

// jsdom has no ResizeObserver; the player scaler needs one.
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
async function waitFor(pred: () => boolean, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
}

describe("TASK-17: Play mode", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  it("starting Play renders the first card with no toolbar or inspector", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizStack()));
    const root = mountApp();
    // Enter play via the Try It button.
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();
    const play = root.querySelector(".play-root")!;
    expect(play).not.toBeNull();
    await waitFor(() => (play.textContent ?? "").includes("Where did the Vikings"));
    // The first card is rendered inside the play stage.
    expect(play.textContent).toContain("Where did the Vikings build a town in 841?");
    // No editing chrome inside the play overlay.
    expect(play.querySelector(".toolbar")).toBeNull();
    expect(play.querySelector(".inspector")).toBeNull();
    expect(play.querySelector(".cardlist")).toBeNull();
  });

  it("exiting Play returns to the editor with the same selection and an unchanged stack", async () => {
    const stack = quizStack();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
    const root = mountApp();
    // Select the end card first so we can confirm selection is preserved.
    // (Select via the card list.)
    const entries = root.querySelectorAll<HTMLButtonElement>(".card-entry");
    entries[1]!.click();
    await flush();
    const selectedBefore = (root.querySelector(".card-entry[aria-current='true']") as HTMLElement | null);
    // Capture the stack snapshot before playing.
    const before = JSON.stringify(stack);

    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();
    const playRoot = root.querySelector(".play-root")!;
    expect(playRoot).not.toBeNull();
    await waitFor(() => (playRoot.textContent ?? "").includes("Where did the Vikings"));

    // Exit play.
    root.querySelector<HTMLButtonElement>(".play-root .exit")!.click();
    await flush();

    expect(root.querySelector(".play-root")).toBeNull();
    expect(root.querySelector(".workspace")).not.toBeNull();
    // Selection preserved (the second card is still current).
    const current = root.querySelector(".card-entry[aria-current='true'] .num");
    expect(current?.textContent).toBe("2");
    expect(selectedBefore).not.toBeNull();
    // The stack is unchanged by playing (byte-for-byte via JSON).
    // Re-read from the store by comparing the rendered editor content.
    // Playing writes nothing back, so the saved value equals the original.
    const saved = localStorage.getItem(STORAGE_KEY)!;
    expect(JSON.parse(saved)).toEqual(JSON.parse(before));
  });

  it("answering through to the end card shows the score", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(quizStack()));
    const root = mountApp();
    root.querySelector<HTMLButtonElement>(".tryit")!.click();
    await flush();

    const stage = root.querySelector(".play-stage")!;
    await waitFor(() => stage.querySelectorAll(".sy-tile").length > 0);
    const dublin = Array.from(stage.querySelectorAll<HTMLButtonElement>(".sy-tile")).find(
      (b) => b.textContent?.includes("Dublin"),
    );
    expect(dublin).not.toBeUndefined();

    // The renderer holds 900ms after a correct answer before the goto fires.
    dublin!.click();
    await waitFor(() => stage.querySelector('[data-testid="end-score"]') !== null, 400);

    // The end card shows "Score 1 of 1" (one quiz card, one correct).
    const endScore = stage.querySelector('[data-testid="end-score"]');
    expect(endScore?.textContent).toContain("Score 1 of 1");
  });

  it("Play mode uses the same mountPlayer as the exported player entry", async () => {
    const { readFileSync } = await import("node:fs");
    const playSrc = readFileSync("src/editor/PlayOverlay.tsx", "utf8");
    const indexSrc = readFileSync("src/player/index.ts", "utf8");
    expect(playSrc).toContain('from "../player/mount.js"');
    expect(playSrc).toContain("mountPlayer(");
    expect(indexSrc).toContain('from "./mount.js"');
    expect(indexSrc).toContain("mountPlayer(");
  });
});
