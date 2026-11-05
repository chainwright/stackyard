// tests/maker/generate-flow.test.ts
// TASK-12: Start screen → generate flow (fetch stubbed).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { App } from "../../src/editor/app.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import { quizStack } from "./fixtures.js";

let mounted: HTMLElement | null = null;

function mount(): HTMLElement {
  const root = document.createElement("div");
  document.body.appendChild(root);
  render(h(App, {}), root);
  mounted = root;
  return root;
}

/** Flush Preact's async render queue and any pending microtasks/timers. */
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function setSentence(root: HTMLElement, value: string): void {
  const ta = root.querySelector<HTMLTextAreaElement>("#sentence")!;
  ta.value = value;
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TASK-12: Start screen generate flow", () => {
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

  it("keeps Build disabled on empty input and makes no request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const root = mount();
    const btn = root.querySelector<HTMLButtonElement>(".build-btn")!;
    expect(btn.disabled).toBe(true);
    btn.click();
    await flush();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("enables Build once the sentence is non-empty", async () => {
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    const btn = root.querySelector<HTMLButtonElement>(".build-btn")!;
    expect(btn.disabled).toBe(false);
  });

  it("switches to the editor with the returned stack on success", async () => {
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
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    expect(root.querySelector(".workspace")).not.toBeNull();
    expect(root.textContent).toContain("Where did the Vikings build a town in 841?");
  });

  it("shows the offline notice when isFallback is true", async () => {
    const stack = quizStack();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, stack, isFallback: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    const announcer = document.querySelector('[data-announcer="maker"]');
    expect(announcer?.textContent ?? "").toContain("offline");
  });

  it("shows the plain-language message and stays on Start on an error response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ ok: false, message: "We couldn't build your cards. Check your internet and press Build Cards again." }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    expect(root.querySelector(".start-area")).not.toBeNull();
    expect(root.querySelector(".error-notice")?.textContent ?? "").toContain("couldn't build your cards");
  });

  it("shows a plain message and stays on Start on a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    expect(root.querySelector(".start-area")).not.toBeNull();
    expect(root.querySelector(".error-notice")).not.toBeNull();
  });
});
