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
import { dispatch, resetRuntime } from "./runtime.js";
import { fitQuestion, fitBody, fitTileLabel, fitText, MIN_FONT } from "../shared/fitText.js";
import { gotoOf } from "../shared/flow.js";

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
  /**
   * The card to move to when this card offers no way forward (TASK-26b). The
   * PLAYER passes the next card in deck order; the editor's canvas passes
   * nothing, so the editor still shows exactly what is stored. With it set:
   *   - a button with no `goto` goes to this card instead of freezing the card,
   *   - a card with nothing to press (a flash card with no Next, a story with no
   *     choices) gets a "Next Card" button.
   * A pupil can never be stranded on a card.
   */
  nextCardId?: string;
}

/** A copy of `el` with a `goto` to `fallbackNext` when it has none. */
function withForward(el: ButtonElement, fallbackNext: string | undefined): ButtonElement {
  if (fallbackNext === undefined || gotoOf(el.actions) !== null) return el;
  return { ...el, actions: [...el.actions, { type: "goto", cardId: fallbackNext }] };
}

/** Apply a fitted font size to an element only when it differs from the CSS default. */
function applyFit(
  node: HTMLElement,
  fit: { size: number; lineHeight: number },
  defaultSize: number,
): void {
  if (fit.size === defaultSize) return;
  node.style.fontSize = `${fit.size}px`;
  node.style.lineHeight = `${fit.lineHeight}px`;
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
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Question text — quiz / flash heading ---- */
/* line-height is 64px = two 32px rule bands, so the text baseline lands ON a
   ruled line (the copybook look) instead of a rule striking through the glyph
   mid-height at large scales (J3 D3, 1920×1080). */
.sy-question {
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 64px;
  color: var(--color-ink);
}

/* ---- Flash card (play) — front shows the term only; a tap flips to the back
   (the explanation in body type), a tap flips back. Matches
   docs/design/maker/play-flash-back.html. ---- */
.sy-flash {
  position: absolute;
  inset: 0;
  z-index: 1;
  cursor: pointer;
}
.sy-flash:focus-visible {
  outline: 3px solid var(--color-ink);
  outline-offset: -3px;
  border-radius: var(--radius-card);
}
/* Front: the term, large and centred. */
.sy-flash-term {
  position: absolute;
  left: 48px;
  top: 232px;
  width: 704px;
  text-align: center;
  font-size: var(--text-question);   /* 44px */
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}
/* Back: the term, small, at the top. */
.sy-flash-term-small {
  position: absolute;
  left: 48px;
  top: 104px;
  width: 704px;
  font-size: 32px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  line-height: 1.3;
  color: var(--color-ink);
}
/* Back: the explanation, in body type (NOT heading type). */
.sy-flash-back {
  position: absolute;
  left: 48px;
  top: 200px;
  width: 704px;
  height: 280px;
  font-size: 26px;
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 40px;
  color: var(--color-ink);
}
/* The "tap to flip" hint, bottom-LEFT on both sides. Width is capped to the
   left column (ends at x=392) so the bottom-right "Next Card" button (which
   starts at x=408) can never cover it — the Irish-deck overlap where "Next
   Card" sat on top of "Tap the card to flip back" (built-app review round 3,
   P1 #2). Left-aligned, never centred. */
.sy-flash-hint {
  position: absolute;
  left: 48px;
  top: 524px;
  width: 344px;
  text-align: left;
  font-size: var(--text-meta);       /* 20px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.3;
  color: #4a5878;
}
/* "Next Card" shown on the BACK only, bottom-RIGHT, clear of the hint on its
   left (x 408..752) and below the explanation (which ends by y 480). */
.sy-flash-next {
  position: absolute;
  left: 408px;
  top: 496px;
  width: 344px;
  height: 56px;
}

/* ---- Meta text (Card N of M) ---- */
.sy-meta {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 400;
  line-height: 1.5;
  color: var(--color-ink);
}

/* ---- Field span ---- */
.sy-field {
  font-size: var(--text-meta);       /* 18px */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
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
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
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
/* Long labels WRAP rather than being cut off with an ellipsis ("Norsemen
   from…" in the class player — J1/J3, 5 Nov panel). The renderer fits the font
   to the tile (src/shared/fitText.ts), so up to three lines sit inside it; the
   clamp is only a last-resort guard. */
.sy-tile .sy-tile-label {
  flex: 1 1 auto;
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
  overflow-wrap: break-word;
  line-height: 1.15;
}

/* ---- Generic button (story branch / nav) — chunky paper tab with a pressed
   bottom edge and bold label, per design-system "story buttons as paper tabs". */
.sy-button {
  border: 2px solid var(--color-ink);
  border-bottom-width: 3px;
  border-radius: 10px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: var(--text-tile);       /* 32px — reads as a chunky tab */
  font-family: 'Stackyard Reading', 'Arial', sans-serif;
  font-weight: 700;
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
/* The earned ink stamp straddles the tile's TOP edge on the label side, mostly
   over the paper above the tile (top:-24px; left:64px), rotated -8deg. It is a
   transparent ink stamp (mix-blend-mode: multiply) — not a paper sticker — so
   the stamp red sits on the 4.67:1 paper pairing and never over the answer word
   (design-system Rubber stamp feedback). */
.sy-stamp {
  position: absolute;
  top: -34px;
  left: 64px;
  right: auto;
  bottom: auto;
  transform: rotate(-8deg) scale(1);
  color: var(--color-stamp);
  font-size: 30px;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  text-transform: uppercase;
  background: transparent;
  mix-blend-mode: multiply;
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 4px 10px;
  opacity: 0.92;
  pointer-events: none;
  white-space: nowrap;
  z-index: 20;
}

/* ---- Wrong-answer ✗ stamp ---- */
/* After the shake, a boxed ✗ lands at FULL strength (not a faint mark) over the
   paper at the tile's top edge — same placement as CORRECT, so it reads on the
   4.67:1 paper pairing on a washed-out projector (design-system). */
.sy-wrong-stamp {
  position: absolute;
  top: -24px;
  left: 64px;
  transform: rotate(-8deg);
  color: var(--color-stamp);
  font-size: 44px;
  line-height: 1;
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  background: transparent;
  mix-blend-mode: multiply;
  border: 3px solid var(--color-stamp);
  border-radius: 4px;
  padding: 2px 12px;
  opacity: 1;
  pointer-events: none;
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
/* End-card stamp collection: one 64px slot per question. Earned slots carry a
   red ✓ stamp (rotated a little, uneven); the rest are empty dashed ink
   outlines. Score = stamps (design-system "the end card is a stamp
   collection"). */
.sy-end-stamps {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  max-width: 620px;
}
.sy-end-slot {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  box-sizing: border-box;
}
.sy-end-slot-empty {
  border: 2px dashed var(--color-ink);
  opacity: 0.3;
}
.sy-end-slot-earned {
  color: var(--color-stamp);
  border: 3px solid var(--color-stamp);
  font-family: 'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif;
  font-weight: 800;
  font-size: 34px;
  line-height: 1;
  opacity: 0.92;
}
/* "Play Again" paper tab under the stamp grid. A normal navy button — never
   stamp red (earned-stamp colour only). */
.sy-end-again {
  margin-top: 8px;
}
.sy-end-again-btn {
  width: auto;
  height: auto;
  min-height: 56px;
  padding: 12px 32px;
  border: 2px solid var(--color-ink);
  border-bottom-width: 4px;
  background: var(--color-paper);
  color: var(--color-ink);
  font-size: 24px;
  font-weight: 700;
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

/* After a wrong pick, the right answer is revealed with a faint INK outline
   (not stamp red — this is not an earned stamp) so pupils learn which one it
   was before the card advances. */
.sy-tile-reveal {
  outline: 3px solid var(--color-ink);
  outline-offset: 2px;
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

  // Stamp collection — one 64px slot per question. Earned slots (score) carry a
  // red ✓ stamp at a slight rotation; the rest are empty dashed ink outlines.
  if (total > 0) {
    const stampsRow = document.createElement("div");
    stampsRow.className = "sy-end-stamps";
    stampsRow.setAttribute(
      "aria-label",
      `${score} of ${total} stamp${total !== 1 ? "s" : ""} earned`,
    );
    const rotations = [-8, -5, -10, -6, -9, -4, -7];
    for (let i = 0; i < total; i++) {
      const slot = document.createElement("span");
      if (i < score) {
        slot.className = "sy-end-slot sy-end-slot-earned";
        slot.textContent = "✓";
        const rot = rotations[i % rotations.length] ?? -8;
        slot.style.transform = `rotate(${rot}deg)`;
      } else {
        slot.className = "sy-end-slot sy-end-slot-empty";
      }
      slot.setAttribute("aria-hidden", "true");
      stampsRow.appendChild(slot);
    }
    container.appendChild(stampsRow);
  }

  // Announce to screen readers
  ariaLive.textContent = `${headingText}. Score ${score} of ${total}.`;

  // "Play Again" — a paper tab under the stamp grid that restarts the whole
  // deck from card 1 with the score reset (built-app review round 3, P2 #5). A
  // class that wants a second go shouldn't have to reload the file. This is a
  // normal navy button, never stamp red (that stays for earned stamps only).
  const firstCardId = state.stack.cards[0]?.id;
  if (firstCardId !== undefined) {
    const againWrap = document.createElement("div");
    againWrap.className = "sy-end-again";
    const again = document.createElement("button");
    again.className = "sy-button sy-end-again-btn";
    again.setAttribute("data-testid", "play-again");
    again.textContent = "Play Again";
    again.addEventListener("click", () => {
      resetRuntime(state);
      navigate(firstCardId, false);
    });
    againWrap.appendChild(again);
    container.appendChild(againWrap);
  }

  // If the end card has any button elements, render them (e.g. a custom link)
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
// Flash-card renderer
//
// A flash card shows the TERM on the front. Tapping it (or pressing
// Enter/Space when focused) flips the card over to the BACK — the explanation
// in body type — with the same rotateX flip the class sees on a card advance.
// Tapping again flips back. "Next Card" appears on the BACK only, bottom-right,
// so it never overlaps the term or the explanation (built-app review P0 #1).
// Matches docs/design/maker/play-flash-back.html.
//
// Convention (matches demoStack / readyMadeStacks and the generator prompt):
//   - the FIRST text element is the term (front),
//   - the SECOND text element, if any, is the explanation (back),
//   - button elements ("Next Card") are shown on the back only.
// A flash card with a single text element simply shows that term with no back.

function flipDurationOk(): boolean {
  try {
    return !(
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return true;
  }
}

function renderFlashCard(
  card: Card,
  cardEl: HTMLElement,
  state: RuntimeState,
  navigate: (id: string, automatic: boolean) => void,
  playSound: (sound: "cheer" | "buzz") => void,
  ariaLive: HTMLElement,
  nextCardId?: string,
): void {
  const texts = card.elements.filter(
    (e): e is Extract<StackElement, { type: "text" }> => e.type === "text",
  );
  const termText = texts[0]?.content ?? "";
  const backText = texts[1]?.content ?? "";
  // Every button gets a way on (a missing goto falls back to the next card), and
  // a flash card with NO button at all gets a "Next Card" — a pupil must never
  // be stranded (TASK-26b: the AI's one-text flash cards froze the class).
  let buttons = card.elements
    .filter((e): e is ButtonElement => e.type === "button")
    .map((b) => withForward(b, nextCardId));
  if (buttons.length === 0 && nextCardId !== undefined && gotoOf(card.actions) === null) {
    buttons = [
      {
        type: "button", id: "sy-next", x: 408, y: 496, w: 344, h: 72,
        label: "Next Card",
        actions: [{ type: "goto", cardId: nextCardId }],
      },
    ];
  }
  const hasBack = backText.trim().length > 0;

  // A single tappable surface over the whole card (except the Next Card button)
  // that flips front ↔ back. Keyboard-focusable so a pupil on a laptop can flip
  // with Enter/Space.
  const surface = document.createElement("div");
  surface.className = "sy-flash";
  if (hasBack) {
    surface.setAttribute("role", "button");
    surface.setAttribute("tabindex", "0");
    surface.setAttribute(
      "aria-label",
      "Flash card. Tap to flip between the word and its explanation.",
    );
  }
  cardEl.appendChild(surface);

  let side: "front" | "back" = "front";

  const paint = (): void => {
    surface.innerHTML = "";

    if (side === "front") {
      const term = document.createElement("p");
      term.className = "sy-flash-term";
      term.textContent = termText;
      // The term sits in a 704 × 200 area above the hint and Next button.
      applyFit(term, fitQuestion(termText, 704, 200), 44);
      surface.appendChild(term);

      if (hasBack) {
        const hint = document.createElement("p");
        hint.className = "sy-flash-hint";
        hint.textContent = "Tap the card to see the answer";
        surface.appendChild(hint);
      }
      ariaLive.textContent = termText;
    } else {
      const term = document.createElement("p");
      term.className = "sy-flash-term-small";
      term.textContent = termText;
      applyFit(
        term,
        fitText(termText, { w: 704, h: 88, maxSize: 32, minSize: 24, lineHeight: (sz) => Math.round(sz * 1.3) }),
        32,
      );
      surface.appendChild(term);

      const back = document.createElement("p");
      back.className = "sy-flash-back";
      back.textContent = backText;
      applyFit(
        back,
        fitText(backText, { w: 704, h: 280, maxSize: 26, minSize: MIN_FONT, lineHeight: (sz) => Math.round(sz * 1.54) }),
        26,
      );
      surface.appendChild(back);

      const hint = document.createElement("p");
      hint.className = "sy-flash-hint";
      hint.textContent = "Tap the card to flip back";
      surface.appendChild(hint);

      ariaLive.textContent = backText
        ? `${termText}: ${backText}`
        : termText;
    }

    // "Next Card" on the back, bottom-right, clear of the text. A card with NO
    // back can never be flipped, so there Next shows on the front too — it used
    // to appear on the back only, which stranded the class on the one-text flash
    // cards the model writes (TASK-26b).
    if (side === "back" || !hasBack) {
      for (const el of buttons) {
        const wrapper = document.createElement("div");
        wrapper.className = "sy-flash-next";
        const btn = document.createElement("button");
        btn.className = "sy-button";
        btn.textContent = el.label;
        // Stop a Next Card click from also flipping the card.
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          dispatch(el.actions, state, (id) => navigate(id, false), playSound);
        });
        wrapper.appendChild(btn);
        surface.appendChild(wrapper);
      }
    }
  };

  const flip = (): void => {
    if (!hasBack) return;
    side = side === "front" ? "back" : "front";
    paint();
    // Replay the card flip (rotateX from the ring edge) on the card itself,
    // the same motion the class sees on a card advance — unless reduced motion.
    if (flipDurationOk()) {
      cardEl.style.transformOrigin = "top center";
      // Restart the animation reliably.
      cardEl.style.animation = "none";
      void cardEl.offsetWidth;
      cardEl.style.animation = "card-enter 240ms ease-out";
    }
  };

  surface.addEventListener("click", flip);
  surface.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      flip();
    }
  });

  paint();
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

  // ---- Flash card: front/back flip (special rendering) ----
  // A real, playable flash card has a back explanation and/or a "Next Card"
  // button — flip it front↔back. The editor previews ONE side at a time by
  // passing a derived flash card with a single text element and no button; that
  // falls through to the regular element path below so the editor keeps its
  // per-element `.sy-element` wrappers for click-selection.
  if (card.kind === "flash") {
    const flashTexts = card.elements.filter((e) => e.type === "text");
    const flashButtons = card.elements.filter((e) => e.type === "button");
    const isPlayableFlash = flashTexts.length >= 2 || flashButtons.length >= 1;
    if (isPlayableFlash) {
      renderFlashCard(card, cardEl, state, navigate, playSound, ariaLive, chrome.nextCardId);
      stackWrapper.appendChild(cardEl);
      stackWrapper.appendChild(rings);
      root.appendChild(stackWrapper);
      return;
    }
  }

  // ---- Regular card: render elements ----
  const isQuizCard = card.kind === "quiz";
  // Answer tiles are the quiz-card buttons that DO something (have at least one
  // action — score/sound/goto). A plain button added from the toolbar starts
  // with no actions, so it renders as a generic button and never restyles the
  // four coloured, shaped answer tiles (built-app review P1 "Add Button
  // destroys the quiz"). The tile colour/shape is the button's index among the
  // answer buttons only.
  const answerButtons = isQuizCard
    ? card.elements.filter(
        (el): el is ButtonElement =>
          el.type === "button" && el.actions.length > 0,
      )
    : [];
  let answerSlotIndex = 0;
  // Only the FIRST text element on a quiz/flash card is the big question token;
  // any later text (e.g. an image credit line) renders as small body text, so a
  // credit doesn't shout in 44px (TASK-23 d).
  let questionTextPlaced = false;

  for (const el of card.elements) {
    const wrapper = document.createElement("div");
    wrapper.className = "sy-element";
    positionElement(wrapper, el);

    switch (el.type) {
      case "text": {
        const p = document.createElement("p");
        // Quiz and flash cards use the question token for their FIRST text.
        const isQuestion = (isQuizCard || card.kind === "flash") && !questionTextPlaced;
        p.className = isQuestion ? "sy-question" : "sy-text";
        if (isQuestion) questionTextPlaced = true;
        p.textContent = el.content;
        // Fit the text to its box so a long question can't run into the answer
        // tiles (TASK-26c). Steps the font down from the token size.
        if (isQuestion) applyFit(p, fitQuestion(el.content, el.w, el.h), 44);
        else applyFit(p, fitBody(el.content, el.w, el.h), 22);
        wrapper.appendChild(p);
        break;
      }

      case "button": {
        const isAnswer = isQuizCard && el.actions.length > 0;
        const btn = buildButtonElement(
          // A button with no goto still moves on (TASK-26b): it never freezes.
          withForward(el, chrome.nextCardId),
          isAnswer,
          answerButtons.length,
          isAnswer ? answerSlotIndex : 0,
          state,
          navigate,
          playSound,
          ariaLive,
        );
        wrapper.appendChild(btn);
        if (isAnswer) answerSlotIndex++;
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

  // A card with nothing to press and no auto-advance would strand the class.
  // In play (nextCardId set) it gets a "Next Card" button (TASK-26b).
  if (
    chrome.nextCardId !== undefined &&
    gotoOf(card.actions) === null &&
    !card.elements.some((e) => e.type === "button")
  ) {
    const wrapper = document.createElement("div");
    wrapper.className = "sy-element";
    const rect = { x: 408, y: 496, w: 344, h: 72 };
    wrapper.style.left = `${rect.x}px`;
    wrapper.style.top = `${rect.y}px`;
    wrapper.style.width = `${rect.w}px`;
    wrapper.style.height = `${rect.h}px`;
    const next = withForward(
      { type: "button", id: "sy-next", ...rect, label: "Next Card", actions: [] },
      chrome.nextCardId,
    );
    wrapper.appendChild(
      buildButtonElement(next, false, 0, 0, state, navigate, playSound, ariaLive),
    );
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
  isAnswerTile: boolean,
  _answerCount: number,
  slotIndex: number,
  state: RuntimeState,
  navigate: (id: string, automatic: boolean) => void,
  playSound: (sound: "cheer" | "buzz") => void,
  ariaLive: HTMLElement,
): HTMLButtonElement {
  const slot = isAnswerTile ? TILE_SLOTS[slotIndex % 4] : undefined;

  const btn = document.createElement("button");

  if (slot) {
    // ---- Answer tile ----
    btn.className = "sy-tile";
    btn.style.backgroundColor = slot.color;
    btn.style.color = slot.textColor;
    // Mark the correct tile so a wrong pick can reveal it before advancing
    // (built-app review round 2, P2 #8). An editing/runtime state, not an
    // earned stamp — shown as a faint ink outline, never red.
    if (el.actions.some((a) => a.type === "score" && a.delta > 0)) {
      btn.setAttribute("data-correct", "true");
    }

    const shapeContainer = document.createElement("span");
    shapeContainer.className = "sy-tile-shape";
    shapeContainer.style.color = slot.textColor;
    injectShapeSvg(shapeContainer, slot.shapePath);
    btn.appendChild(shapeContainer);

    const labelSpan = document.createElement("span");
    labelSpan.className = "sy-tile-label";
    labelSpan.textContent = el.label;
    // Fit the label to its tile: a two- or three-line answer shrinks to sit
    // inside it instead of overflowing (TASK-26c, J1/J2).
    applyFit(labelSpan, fitTileLabel(el.label, el.w, el.h), 32);
    btn.appendChild(labelSpan);
  } else {
    // ---- Generic button ----
    btn.className = "sy-button";
    btn.textContent = el.label;
    applyFit(
      btn,
      fitText(el.label, {
        w: Math.max(40, el.w - 36),
        h: Math.max(24, el.h - 20),
        maxSize: 32,
        minSize: MIN_FONT,
        lineHeight: (sz) => Math.round(sz * 1.15),
        charWidth: 0.56,
      }),
      32,
    );
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

  // Disable all tiles immediately — prevents double-clicks during the hold. But
  // only when this click actually leads somewhere: a plain button with no goto
  // (e.g. one made with "Add Button" and never linked) used to grey out every
  // button on the card and then do nothing, stranding the class (J2 step 12).
  const cardEl = btn.closest(".sy-card");
  const leadsOn = el.actions.some((a) => a.type === "goto");
  if (cardEl && (slot !== undefined || leadsOn)) {
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

      // Reveal the right answer with a faint ink outline during the hold, so a
      // pupil learns which one it was before the card advances (built-app
      // review round 2, P2 #8). Ink, not stamp red — this is not an earned
      // stamp.
      if (cardEl) {
        const correct = cardEl.querySelector<HTMLElement>(
          '.sy-tile[data-correct="true"]',
        );
        if (correct && correct !== btn) {
          correct.classList.add("sy-tile-reveal");
        }
      }

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

  const landWrongStamp = (): void => {
    if (tileBtn.querySelector(".sy-wrong-stamp")) return;
    const mark = document.createElement("span");
    mark.className = "sy-wrong-stamp";
    mark.textContent = "✗";
    mark.setAttribute("aria-hidden", "true");
    tileBtn.appendChild(mark);
  };

  // Land the boxed ✗ after the shake settles. jsdom fires no animationend, so
  // also land it on a short fallback timer so tests and reduced-motion see it.
  tileBtn.addEventListener("animationend", landWrongStamp, { once: true });
  setTimeout(landWrongStamp, 200);
}

// ---------------------------------------------------------------------------
// Private helpers

function _noop(_sound: "cheer" | "buzz"): void { /* intentional no-op */ }
function _noNav(_id: string): void { /* intentional no-op — used for pre-goto actions */ }
