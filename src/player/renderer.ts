// src/player/renderer.ts
// DOM renderer for the Stackyard player.
// Follows design-system.md exactly:
//   - paper/ink/rule/stamp colour tokens
//   - Two metal ring holes at the top of each card
//   - Three offset card-edge layers behind the active card
//   - Shaped answer tiles (▲◆●■) with fixed tile colours
//   - "CORRECT ✓" stamp overlay at -8 deg with stamp-land animation
//   - Tile shake on wrong answer
//   - Hold 900 ms after correct stamp before goto; 600 ms after shake before goto
//   - prefers-reduced-motion respected (hold kept, animation skipped)
//   - aria-live region for stamp announcement
//   - End-card special rendering: heading + Score N of M + stamp row
// No framework. No external dependencies. Vanilla TypeScript.

import type { Card, Stack, Element as StackElement, ButtonElement } from "../shared/types.js";
import type { RuntimeState } from "./runtime.js";
import { dispatch } from "./runtime.js";

// ---------------------------------------------------------------------------
// Derived card chrome
//
// "Card N of M" and the running score are DERIVED from the deck position and
// runtime state — they are NOT stored in the stack. The stack format and its
// round-trip are therefore unchanged. `renderCard` computes nothing itself; the
// caller (mountPlayer / the editor Canvas) passes the deck position, because
// only the caller knows where this card sits in the whole deck.

/**
 * Derived chrome for a card. Passed by the caller; never read from or written
 * to the stack.
 *   - `position` / `total` — this content card's 1-based place among the
 *     non-end cards and the count of non-end cards ("Card 3 of 10"). Omit for
 *     a card that should show no meta line (the renderer also omits it on the
 *     end card).
 */
export interface CardChrome {
  position?: number;
  total?: number;
}

// The standing metal binder-ring loop (design-system.md "Rings sit outside the
// card's clip"). Built as a string so it can be injected with innerHTML — it is
// a hardcoded constant, never stack-derived content.
const RING_SVG =
  '<svg width="26" height="52" viewBox="0 0 26 52" aria-hidden="true">' +
  '<ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5"/>' +
  '<ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1"/>' +
  '<ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1"/>' +
  "</svg>";

// ---------------------------------------------------------------------------
// Design-system constants

const COLOR = {
  paper: "#FBF8F1",
  ink: "#1E2A47",
  rule: "#C9D3E3",
  stamp: "#CE3926",
  tileA: "#F2735F",
  tileB: "#F6C744",
  tileC: "#26A69A",
  tileD: "#1E2A47",
  white: "#FFFFFF",
} as const;

// Each answer tile slot has a fixed colour, text colour, and shape SVG.
const TILE_SLOTS = [
  {
    color: COLOR.tileA,
    textColor: COLOR.ink,
    // Equilateral triangle pointing up, 28×28
    shapePath: '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor"/></svg>',
  },
  {
    color: COLOR.tileB,
    textColor: COLOR.ink,
    // Diamond (rotated square 45°), 28×28
    shapePath: '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor"/></svg>',
  },
  {
    color: COLOR.tileC,
    textColor: COLOR.ink,
    // Circle, 28×28
    shapePath: '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor"/></svg>',
  },
  {
    color: COLOR.tileD,
    textColor: COLOR.white,
    // Square, 28×28
    shapePath: '<svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor"/></svg>',
  },
] as const;

// ---------------------------------------------------------------------------
// Timing constants (ms)

const HOLD_CORRECT_MS = 900;   // stamp shown → goto fires
const HOLD_WRONG_MS   = 600;   // shake ends  → goto fires

// ---------------------------------------------------------------------------
// CSS injected once per page-load

