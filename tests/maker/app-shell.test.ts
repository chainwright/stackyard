// tests/maker/app-shell.test.ts
// TASK-11: app shell and screen switch.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "preact";
import { h } from "preact";
import { App } from "../../src/editor/app.js";
import { STORAGE_KEY } from "../../src/editor/persistence.js";
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

describe("TASK-11: App shell and screen switch", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
    _resetAnnouncer();
  });

  afterEach(() => {
    if (mounted) render(null, mounted);
    mounted = null;
  });

  it("shows the Start screen when localStorage is empty", () => {
    const root = mount();
    expect(root.querySelector(".start-area")).not.toBeNull();
    expect(root.querySelector(".workspace")).toBeNull();
  });

  it("always shows the Stackyard wordmark in the top bar", () => {
    const root = mount();
    const wordmark = root.querySelector(".wordmark");
    expect(wordmark?.textContent).toBe("Stackyard");
  });

  it("opens the editor on a valid saved stack and renders its first card", () => {
    const stack = quizStack();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stack));
    const root = mount();
    // Editor workspace is present, Start screen is not.
    expect(root.querySelector(".workspace")).not.toBeNull();
    expect(root.querySelector(".start-area")).toBeNull();
    // The reused renderer drew the first card's question text.
    const text = root.textContent ?? "";
    expect(text).toContain("Where did the Vikings build a town in 841?");
  });
});
