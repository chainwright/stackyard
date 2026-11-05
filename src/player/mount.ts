// src/player/mount.ts
// mountPlayer(stack, root, options): the shared mount/navigation routine. The
// exported player entry and the Maker's "Try It" both call this one function,
// so Try It is literally the code the class gets.
//
// On every card change the active card flips up from the ring edge (the
// design-system card-exit → card-enter rotateX, 240 ms, top-centre origin),
// unless prefers-reduced-motion is set, in which case it is an instant swap.
//
// No framework. No external dependencies. Vanilla TypeScript.

import type { Stack } from "../shared/types.js";
import { createRuntime, dispatch } from "./runtime.js";
import { renderCard } from "./renderer.js";
import { applyScaling } from "./scaler.js";
import { playSound } from "./audio.js";
import { showFatalError } from "./errors.js";

/** Flip duration — matches the design-system card-exit/enter keyframes. */
const FLIP_MS = 240;

export interface MountOptions {
  /** Card to show first. Defaults to the first card in the deck. "Try It"
   *  passes the card being edited so play starts there, not at card 1. */
  startCardId?: string;
  /**
   * Flip the card up from the ring edge on every card change (default true).
   * Ignored when prefers-reduced-motion is set (an instant swap is used).
   */
  flip?: boolean;
  /**
   * Scaling strategy. Defaults to the full-viewport `applyScaling` the exported
   * player uses. The Maker's in-editor Try It passes its own area-fit scaler so
   * the live card sits inside the editor canvas, not over the whole page.
   * Returns a cleanup run on teardown.
   */
  scaler?: (root: HTMLElement) => () => void;
}

/** True when the user asked for reduced motion. */
function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  } catch {
    return false;
  }
}

/**
 * Mount the player for `stack` into `root`:
 *   - creates runtime state (score = 0, starting card),
 *   - applies scaling (viewport by default, or a caller-supplied area scaler),
 *   - flips the card up from the ring edge on every navigation,
 *   - defines navigateTo(id, automatic) with the auto-advance counter and the
 *     20-step fatal-error guard,
 *   - renders each card with renderCard and sounds with playSound.
 *
 * Returns a teardown function that stops the scaler and clears the root.
 */
export function mountPlayer(
  stack: Stack,
  root: HTMLElement,
  options: MountOptions = {},
): () => void {
  // 1. Create runtime state, starting at the requested card if valid.
  const state = createRuntime(stack);
  if (
    options.startCardId !== undefined &&
    stack.cards.some((c) => c.id === options.startCardId)
  ) {
    state.currentCardId = options.startCardId;
  }

  // 2. Apply scaling (caller may override; default is the viewport scaler).
  const scale = options.scaler ?? applyScaling;
  const stopScaling = scale(root);

  // Perspective on the root gives the rotateX flip its depth (top-centre
  // origin on the card). Harmless when flips are disabled.
  root.style.perspective = "1200px";

  const flipEnabled = options.flip !== false;

  // Timers for an in-flight flip, cleared on teardown so a late callback never
  // writes into a torn-down root.
  let flipTimer: ReturnType<typeof setTimeout> | null = null;

  /** Render `card` and, when flipping, run the enter animation on it. */
  function renderWithEnter(cardId: string, automatic: boolean): void {
    const card = stack.cards.find((c) => c.id === cardId);
    if (!card) {
      showFatalError(root);
      return;
    }
    state.currentCardId = cardId;

    // Derive the "Card N of M" chrome from the FULL deck position (the card
    // list counts every card, so the meta must too — same rule in both places).
    // The end card shows no meta line (the renderer omits it), but it still
    // counts toward the total.
    const deckIndex = stack.cards.findIndex((c) => c.id === cardId);
    const chrome =
      deckIndex >= 0
        ? { position: deckIndex + 1, total: stack.cards.length }
        : {};

    renderCard(card, root, state, navigateTo, playSound, chrome);

    if (flipEnabled && !prefersReducedMotion()) {
      const cardEl = root.querySelector<HTMLElement>(".sy-card");
      if (cardEl) {
        cardEl.style.transformOrigin = "top center";
        cardEl.style.animation = `card-enter ${FLIP_MS}ms ease-out`;
      }
    }

    // Fire card-level actions (e.g., auto-advance goto) with automatic=true.
    dispatch(card.actions, state, (id) => navigateTo(id, true), playSound);
  }

  // 3. Define the navigate function.
  function navigateTo(cardId: string, automatic: boolean): void {
    if (automatic) {
      state.autoNavCount++;
      if (state.autoNavCount > 20) {
        showFatalError(root);
        return;
      }
    } else {
      state.autoNavCount = 0;
    }

    if (!stack.cards.some((c) => c.id === cardId)) {
      showFatalError(root);
      return;
    }

    // Flip only on user-initiated moves (a tap). Card-level auto-advance
    // (automatic) renders immediately: it is usually a fast chain and must not
    // defer the loop guard behind a timer.
    const currentCardEl = root.querySelector<HTMLElement>(".sy-card");
    if (flipEnabled && !automatic && !prefersReducedMotion() && currentCardEl) {
      currentCardEl.style.transformOrigin = "top center";
      currentCardEl.style.animation = `card-exit ${FLIP_MS}ms ease-out forwards`;
      if (flipTimer !== null) clearTimeout(flipTimer);
      flipTimer = setTimeout(() => {
        flipTimer = null;
        renderWithEnter(cardId, automatic);
      }, FLIP_MS);
    } else {
      renderWithEnter(cardId, automatic);
    }
  }

  // 4. Render the first card. The initial mount has no outgoing card, so it
  //    runs only the enter half of the flip (no exit).
  renderWithEnter(state.currentCardId, false);

  // 5. Teardown.
  return function teardown(): void {
    if (flipTimer !== null) {
      clearTimeout(flipTimer);
      flipTimer = null;
    }
    stopScaling();
    root.style.perspective = "";
    root.innerHTML = "";
  };
}
