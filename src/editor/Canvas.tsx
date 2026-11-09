// src/editor/Canvas.tsx
// Centre canvas. Draws the selected card with the REUSED player renderer
// (renderCard) so the editor preview is literally what the class will see
// (REQ-MKR-02, design §Canvas). A capture-phase click handler maps a clicked
// rendered element to its id and selects it, without modifying renderer.ts.
//
// A selection overlay (navy outline + drag tab) is drawn as a sibling layer
// above the rendered card, keyed by element position — never inside the
// renderer's DOM.

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";
import type { Card, Stack, Element as StackElement, ButtonElement } from "../shared/types.js";
import type { EditorStore } from "./store.js";
import type { FlashSide } from "./EditorScreen.js";
import { renderCard } from "../player/renderer.js";
import { createRuntime } from "../player/runtime.js";
import { moveElement } from "./operations.js";
import { isPictogramCredit } from "../shared/pictogramCredit.js";

/** Map a clicked DOM node up to the card element id it belongs to. */
function elementIdFromClick(
  card: Card,
  cardRoot: HTMLElement,
  target: EventTarget | null,
): string | null {
  if (!(target instanceof Node)) return null;
  // The renderer wraps each element in a `.sy-element` positioned box in the
  // same source order as card.elements. Find that wrapper and its index.
  let node: Node | null = target;
  while (node && node !== cardRoot) {
    if (node instanceof HTMLElement && node.classList.contains("sy-element")) {
      const wrappers = Array.from(
        cardRoot.querySelectorAll<HTMLElement>(".sy-element"),
      );
      const index = wrappers.indexOf(node);
      if (index >= 0 && index < card.elements.length) {
        return card.elements[index]!.id;
      }
      return null;
    }
    node = node.parentNode;
  }
  return null;
}

/**
 * Fit scale: fill the canvas area. The Maker used to clamp this to ≥ 0.9, which
 * kept the "Card N of M" line at 18px but let the card overflow its area when a
 * banner or a short laptop screen left too little height — the bottom ~60 px ran
 * under the toolbar (TASK-29e). The card now always fits; the lower bound only
 * stops it vanishing, and the meta line is counter-scaled in CSS so it still
 * renders at 18px or more. `reservedTop` is the height of any control above the
 * card (the flash Front/Back switch), subtracted so card and control fit.
 */
export function fitScale(area: HTMLElement, reservedTop = 0): number {
  const w = area.clientWidth;
  // Height the scaled stack (820 × 640 design box) may take: the area minus its 16 px
  // padding top and bottom, the 24 px of ring room above the card, and any control above it.
  const h = area.clientHeight - reservedTop - 32 - 24;
  const s = Math.min((w - 48) / 812, h / 640);
  return Math.max(0.5, Math.min(s, 1.35));
}

