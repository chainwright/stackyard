// tests/living-mobile.dom.test.ts
// TASK-31b: the Teacher tab on a phone. The real-layout check (390 x 844, the card
// inside the viewport, not clipped, a screenshot) is scripts/check-living-mobile.ts;
// this covers the markup and the CSS it relies on.

import { describe, it, expect, afterEach } from "vitest";
import { LivingEditor } from "../src/living/editor.js";
import { LIVING_STYLES } from "../src/living/styles.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});
function mount(): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  new LivingEditor(vikingsStack(), host, () => {}).render();
  return host;
}

describe("TASK-31b: the Teacher tab folds its card list on a phone", () => {
  it("TASK-31b: a one-line Cards toggle sits before the list; the list starts closed and the toggle opens and closes it", () => {
    const h = mount();
    const toggle = h.querySelector<HTMLButtonElement>(".sy-cards-toggle")!;
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toBe("Cards — 1 of 12");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(h.querySelector(".sy-living-list")!.classList.contains("sy-open")).toBe(false);
    toggle.click();
    expect(h.querySelector(".sy-living-list")!.classList.contains("sy-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(h.querySelector(".sy-living-list")!.classList.contains("sy-open")).toBe(false);
  });

  it("TASK-31b: choosing a card closes the list again and the toggle names the card", () => {
    const h = mount();
    h.querySelector<HTMLButtonElement>(".sy-cards-toggle")!.click();
    h.querySelectorAll<HTMLButtonElement>(".sy-living-list button")[2]!.click();
    expect(h.querySelector(".sy-living-list")!.classList.contains("sy-open")).toBe(false);
    expect(h.querySelector(".sy-cards-toggle")!.textContent).toBe("Cards — 3 of 12");
  });

  it("TASK-31b: the phone layout lives in a max-width: 699px media query; the toggle is hidden outside it", () => {
    const [outside, inside] = LIVING_STYLES.split("@media (max-width: 699px)");
    expect(inside).toBeDefined();
    expect(outside).toMatch(/\.sy-cards-toggle \{ display: none; \}/);
    expect(inside).toMatch(/\.sy-living-body \{ flex-direction: column/);
    expect(inside).toMatch(/\.sy-living-list \{ display: none/);
    expect(inside).toMatch(/\.sy-living-inspector \{[^}]*width: 100%/);
  });
});
