// tests/maker/persistence-wiring.test.ts
// TASK-19: persistence wired into the store lifecycle + Start-screen discard notice.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { App } from "../../src/editor/app.js";
import { EditorStore } from "../../src/editor/store.js";
import * as persistence from "../../src/editor/persistence.js";
import { STORAGE_KEY } from "../../src/editor/persistence.js";
import { editLabel } from "../../src/editor/operations.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import type { ButtonElement } from "../../src/shared/types.js";
import { quizStack } from "./fixtures.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let mounted: HTMLElement | null = null;

async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function mountApp(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(h(App, {}), root);
  mounted = root;
  return root;
}

describe("TASK-19: persistence wiring", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
    vi.restoreAllMocks();
  });

  it("a committed edit saves the current stack (flushed) and it parses to the current stack", () => {
    const store = new EditorStore({ stack: quizStack(), screen: "editor" }, {});
    const dublin = store.getStack()!.cards[0]!.elements.find(
      (e): e is ButtonElement => e.type === "button" && e.label === "Dublin",
    )!;
    store.apply((s) => editLabel(s, dublin.id, "Dubh Linn"));
    persistence.flush(); // write the debounced save immediately
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved).toEqual(store.getStack());
  });

  it("a successful generate saves the new stack", async () => {
    const stack = quizStack();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, stack, isFallback: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const root = mountApp();
    const ta = root.querySelector<HTMLTextAreaElement>("#sentence")!;
    ta.value = "A quiz about the Vikings";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    persistence.flush();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.id).toBe(stack.id);
  });

  it("a failed generate leaves the prior saved stack intact", async () => {
    // Seed a prior valid save, then drive a failed generate from the Start
    // screen with a store whose screen is "start" (so it never loads the prior
    // stack). A failed generate must not call setStack, so the save is intact.
    const prior = quizStack();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prior));
    const { StartScreen } = await import("../../src/editor/StartScreen.js");
    const ref: { draw: () => void } = { draw: () => {} };
    const store = new EditorStore({ screen: "start" }, { onChange: () => ref.draw() });
    const root = document.createElement("div");
    document.body.appendChild(root);
    ref.draw = () => render(h(StartScreen, { store }), root);
    ref.draw();
    mounted = root;

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, message: "We couldn't build your cards." }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    const ta = root.querySelector<HTMLTextAreaElement>("#sentence")!;
    ta.value = "A quiz about the Vikings";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    persistence.flush();
    // The prior save is unchanged.
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).id).toBe(prior.id);
  });

  it("a corrupted saved value sends the app to the Start screen with a gentle notice and no throw", () => {
    localStorage.setItem(STORAGE_KEY, "{ this is not valid json");
    let root!: HTMLElement;
    expect(() => { root = mountApp(); }).not.toThrow();
    expect(root.querySelector(".start-area")).not.toBeNull();
    expect(root.querySelector(".offline-notice")?.textContent ?? "").toContain("started fresh");
  });

  it("an invalid (parseable) saved stack is discarded and shows the Start screen notice", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: "nope", title: "", theme: {}, cards: [] }));
    const root = mountApp();
    expect(root.querySelector(".start-area")).not.toBeNull();
    expect(root.querySelector(".offline-notice")).not.toBeNull();
  });
});
