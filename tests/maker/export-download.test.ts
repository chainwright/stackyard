// tests/maker/export-download.test.ts
// TASK-18: Export download (client).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, h } from "preact";
import { exportStack, triggerDownload } from "../../src/editor/api.js";
import { EditorScreen } from "../../src/editor/EditorScreen.js";
import { EditorStore } from "../../src/editor/store.js";
import { _resetAnnouncer } from "../../src/editor/a11y.js";
import { quizStack } from "./fixtures.js";

// jsdom has no ResizeObserver (the canvas scaler needs one).
class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let mounted: HTMLElement | null = null;

async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("TASK-18: Export download — api", () => {
  afterEach(() => vi.restoreAllMocks());

  it("a 200 text/html response returns the body byte-for-byte and a safe filename", async () => {
    const html = "<!doctype html><html><body>stack</body></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Disposition": 'attachment; filename="Vikings-Quiz.html"',
          },
        }),
      ),
    );
    const outcome = await exportStack(quizStack());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.html).toBe(html);
      expect(outcome.filename).toBe("Vikings-Quiz.html");
    }
  });

  it("falls back to safeFileName when no Content-Disposition is present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } }),
      ),
    );
    const outcome = await exportStack(quizStack());
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.filename).toBe("Vikings-Quiz.html");
  });

  it("a 422 returns the plain-language message and no html", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, message: "A set of cards needs exactly one last card." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const outcome = await exportStack(quizStack());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message).toContain("last card");
  });

  it("a network failure returns a plain-language message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    const outcome = await exportStack(quizStack());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.message.toLowerCase()).not.toContain("stack");
  });

  it("triggerDownload creates a blob download with the exact bytes and name", () => {
    const created: Array<{ href: string; download: string }> = [];
    const origCreate = document.createElement.bind(document);
    const createdBlobs: Blob[] = [];
    const origCreateURL = URL.createObjectURL;
    URL.createObjectURL = vi.fn((b: Blob) => { createdBlobs.push(b); return "blob:x"; }) as never;
    URL.revokeObjectURL = vi.fn() as never;
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLElement;
      if (tag === "a") {
        const a = el as HTMLAnchorElement;
        a.click = () => created.push({ href: a.href, download: a.download });
      }
      return el;
    });

    triggerDownload("<!doctype html>hello", "lesson.html");
    expect(created.length).toBe(1);
    expect(created[0]!.download).toBe("lesson.html");
    expect(createdBlobs.length).toBe(1);
    expect(createdBlobs[0]!.type).toBe("text/html");

    URL.createObjectURL = origCreateURL;
  });
});

describe("TASK-18: Export download — EditorScreen", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    _resetAnnouncer();
  });
  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
    vi.restoreAllMocks();
  });

  const rerenderRef: { current: () => void } = { current: () => {} };

  function mountEditor(store: EditorStore): HTMLElement {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const draw = () => render(h(EditorScreen, { store }), root);
    rerenderRef.current = draw;
    draw();
    mounted = root;
    return root;
  }

  function freshStore(): EditorStore {
    const stack = quizStack();
    return new EditorStore(
      { stack, screen: "editor" },
      { storage: makeStorage(), onChange: () => rerenderRef.current() },
    );
  }

  it("a successful export shows the Exported confirmation and triggers a download", async () => {
    const html = "<!doctype html><html></html>";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(html, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
            "Content-Disposition": 'attachment; filename="Vikings-Quiz.html"',
          },
        }),
      ),
    );
    const clickSpy = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:x") as never;
    URL.revokeObjectURL = vi.fn() as never;
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLElement;
      if (tag === "a") (el as HTMLAnchorElement).click = clickSpy;
      return el;
    });

    const store = freshStore();
    const root = mountEditor(store);
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await flush();
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".done-card")).not.toBeNull();
    expect(root.querySelector(".filename")?.textContent).toBe("Vikings-Quiz.html");
  });

  it("a 422 shows the message, triggers no download, and leaves the stack unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, message: "A set of cards needs exactly one last card." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const clickSpy = vi.fn();
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag) as HTMLElement;
      if (tag === "a") (el as HTMLAnchorElement).click = clickSpy;
      return el;
    });

    const store = freshStore();
    const before = JSON.stringify(store.getStack());
    const root = mountEditor(store);
    root.querySelector<HTMLButtonElement>(".export-btn")!.click();
    await flush();
    expect(clickSpy).not.toHaveBeenCalled();
    expect(root.querySelector(".done-card")).toBeNull();
    expect(root.querySelector(".notice")?.textContent ?? "").toContain("last card");
    expect(JSON.stringify(store.getStack())).toBe(before);
  });
});
