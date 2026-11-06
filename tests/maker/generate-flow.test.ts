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
    // The textarea is pre-filled with the Vikings example; clear it to test the
    // empty-input case.
    setSentence(root, "");
    await flush();
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

  /** Build an NDJSON streaming Response from a list of stream messages. */
  function ndjsonResponse(lines: unknown[], status = 200): Response {
    const body = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    return new Response(body, {
      status,
      headers: { "Content-Type": "application/x-ndjson" },
    });
  }

  /** The stream messages for a full, successful generation of `stack`. */
  function streamFor(stack: ReturnType<typeof quizStack>, isFallback = false): unknown[] {
    const msgs: unknown[] = [
      { type: "start", total: stack.cards.length, title: stack.title, isFallback },
    ];
    stack.cards.forEach((card, index) => {
      msgs.push({ type: "card", index, card });
    });
    msgs.push({ type: "done", stack, isFallback });
    return msgs;
  }

  it("switches to the editor with the returned stack on success (streamed)", async () => {
    const stack = quizStack();
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse(streamFor(stack))));
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    expect(root.querySelector(".workspace")).not.toBeNull();
    expect(root.textContent).toContain("Where did the Vikings build a town in 841?");
  });

  it("announces an honest ready-made-deck notice when isFallback is true (streamed)", async () => {
    // The fallback message must NOT claim "we couldn't reach the internet" when
    // the browser is online — it names a ready-made deck instead (TASK-22 d).
    const stack = quizStack();
    vi.stubGlobal("fetch", vi.fn(async () => ndjsonResponse(streamFor(stack, true))));
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    const announcer = document.querySelector('[data-announcer="maker"]');
    const text = announcer?.textContent ?? "";
    expect(text).toContain("ready-made deck");
    expect(text).not.toContain("couldn't reach the internet");
  });

  it("the building screen is honest offline: no time estimate on the fallback path", async () => {
    const { StartScreen } = await import("../../src/editor/StartScreen.js");
    const { EditorStore } = await import("../../src/editor/store.js");
    const root = document.createElement("div");
    document.body.appendChild(root);
    mounted = root;

    // Online (live model) path: the generating screen shows an honest estimate.
    // Real builds took 37–40 s, so it must not say "20 seconds" (TASK-26f).
    const onlineStore = new EditorStore({ status: "generating" });
    render(h(StartScreen, { store: onlineStore, __demoDealt: [], __demoTotal: 0 }), root);
    await flush(1);
    expect(root.textContent).toContain("30–60 seconds");
    expect(root.textContent).not.toContain("About 20 seconds");

    render(null, root);

    // Offline fallback path: no "20 seconds"; just "appears as it's ready".
    const offlineStore = new EditorStore({ status: "generating" });
    render(h(StartScreen, { store: offlineStore, __demoOffline: true, __demoDealt: [], __demoTotal: 0 }), root);
    await flush(1);
    expect(root.textContent).toContain("Each card appears as it's ready");
    expect(root.textContent).not.toContain("About 20 seconds");
  });

  it("shows the plain-language message and stays on Start on an error line", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ndjsonResponse([
          {
            type: "error",
            message:
              "We couldn't build your cards. Check your internet and press Build Cards again.",
          },
        ]),
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

  it("clears partially-dealt cards on a reset, then lands the replacement stack in the editor", async () => {
    // A partial stream (start + one card) that the server abandons with a
    // `reset`, then restarts with a clean fallback stack and `done`.
    const partialCard = {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      kind: "quiz",
      elements: [
        { type: "text", id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", x: 48, y: 104, w: 704, h: 128, content: "A half-dealt question that must disappear" },
      ],
      actions: [],
    };
    const stack = quizStack();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ndjsonResponse([
          { type: "start", total: 0, title: "partial", isFallback: false },
          { type: "card", index: 0, card: partialCard },
          { type: "reset" },
          ...streamFor(stack, true),
        ]),
      ),
    );
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    // Landed in the editor with the replacement stack, not the abandoned one.
    expect(root.querySelector(".workspace")).not.toBeNull();
    expect(root.textContent).toContain("Where did the Vikings build a town in 841?");
    expect(root.textContent).not.toContain("A half-dealt question that must disappear");
  });

  it("stays on Start with a plain message on a broken stream (no done line)", async () => {
    // Start + one card, then the stream ends abruptly — no done/error line.
    const stack = quizStack();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ndjsonResponse([
          { type: "start", total: stack.cards.length, title: stack.title, isFallback: false },
          { type: "card", index: 0, card: stack.cards[0] },
        ]),
      ),
    );
    const root = mount();
    setSentence(root, "A quiz about the Vikings");
    await flush();
    root.querySelector<HTMLButtonElement>(".build-btn")!.click();
    await flush();
    expect(root.querySelector(".start-area")).not.toBeNull();
    expect(root.querySelector(".error-notice")).not.toBeNull();
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
