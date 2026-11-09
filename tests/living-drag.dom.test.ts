// tests/living-drag.test.ts
// TASK-31d: drag in the Teacher tab. The living preview moves an element through
// the shared moveElement operation (canvas clamp, button overlap guard); a whole
// drag is ONE undo step. The browser version (drag, Undo, Redo, Save a Copy, the
// copy holds the new x/y) is scripts/check-living-file.ts, mode E.

import { describe, it, expect, afterEach } from "vitest";
import fc from "fast-check";
import { LivingEditor } from "../src/living/editor.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import { validate } from "../src/shared/validator.js";
import type { Stack } from "../src/shared/types.js";

class FakeResizeObserver { observe(): void {} unobserve(): void {} disconnect(): void {} }
(globalThis as unknown as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;

let host: HTMLElement | null = null;
afterEach(() => {
  host?.remove();
  host = null;
});

function mount(stack: Stack = vikingsStack()): { editor: LivingEditor; host: HTMLElement; notices: string[] } {
  host = document.createElement("div");
  document.body.appendChild(host);
  const notices: string[] = [];
  const editor = new LivingEditor(stack, host, (m) => notices.push(m));
  editor.render();
  return { editor, host, notices };
}

const pos = (s: Stack, id: string): { x: number; y: number; w: number; h: number } => {
  const el = s.cards.flatMap((c) => c.elements).find((e) => e.id === id)!;
  return { x: el.x, y: el.y, w: el.w, h: el.h };
};

/** Fire a pointer-ish event (jsdom has MouseEvent; the handler only reads clientX/clientY). */
function fire(target: Element, type: string, x: number, y: number): void {
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}

describe("TASK-31d: dragging in the Teacher tab (jsdom)", () => {
  it("TASK-31d: the preview's elements carry their ids, and a pointer drag moves the element and keeps the stack valid", () => {
    const { editor, host } = mount();
    const wrappers = Array.from(host.querySelectorAll<HTMLElement>(".sy-living-canvas .sy-element[data-element-id]"));
    expect(wrappers.length).toBeGreaterThan(0);
    const tileWrapper = wrappers.filter((w) => w.querySelector(".sy-tile")).pop()!;
    const id = tileWrapper.getAttribute("data-element-id")!;
    const before = pos(editor.getStack(), id);

    fire(tileWrapper.querySelector(".sy-tile")!, "pointerdown", 100, 100);
    fire(tileWrapper.querySelector(".sy-tile")!, "pointermove", 112, 100);
    fire(tileWrapper.querySelector(".sy-tile")!, "pointermove", 124, 100);
    fire(tileWrapper.querySelector(".sy-tile")!, "pointerup", 124, 100);

    const after = pos(editor.getStack(), id);
    expect(after.x).toBe(before.x + 24);
    expect(after.y).toBe(before.y);
    expect(tileWrapper.style.left).toBe(`${before.x + 24}px`);
    expect(validate(editor.getStack()).valid).toBe(true);
  });

  it("TASK-31d: a whole drag is ONE undo step, and Redo brings it back", () => {
    const { editor, host } = mount();
    const wrapper = Array.from(host.querySelectorAll<HTMLElement>(".sy-element[data-element-id]")).filter((w) => w.querySelector(".sy-tile")).pop()!;
    const id = wrapper.getAttribute("data-element-id")!;
    const before = pos(editor.getStack(), id);
    const tile = wrapper.querySelector(".sy-tile")!;
    fire(tile, "pointerdown", 0, 0);
    for (let i = 1; i <= 6; i++) fire(tile, "pointermove", i * 4, 0);
    fire(tile, "pointerup", 24, 0);
    expect(pos(editor.getStack(), id).x).toBe(before.x + 24);
    expect(editor.undo()).toBe(true);
    expect(pos(editor.getStack(), id)).toEqual(before);
    expect(editor.undo()).toBe(false); // nothing else was recorded
    expect(editor.redo()).toBe(true);
    expect(pos(editor.getStack(), id).x).toBe(before.x + 24);
  });

  it("TASK-31d: the Undo and Redo buttons are in the Teacher tab and follow the history", () => {
    const { editor, host } = mount();
    const undo = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>(".sy-undo")!;
    expect(undo().disabled).toBe(true);
    const id = Array.from(host.querySelectorAll<HTMLElement>(".sy-element[data-element-id]")).pop()!.getAttribute("data-element-id")!;
    editor.startDrag(id, 0, 0);
    editor.dragTo(10, 0);
    editor.endDrag();
    expect(undo().disabled).toBe(false);
    undo().click();
    expect(host.querySelector<HTMLButtonElement>(".sy-undo")!.disabled).toBe(true);
    expect(host.querySelector<HTMLButtonElement>(".sy-redo")!.disabled).toBe(false);
  });

  it("TASK-31d: dropping an answer on top of another answer is refused (the tile stays put)", () => {
    const { editor, host } = mount();
    const tiles = Array.from(host.querySelectorAll<HTMLElement>(".sy-element[data-element-id]")).filter((w) => w.querySelector(".sy-tile"));
    expect(tiles.length).toBeGreaterThanOrEqual(2);
    const a = tiles[0]!.getAttribute("data-element-id")!;
    const b = tiles[1]!.getAttribute("data-element-id")!;
    const pa = pos(editor.getStack(), a);
    const pb = pos(editor.getStack(), b);
    editor.startDrag(a, 0, 0);
    editor.dragTo(pb.x - pa.x, pb.y - pa.y);
    editor.endDrag();
    expect(pos(editor.getStack(), a)).toEqual(pa);
  });

  it("TASK-31d: property — any sequence of drags (random deltas, off-canvas too) keeps the stack valid and every element inside 800 × 600", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            card: fc.nat(30),
            el: fc.nat(30),
            moves: fc.array(fc.tuple(fc.integer({ min: -4000, max: 4000 }), fc.integer({ min: -4000, max: 4000 })), { minLength: 1, maxLength: 4 }),
          }),
          { minLength: 1, maxLength: 6 },
        ),
        (drags) => {
          const { editor } = mount();
          for (const d of drags) {
            const cards = editor.getStack().cards;
            const card = cards[d.card % cards.length]!;
            editor.selectCard(card.id);
            if (card.elements.length === 0) continue;
            const el = card.elements[d.el % card.elements.length]!;
            editor.startDrag(el.id, 0, 0);
            for (const [dx, dy] of d.moves) editor.dragTo(dx, dy);
            editor.endDrag();
          }
          const s = editor.getStack();
          if (!validate(s).valid) return false;
          const inside = s.cards.every((c) => c.elements.every((e) => e.x >= 0 && e.y >= 0 && e.x + e.w <= 800 && e.y + e.h <= 600));
          host?.remove();
          host = null;
          return inside;
        },
      ),
      { numRuns: 200 },
    );
  }, 60_000);
});