export function Canvas({
  store,
  flashSide = "front",
  flashControl = null,
}: {
  store: EditorStore;
  flashSide?: FlashSide;
  flashControl?: ComponentChildren;
}): JSX.Element {
  const areaRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.95);

  const state = store.getState();
  const stack = state.stack as Stack;
  const card =
    stack.cards.find((c) => c.id === state.selectedCardId) ?? stack.cards[0]!;
  const selectedId = state.selectedElementId;

  // For a flash card the editor previews ONE side at a time (mockup Front/Back).
  // We render a derived card with only that side's text so the reused renderer
  // still draws it; this is an editor preview and needs no player change.
  const isFlash = card.kind === "flash";
  const flashTexts = isFlash
    ? card.elements.filter(
        (e): e is Extract<StackElement, { type: "text" }> => e.type === "text" && !isPictogramCredit(e.content),
      )
    : [];
  const flashCredit = isFlash
    ? card.elements.find((e): e is Extract<StackElement, { type: "text" }> => e.type === "text" && isPictogramCredit(e.content))
    : undefined;
  // On the BACK side, also draw the flash card's "Next Card" button so a
  // teacher can select it and change where it goes (J2: it was hidden in the
  // editor, so its link couldn't be edited). It keeps its real position.
  const flashButton =
    isFlash && flashSide === "back"
      ? card.elements.find((e): e is ButtonElement => e.type === "button")
      : undefined;
  const drawnCard: Card =
    isFlash && flashTexts.length >= 1
      ? {
          ...card,
          elements: [
            {
              ...(flashSide === "back" && flashTexts[1]
                ? flashTexts[1]
                : flashTexts[0]!),
              // Centre the single term/explanation on the card like the mockup.
              x: 48,
              y: flashSide === "front" ? 264 : 160,
              w: 704,
              h: flashSide === "front" ? 72 : 320,
            },
            ...(flashButton ? [flashButton] : []),
            // A picture and its credit (the third text) ride along on both sides (TASK-31h).
            ...card.elements.filter((e) => e.type === "image"),
            ...(card.elements.some((e) => e.type === "image") && flashCredit ? [flashCredit] : []),
          ],
        }
      : card;

  // Derive the "Card N of M" chrome from the FULL deck position (the card list
  // counts every card, so the meta matches it — same rule in both places). Not
  // stored in the stack; the renderer draws it from this.
  const deckIndex = stack.cards.findIndex((c) => c.id === card.id);
  const chrome =
    deckIndex >= 0
      ? { position: deckIndex + 1, total: stack.cards.length }
      : {};

  // Draw the selected card with the reused renderer after each render.
  useLayoutEffect(() => {
    const root = stackRef.current;
    if (!root) return;
    const runtime = createRuntime(stack);
    runtime.currentCardId = card.id;
    renderCard(
      drawnCard,
      root,
      runtime,
      () => {}, // navigate: no-op in edit mode
      () => {}, // playSound: silent in edit mode
      chrome, // derived "Card N of M" — drawn by the renderer, not stored
    );
    // On a flash front, centre the term and append the "tap to flip" hint
    // so the preview matches the mockup (editor-only chrome).
    if (isFlash) {
      const text = root.querySelector<HTMLElement>(".sy-card .sy-question");
      if (text) {
        if (flashSide === "back") {
          // The back is the explanation — body type, left-aligned (mockup
          // play-flash-back.html), not the 44px heading the front uses.
          text.classList.remove("sy-question");
          text.classList.add("sy-text");
          text.style.fontSize = "26px";
          text.style.lineHeight = "40px";
          text.style.textAlign = "left";
        } else {
          text.style.textAlign = "center";
        }
      }
      if (flashSide === "front") {
        const cardEl = root.querySelector<HTMLElement>(".sy-card");
        if (cardEl) {
          const hint = document.createElement("div");
          hint.className = "sy-element";
          hint.style.left = "48px";
          hint.style.top = "488px";
          hint.style.width = "704px";
          hint.style.height = "32px";
          const p = document.createElement("p");
          p.className = "sy-flash-hint";
          // The wrapper already positions the hint (top 488). The class itself is
          // absolute (top 524, for the player), which stacked on the wrapper's offset
          // and drew the hint ~500 px BELOW the card (TASK-29e: it made the canvas scroll).
          p.style.position = "static";
          p.textContent = "Tap the card to see the answer";
          hint.appendChild(p);
          cardEl.appendChild(hint);
        }
      }
    }
  }, [stack, card, drawnCard, isFlash, flashSide, chrome.position, chrome.total]);

  // Recompute the fit scale on mount and resize. When a control sits above the
  // card (the flash Front/Back switch), reserve its height so it never clips.
  const reservedTop = flashControl ? 64 : 0;
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const recompute = () => {
      if (!area.isConnected) return;
      setScale(fitScale(area, reservedTop));
    };
    recompute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(recompute);
    ro.observe(area);
    return () => ro.disconnect();
  }, [reservedTop]);

  // Capture-phase click → select element (no navigation/sound in edit mode).
  function onClickCapture(e: MouseEvent): void {
    const root = stackRef.current;
    if (!root) return;
    const id = elementIdFromClick(drawnCard, root, e.target);
    e.preventDefault();
    e.stopPropagation();
    store.setSelectedElement(id);
  }

  // ---- Real pointer drag ("Drag to move") ----
  // Pointerdown on an element selects it and begins a drag; pointermove moves it
  // through the shared moveElement op (which clamps to the canvas, invariant 5);
  // the whole drag coalesces into ONE undo step via the move:<id> coalesce key
  // (REQ-MKR-08/10). Screen pixels are converted to canvas pixels by dividing by
  // the current fit scale.
  const dragState = useRef<{
    id: string;
    startX: number;
    startY: number;
    elX: number;
    elY: number;
  } | null>(null);

  function onPointerDown(e: PointerEvent): void {
    const root = stackRef.current;
    if (!root) return;
    const id = elementIdFromClick(drawnCard, root, e.target);
    if (id === null) return;
    const el = card.elements.find((x) => x.id === id);
    if (!el) return;
    store.setSelectedElement(id);
    dragState.current = { id, startX: e.clientX, startY: e.clientY, elX: el.x, elY: el.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e: PointerEvent): void {
    const drag = dragState.current;
    if (drag === null) return;
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const nextX = Math.round(drag.elX + dx);
    const nextY = Math.round(drag.elY + dy);
    store.apply((s) => moveElement(s, drag.id, nextX, nextY), {
      coalesceKey: "move:" + drag.id,
    });
    e.preventDefault();
  }

  function endDrag(): void {
    dragState.current = null;
  }

  // Keyboard element move (REQ-MKR-08): arrow nudges by 1 px, Shift+arrow by
  // 10 px. A burst of nudges on the same element coalesces into one undo step
  // (REQ-MKR-10) via the shared coalesceKey.
  function onKeyDown(e: KeyboardEvent): void {
    const selId = store.getState().selectedElementId;
    if (selId === null) return;
    const el = card.elements.find((x) => x.id === selId);
    if (!el) return;
    const step = e.shiftKey ? 10 : 1;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case "ArrowLeft": dx = -step; break;
      case "ArrowRight": dx = step; break;
      case "ArrowUp": dy = -step; break;
      case "ArrowDown": dy = step; break;
      default: return;
    }
    e.preventDefault();
    store.apply((s) => moveElement(s, selId, el.x + dx, el.y + dy), {
      coalesceKey: "move:" + selId,
    });
  }

  // Selection overlay box for the selected element. For a flash card we draw a
  // repositioned derived element, so use the drawn geometry when it matches.
  let selectedEl: StackElement | undefined = card.elements.find(
    (el) => el.id === selectedId,
  );
  if (isFlash && selectedEl) {
    const drawn = drawnCard.elements.find((el) => el.id === selectedEl!.id);
    if (drawn) selectedEl = drawn;
  }

  // Editor-only "right answer" marker on a quiz card's correct tile. This is an
  // editing state (not an earned stamp), so it is NAVY (--color-ink), never red
  // (design-system Colour usage rules). Drawn as a sibling overlay, never in the
  // renderer's DOM.
  const correctTile: StackElement | undefined =
    card.kind === "quiz"
      ? card.elements.find(
          (el) =>
            el.type === "button" &&
            el.actions.some((a) => a.type === "score" && a.delta === 1),
        )
      : undefined;

  // Editor-only branch labels under story buttons ("→ Card N"), showing where
  // each button leads. Drawn as sibling overlays, never in the renderer's DOM.
  const branchLabels =
    card.kind === "story"
      ? card.elements
          .filter((el) => el.type === "button")
          .map((el) => {
            const goto =
              el.type === "button"
                ? el.actions.find((a) => a.type === "goto")
                : undefined;
            if (!goto || goto.type !== "goto") return null;
            const targetIndex = stack.cards.findIndex((c) => c.id === goto.cardId);
            if (targetIndex < 0) return null;
            const label =
              stack.cards[targetIndex]!.kind === "end"
                ? "→ Last card"
                : `→ Card ${targetIndex + 1}`;
            return { el, label };
          })
          .filter((x): x is { el: ButtonElement; label: string } => x !== null)
      : [];

  return (
    <main
      class="canvas-area"
      aria-label="Card preview"
      ref={areaRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ ["--card-scale" as string]: String(scale) }}
    >
      {flashControl}
      <div class="canvas-scale">
        {/* The rings sit outside the renderer's card clip, as a sibling. */}
        <div
          class="sy-card-stack"
          ref={stackRef}
          onClickCapture={onClickCapture}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        />
        {selectedEl ? (
          <div
            class="selection"
            style={{
              left: `${(selectedEl.x - 4) * scale}px`,
              top: `${(selectedEl.y - 4) * scale}px`,
              width: `${(selectedEl.w + 8) * scale}px`,
              height: `${(selectedEl.h + 8) * scale}px`,
            }}
          >
            <span class={selectedEl.id === correctTile?.id ? "drag-tab drag-tab-left" : "drag-tab"}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 2l3 3h-2v4h4V7l3 3-3 3v-2h-4v4h2l-3 3-3-3h2v-4H5v2l-3-3 3-3v2h4V5H7z"
                  fill="currentColor"
                />
              </svg>
              Drag to move
            </span>
            <span class="handle tl"></span>
            <span class="handle tr"></span>
            <span class="handle bl"></span>
            <span class="handle br"></span>
          </div>
        ) : null}
        {correctTile ? (
          <span
            class="right-tag"
            style={{
              position: "absolute",
              // A tab hung ABOVE the tile's top-right edge (in the 48 px
              // gutter), so it never covers a wrapped answer.
              left: `${(correctTile.x + correctTile.w - 8) * scale}px`,
              top: `${(correctTile.y - 30) * scale}px`,
              transform: "translateX(-100%)",
              zIndex: 29,
            }}
          >
            ✓ Right answer
          </span>
        ) : null}
        {branchLabels.map(({ el, label }) => (
          <div
            class="branch-label"
            style={{
              left: `${el.x * scale}px`,
              top: `${(el.y + el.h + 3) * scale}px`,
              width: `${el.w * scale}px`,
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </main>
  );
}