const PLAYER_STYLES = `
/* Stackyard player — design-system.md tokens */
:root {
  --color-paper:   ${COLOR.paper};
  --color-ink:     ${COLOR.ink};
  --color-rule:    ${COLOR.rule};
  --color-stamp:   ${COLOR.stamp};
  --color-tile-a:  ${COLOR.tileA};
  --color-tile-b:  ${COLOR.tileB};
  --color-tile-c:  ${COLOR.tileC};
  --color-tile-d:  ${COLOR.tileD};
  --color-white:   ${COLOR.white};
  --radius-card:   10px;
  --radius-tile:   12px;
  --rule-gap:      32px;
  --ring-offset:   4px;
  --text-question: 44px;
  --text-tile:     32px;
  --text-body:     22px;
  --text-meta:     20px;
}

/* Reset */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ---- Card stack wrapper ---- */
.sy-card-stack {
  position: relative;
  width: 800px;
  height: 600px;
}

/* Three offset card-edge layers behind the active card */
.sy-card-edge {
  position: absolute;
  top: 0; left: 0;
  width: 800px; height: 600px;
  border-radius: var(--radius-card);
  background: var(--color-paper);
  border: 1.5px solid var(--color-rule);
  pointer-events: none;
}
.sy-card-edge-1 { transform: translate(4px, 4px);   z-index: 1; }
.sy-card-edge-2 { transform: translate(8px, 8px);   z-index: 0; }
.sy-card-edge-3 { transform: translate(12px, 12px); z-index: -1; }

/* ---- Active card ---- */
.sy-card {
  position: absolute;
  top: 0; left: 0;
  width: 800px; height: 600px;
  border-radius: var(--radius-card);
  background-color: var(--color-paper);
  border: 1.5px solid var(--color-rule);
  overflow: hidden;
  z-index: 2;
}

/* Ruled lines — drawn once, starting 40px from top (below ring holes).
   background-size ensures only one gradient layer. */
.sy-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;
  background-image: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 31px,
    var(--color-rule) 31px,
    var(--color-rule) 32px
  );
  background-position: 0 40px;
  background-size: 100% calc(100% - 40px);
}

/* ---- Ring holes (the punched hole beneath each standing ring loop). Aligned
   to the same x and gap as .sy-rings so a hole sits under each loop. ---- */
.sy-ring-holes {
  position: absolute;
  top: 14px; left: 0;
  width: 800px;
  display: flex;
  justify-content: center;
  gap: 240px;
  pointer-events: none;
  z-index: 10;
}
.sy-ring-hole {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-white);
  border: 1px solid var(--color-rule);
}

/* ---- Standing binder rings (design-system "Rings sit outside the card's clip").
   A sibling of .sy-card, standing ~22px above the card's top edge. The card is
   overflow:hidden so the loops are drawn here, not inside the card. ---- */
.sy-rings {
  position: absolute;
  top: -22px;
  left: 0;
  width: 800px;
  height: 52px;
  display: flex;
  justify-content: center;
  gap: 240px;
  pointer-events: none;
  z-index: 12;
}
.sy-ring svg { display: block; }

/* ---- Derived meta line ("Card N of M"), drawn by the renderer, not stored
   in the stack. Small 20px line in the top-left, above the question. ---- */
.sy-meta-chrome {
  position: absolute;
  left: 48px;
  top: 48px;
  width: 400px;
  height: 32px;
  z-index: 1;
}
.sy-meta-chrome .sy-meta {
  font-size: var(--text-meta);     /* 20px — stays ≥ 18px at min scale */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Derived running-score pill, top-right of the card, read from runtime
   state. Matches the mockup's "Score N" (navy on paper). Derived chrome, never
   stored in the stack. ---- */
.sy-score-chrome {
  position: absolute;
  top: 44px;
  right: 40px;
  z-index: 11;
  display: inline-flex;
  align-items: center;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  font-size: 24px;
  color: var(--color-ink);
}

/* ---- Element positioning ---- */
.sy-element {
  position: absolute;
  z-index: 1;
}

/* ---- Text element — body (story / flash / generic) ---- */
.sy-text {
  font-size: var(--text-body);       /* 22px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Question text — quiz / flash heading ---- */
.sy-question {
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}

/* ---- Meta text (Card N of M) ---- */
.sy-meta {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Field span ---- */
.sy-field {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
  color: var(--color-ink);
}

/* ---- Image ---- */
.sy-image {
  display: block;
  object-fit: contain;
}

/* ---- Answer tile (button) ---- */
.sy-tile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: var(--radius-tile);
  padding: 0 20px;
  min-height: 56px;
  font-size: var(--text-tile);       /* 32px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 700;
  line-height: 1.3;
  cursor: pointer;
  width: 100%;
  height: 100%;
  text-align: left;
  outline: none;
}
.sy-tile:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
}
.sy-tile .sy-tile-shape {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ---- Generic button ---- */
.sy-button {
  border: 2px solid var(--color-ink);
  border-radius: 10px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: var(--text-body);       /* 22px */
  font-family: 'Atkinson Hyperlegible', 'Arial', sans-serif;
  font-weight: 400;
  cursor: pointer;
  min-height: 44px;
  min-width: 44px;
  padding: 8px 16px;
  width: 100%;
  height: 100%;
  outline: none;
}
.sy-button:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
}

/* ---- Stamp overlay (on tile) ---- */
/* Anchored so its BOTTOM edge sits at tile-top + 14px
   (bottom: calc(100% - 14px)), right-aligned 16px from the tile's right edge.
   Reduced to ~0.75 of original size (26px font, 6px 12px padding) so at most
   the top 25% of the tile label is obscured.
   Real-browser overlap is verified by screenshot (docs/design/review/). */
.sy-stamp {
  position: absolute;
  bottom: calc(100% - 14px);
  right: 16px;
  left: auto;
  transform: rotate(-8deg) scale(1);
  color: var(--color-stamp);
  font-size: 26px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  background: var(--color-paper);
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 6px 12px;
  opacity: 0.92;
  pointer-events: none;
  white-space: nowrap;
  z-index: 20;
}

/* ---- End card ---- */
.sy-end-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 60px;
  gap: 24px;
  text-align: center;
  position: relative;
  z-index: 1;
}
.sy-end-heading {
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}
.sy-end-score {
  font-size: 56px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.2;
  color: var(--color-ink);
}
.sy-end-stamps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.sy-end-stamp-pip {
  display: inline-block;
  font-size: 14px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  color: var(--color-stamp);
  border: 2px solid var(--color-stamp);
  border-radius: 4px;
  padding: 2px 5px;
  opacity: 0.88;
  line-height: 1.2;
}

/* ---- Animations ---- */
@keyframes stamp-land {
  0%   { transform: rotate(-8deg) scale(1.4); opacity: 0; }
  60%  { transform: rotate(-8deg) scale(0.92); opacity: 1; }
  80%  { transform: rotate(-8deg) scale(1.04); opacity: 1; }
  100% { transform: rotate(-8deg) scale(1.0);  opacity: 1; }
}

@keyframes tile-shake {
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-6px); }
  40%  { transform: translateX(6px); }
  60%  { transform: translateX(-6px); }
  80%  { transform: translateX(6px); }
  100% { transform: translateX(0); }
}

@keyframes card-exit {
  from { transform: rotateX(0deg);   opacity: 1; }
  to   { transform: rotateX(-90deg); opacity: 0; }
}

@keyframes card-enter {
  from { transform: rotateX(90deg);  opacity: 0; }
  to   { transform: rotateX(0deg);   opacity: 1; }
}

.sy-stamp-animate {
  animation: stamp-land 120ms ease-out forwards;
}

.sy-tile-shake {
  animation: tile-shake 180ms ease-in-out 1;
}

/* Reduced-motion: replace animations with instant opacity cross-fade */
@media (prefers-reduced-motion: reduce) {
  .sy-stamp-animate { animation: none; opacity: 0.92; }
  .sy-tile-shake    { animation: none; }
  .sy-card-exit, .sy-card-enter { animation: none; opacity: 1; transition: opacity 100ms; }
}

/* ---- Aria-live region (visually hidden) ---- */
.sy-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
`;

