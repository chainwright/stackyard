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

// The standing metal ring-loop SVG (design-system.md), matching icons.tsx
// Ring / the mockups. Built as a string so it can be appended to the renderer's
// DOM as editor-only chrome without touching renderer.ts.
const RING_SVG =
  '<svg width="26" height="52" viewBox="0 0 26 52">' +
  '<ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/>' +
  '<ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/>' +
  '<ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/>' +
  "</svg>";

/**
 * Append the two standing binder-ring loops to the rendered card as a sibling
 * layer that stands ~22px above the card's top edge (design-system "Rings sit
 * outside the card's clip"). The player renderer only draws the flat punched
 * holes; the editor adds the loops so the canvas matches the mockups. Editor
 * chrome only — never written into the stack or the renderer's source.
 */
function addRings(cardRoot: HTMLElement): void {
  const cardEl = cardRoot.querySelector<HTMLElement>(".sy-card");
  if (!cardEl) return;
  if (cardEl.querySelector(".sy-rings")) return; // already added
  const rings = document.createElement("div");
  rings.className = "sy-rings";
  rings.setAttribute("aria-hidden", "true");
  rings.innerHTML = `<span class="sy-ring">${RING_SVG}</span><span class="sy-ring">${RING_SVG}</span>`;
  cardEl.appendChild(rings);
}

/**
 * Re-style short "meta" text elements (e.g. "Card 3 of 10") as the small meta
 * line above the question, matching the mockups. The player renderer classes
 * every text element on a quiz/flash card as `.sy-question` (44px heading); in
 * the editor a short meta line should read as `.sy-meta` (20px). We only
 * retag a text element that is clearly a meta line — a small box (≤ 40px tall)
 * that is NOT the tallest text on the card — so the real question keeps its
 * heading. Element wrappers are index-aligned to card.elements. Editor-only.
 */
function restyleMetaText(card: Card, cardRoot: HTMLElement): void {
  if (card.kind !== "quiz" && card.kind !== "flash" && card.kind !== "story") return;
  const texts = card.elements.filter(
    (e): e is Extract<StackElement, { type: "text" }> => e.type === "text",
  );
  if (texts.length < 2) return; // nothing to distinguish a meta line from
  const tallest = texts.reduce((m, t) => Math.max(m, t.h), 0);
  const wrappers = Array.from(cardRoot.querySelectorAll<HTMLElement>(".sy-element"));
  card.elements.forEach((el, i) => {
    if (el.type !== "text") return;
    const isMeta = el.h <= 40 && el.h < tallest;
    if (!isMeta) return;
    const p = wrappers[i]?.querySelector<HTMLElement>("p.sy-question");
    if (p) {
      p.classList.remove("sy-question");
      p.classList.add("sy-meta");
    }
  });
}

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

/** Fit scale: fill the canvas area, clamped ≥ 0.9 in the Maker (design-system). */
function fitScale(area: HTMLElement): number {
  const w = area.clientWidth;
  const h = area.clientHeight;
  const s = Math.min((w - 48) / 812, (h - 48) / 612);
  return Math.max(0.9, Math.min(s, 1.35));
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
        (e): e is Extract<StackElement, { type: "text" }> => e.type === "text",
      )
    : [];
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
          ],
        }
      : card;

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
    );
    // Editor-only chrome layered over the reused renderer (no renderer change):
    //   - the standing binder-ring loops above the card (the renderer draws
    //     only the flat punched holes), and
    //   - a small meta line ("Card 3 of 10") instead of a 44px heading.
    addRings(root);
    restyleMetaText(drawnCard, root);
    // On a flash front, centre the term and append the "tap to flip" hint
    // so the preview matches the mockup (editor-only chrome).
    if (isFlash) {
      const text = root.querySelector<HTMLElement>(".sy-card .sy-question");
      if (text) {
        text.style.textAlign = "center";
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
          p.textContent = "Tap the card to see the answer";
          hint.appendChild(p);
          cardEl.appendChild(hint);
        }
      }
    }
  }, [stack, card, drawnCard, isFlash, flashSide]);

  // Recompute the fit scale on mount and resize.
  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const recompute = () => {
      if (!area.isConnected) return;
      setScale(fitScale(area));
    };
    recompute();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(recompute);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // Capture-phase click → select element (no navigation/sound in edit mode).
  function onClickCapture(e: MouseEvent): void {
    const root = stackRef.current;
    if (!root) return;
    const id = elementIdFromClick(drawnCard, root, e.target);
    e.preventDefault();
    e.stopPropagation();
    store.setSelectedElement(id);
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
            <span class="drag-tab">
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
              left: `${(correctTile.x + correctTile.w - 150) * scale}px`,
              top: `${(correctTile.y + correctTile.h / 2 - 15) * scale}px`,
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
              top: `${(el.y + el.h + 18) * scale}px`,
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