// ---------------------------------------------------------------------------
// Style injection (once per document)

let stylesInjected = false;

function ensureStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement("style");
  style.textContent = PLAYER_STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

// ---------------------------------------------------------------------------
// aria-live region (created once)

let ariaLiveEl: HTMLElement | null = null;

function ensureAriaLive(): HTMLElement {
  if (ariaLiveEl) return ariaLiveEl;
  const el = document.createElement("div");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  el.className = "sy-sr-only";
  document.body.appendChild(el);
  ariaLiveEl = el;
  return el;
}

// ---------------------------------------------------------------------------
// SVG shape injection — hardcoded constants, not user content

function injectShapeSvg(container: HTMLElement, svgString: string): void {
  container.innerHTML = svgString;
}

// ---------------------------------------------------------------------------
// Count quiz cards in a stack (used for end card "Score N of M")

function countQuizCards(stack: Stack): number {
  return stack.cards.filter((c) => c.kind === "quiz").length;
}

// ---------------------------------------------------------------------------
// End-card renderer

function renderEndCard(
  card: Card,
  cardEl: HTMLElement,
  state: RuntimeState,
  navigate: (id: string, automatic: boolean) => void,
  playSound: (sound: "cheer" | "buzz") => void,
  ariaLive: HTMLElement,
): void {
  const score = typeof state.variables["score"] === "number"
    ? state.variables["score"]
    : 0;
  const total = countQuizCards(state.stack);

  const container = document.createElement("div");
  container.className = "sy-end-card";

  // Heading — use the card's own text element if present, otherwise "Well done!"
  const textEl = card.elements.find((e) => e.type === "text");
  const headingText = textEl && textEl.type === "text" ? textEl.content : "Well done!";
  const heading = document.createElement("h1");
  heading.className = "sy-end-heading";
  heading.textContent = headingText;
  container.appendChild(heading);

  // Score line "Score N of M"
  const scoreLine = document.createElement("p");
  scoreLine.className = "sy-end-score";
  scoreLine.setAttribute("data-testid", "end-score");
  scoreLine.textContent = `Score ${score} of ${total}`;
  container.appendChild(scoreLine);

  // Row of mini stamps — one per correct answer
  if (score > 0) {
    const stampsRow = document.createElement("div");
    stampsRow.className = "sy-end-stamps";
    stampsRow.setAttribute("aria-label", `${score} correct answer${score !== 1 ? "s" : ""}`);
    for (let i = 0; i < score; i++) {
      const pip = document.createElement("span");
      pip.className = "sy-end-stamp-pip";
      pip.textContent = "✓";
      pip.setAttribute("aria-hidden", "true");
      stampsRow.appendChild(pip);
    }
    container.appendChild(stampsRow);
  }

  // Announce to screen readers
  ariaLive.textContent = `${headingText}. Score ${score} of ${total}.`;

  // If the end card has any button elements, render them (e.g. "Play again")
  for (const el of card.elements) {
    if (el.type !== "button") continue;
    const wrapper = document.createElement("div");
    wrapper.style.marginTop = "16px";
    const btn = document.createElement("button");
    btn.className = "sy-button";
    btn.style.width = "auto";
    btn.style.height = "auto";
    btn.textContent = el.label;
    btn.addEventListener("click", () => {
      dispatch(el.actions, state, (id) => navigate(id, false), playSound);
    });
    wrapper.appendChild(btn);
    container.appendChild(wrapper);
  }

  cardEl.appendChild(container);
}

// ---------------------------------------------------------------------------
// Main renderer

/**
 * Renders `card` into `root`, replacing any existing content.
 *
 * - If card.kind === "end": renders a special end-card template.
 * - Otherwise: creates the card-stack wrapper with three offset background
 *   edges, creates the active card with ruled lines and ring holes, and
 *   renders each element in `card.elements`.
 * - Button click handlers: for correct quiz tiles, shows stamp + aria-live +
 *   cheer, holds 900 ms, then fires goto. For wrong tiles: shake + buzz,
 *   holds 600 ms, then fires goto.
 */
export function renderCard(
  card: Card,
  root: HTMLElement,
  state: RuntimeState,
  navigate: (id: string, automatic: boolean) => void,
  playSound: (sound: "cheer" | "buzz") => void = _noop,
  chrome: CardChrome = {},
): void {
  ensureStyles();
  const ariaLive = ensureAriaLive();

  // Clear the root.
  root.innerHTML = "";

  // ---- Card stack wrapper ----
  const stackWrapper = document.createElement("div");
  stackWrapper.className = "sy-card-stack";

  // Three offset background edges (behind the card).
  for (let i = 1; i <= 3; i++) {
    const edge = document.createElement("div");
    edge.className = `sy-card-edge sy-card-edge-${i}`;
    stackWrapper.appendChild(edge);
  }

  // ---- Active card ----
  const cardEl = document.createElement("div");
  cardEl.className = "sy-card";

  // Ring holes (the punched hole beneath each standing ring loop).
  const ringHoles = document.createElement("div");
  ringHoles.className = "sy-ring-holes";
  ringHoles.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 2; i++) {
    const hole = document.createElement("div");
    hole.className = "sy-ring-hole";
    ringHoles.appendChild(hole);
  }
  cardEl.appendChild(ringHoles);

  // Standing binder rings — a sibling of the card, standing above its top edge.
  const rings = document.createElement("div");
  rings.className = "sy-rings";
  rings.setAttribute("aria-hidden", "true");
  rings.innerHTML = `<span class="sy-ring">${RING_SVG}</span><span class="sy-ring">${RING_SVG}</span>`;

  // ---- End card: special rendering ----
  if (card.kind === "end") {
    renderEndCard(card, cardEl, state, navigate, playSound, ariaLive);
    stackWrapper.appendChild(cardEl);
    stackWrapper.appendChild(rings);
    root.appendChild(stackWrapper);
    return;
  }

  // ---- Derived chrome (not stored in the stack) ----
  // "Card N of M" meta line above the question, for content cards only.
  if (
    typeof chrome.position === "number" &&
    typeof chrome.total === "number" &&
    chrome.total > 0
  ) {
    const metaWrap = document.createElement("div");
    metaWrap.className = "sy-meta-chrome";
    const metaP = document.createElement("p");
    metaP.className = "sy-meta";
    metaP.textContent = `Card ${chrome.position} of ${chrome.total}`;
    metaWrap.appendChild(metaP);
    cardEl.appendChild(metaWrap);
  }

  // Running score, top-right, read from runtime state. Quiz cards keep score;
  // show it wherever a score is being tracked (any content card).
  const liveScore = state.variables["score"];
  if (typeof liveScore === "number") {
    const scoreWrap = document.createElement("div");
    scoreWrap.className = "sy-score-chrome";
    scoreWrap.setAttribute("aria-label", `Score ${liveScore}`);
    scoreWrap.textContent = `Score ${liveScore}`;
    cardEl.appendChild(scoreWrap);
  }

  // ---- Regular card: render elements ----
  const buttonElements = card.elements.filter(
    (el): el is ButtonElement => el.type === "button",
  );
  const isQuizCard = card.kind === "quiz";
  let buttonIndex = 0;

  for (const el of card.elements) {
    const wrapper = document.createElement("div");
    wrapper.className = "sy-element";
    positionElement(wrapper, el);

    switch (el.type) {
      case "text": {
        const p = document.createElement("p");
        // Quiz and flash cards use the question token for their text elements.
        p.className = (isQuizCard || card.kind === "flash") ? "sy-question" : "sy-text";
        p.textContent = el.content;
        wrapper.appendChild(p);
        break;
      }

      case "button": {
        const btn = buildButtonElement(
          el,
          isQuizCard,
          buttonElements.length,
          buttonIndex,
          state,
          navigate,
          playSound,
          ariaLive,
        );
        wrapper.appendChild(btn);
        buttonIndex++;
        break;
      }

      case "image": {
        const img = document.createElement("img");
        img.setAttribute("src", el.src);
        img.setAttribute("alt", el.alt);
        img.className = "sy-image";
        img.style.width = "100%";
        img.style.height = "100%";
        wrapper.appendChild(img);
        break;
      }

      case "field": {
        const span = document.createElement("span");
        span.className = "sy-field";
        const val = state.variables[el.variable];
        span.textContent = val !== undefined ? String(val) : "";
        wrapper.appendChild(span);
        break;
      }

      default: {
        const _exhaustive: never = el;
        void _exhaustive;
        break;
      }
    }

    cardEl.appendChild(wrapper);
  }

  stackWrapper.appendChild(cardEl);
  stackWrapper.appendChild(rings);
  root.appendChild(stackWrapper);
}

// ---------------------------------------------------------------------------
// Element positioning helper

function positionElement(wrapper: HTMLElement, el: StackElement): void {
  wrapper.style.left = `${el.x}px`;
  wrapper.style.top = `${el.y}px`;
  wrapper.style.width = `${el.w}px`;
  wrapper.style.height = `${el.h}px`;
}

// ---------------------------------------------------------------------------
// Button / tile builder

function buildButtonElement(
  el: ButtonElement,
  isQuizCard: boolean,
  totalButtons: number,
  buttonIndex: number,
  state: RuntimeState,
  navigate: (id: string, automatic: boolean) => void,
  playSound: (sound: "cheer" | "buzz") => void,
  ariaLive: HTMLElement,
): HTMLButtonElement {
  const isAnswerTile = isQuizCard && totalButtons >= 2 && totalButtons <= 4;
  const slot = isAnswerTile ? TILE_SLOTS[buttonIndex % 4] : undefined;

  const btn = document.createElement("button");

  if (slot) {
    // ---- Answer tile ----
    btn.className = "sy-tile";
    btn.style.backgroundColor = slot.color;
    btn.style.color = slot.textColor;

    const shapeContainer = document.createElement("span");
    shapeContainer.className = "sy-tile-shape";
    shapeContainer.style.color = slot.textColor;
    injectShapeSvg(shapeContainer, slot.shapePath);
    btn.appendChild(shapeContainer);

    const labelSpan = document.createElement("span");
    labelSpan.textContent = el.label;
    btn.appendChild(labelSpan);
  } else {
    // ---- Generic button ----
    btn.className = "sy-button";
    btn.textContent = el.label;
  }

  btn.addEventListener("click", () => {
    handleButtonClick(btn, el, slot, state, navigate, playSound, ariaLive);
  });

  return btn;
}

// ---------------------------------------------------------------------------
// Button click handler — show feedback, hold, then navigate

function handleButtonClick(
  btn: HTMLButtonElement,
  el: ButtonElement,
  slot: (typeof TILE_SLOTS)[number] | undefined,
  state: RuntimeState,
  navigate: (id: string, automatic: boolean) => void,
  playSound: (sound: "cheer" | "buzz") => void,
  ariaLive: HTMLElement,
): void {
  const hasPositiveScore = el.actions.some(
    (a) => a.type === "score" && a.delta > 0,
  );

  // Disable all tiles immediately — prevents double-clicks during the hold.
  const cardEl = btn.closest(".sy-card");
  if (cardEl) {
    cardEl.querySelectorAll<HTMLButtonElement>(".sy-tile, .sy-button").forEach(
      (t) => { t.disabled = true; },
    );
  }

  // Separate non-goto actions (score, sound, set) from the goto action.
  // We fire the non-goto actions immediately, then delay the goto.
  const gotoAction = el.actions.find((a) => a.type === "goto");
  const preActions = el.actions.filter((a) => a.type !== "goto");

  // Fire score/sound/set actions now (no navigation yet).
  dispatch(preActions, state, _noNav, playSound);

  if (slot) {
    if (hasPositiveScore) {
      // Correct: stamp + aria-live + cheer already played via preActions (sound action).
      // Show stamp overlay.
      showCorrectStamp(btn, ariaLive);
      // The cheer sound action is in preActions above, but if the stack author
      // only put score+goto (no explicit sound action), fire cheer manually.
      const hasSoundAction = el.actions.some((a) => a.type === "sound");
      if (!hasSoundAction) playSound("cheer");

      // Hold 900 ms, then fire goto.
      setTimeout(() => {
        if (gotoAction && gotoAction.type === "goto") {
          navigate(gotoAction.cardId, false);
        }
      }, HOLD_CORRECT_MS);
    } else {
      // Wrong: shake + buzz.
      triggerTileShake(btn);
      const hasSoundAction = el.actions.some((a) => a.type === "sound");
      if (!hasSoundAction) playSound("buzz");

      // Hold 600 ms, then fire goto.
      setTimeout(() => {
        if (gotoAction && gotoAction.type === "goto") {
          navigate(gotoAction.cardId, false);
        }
      }, HOLD_WRONG_MS);
    }
  } else {
    // Non-tile button: fire goto immediately.
    if (gotoAction && gotoAction.type === "goto") {
      navigate(gotoAction.cardId, false);
    }
  }
}

// ---------------------------------------------------------------------------
// Correct-answer stamp overlay

function showCorrectStamp(tileBtn: HTMLButtonElement, ariaLive: HTMLElement): void {
  const stamp = document.createElement("span");
  stamp.className = "sy-stamp sy-stamp-animate";
  stamp.textContent = "CORRECT ✓";
  stamp.setAttribute("aria-hidden", "true");
  tileBtn.appendChild(stamp);

  // Announce via aria-live.
  ariaLive.textContent = "";
  requestAnimationFrame(() => {
    ariaLive.textContent = "Correct";
  });
}

// ---------------------------------------------------------------------------
// Wrong-answer tile shake

function triggerTileShake(tileBtn: HTMLButtonElement): void {
  tileBtn.classList.remove("sy-tile-shake");
  void tileBtn.offsetWidth; // force reflow
  tileBtn.classList.add("sy-tile-shake");

  tileBtn.addEventListener(
    "animationend",
    () => {
      const mark = document.createElement("span");
      mark.textContent = " ✗";
      mark.style.opacity = "0.4";
      mark.style.color = COLOR.stamp;
      mark.style.fontSize = "0.8em";
      mark.setAttribute("aria-hidden", "true");
      tileBtn.appendChild(mark);
    },
    { once: true },
  );
}

// ---------------------------------------------------------------------------
// Private helpers

function _noop(_sound: "cheer" | "buzz"): void { /* intentional no-op */ }
function _noNav(_id: string): void { /* intentional no-op — used for pre-goto actions */ }
