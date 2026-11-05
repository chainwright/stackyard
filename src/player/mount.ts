// src/player/mount.ts
// mountPlayer(stack, root): the mount/navigation routine extracted verbatim
// from src/player/index.ts (TASK-17a). The exported player entry and the
// Maker's Play mode both call this one function, so Play mode is literally the
// code the class gets. Pure refactor — no behaviour change.
//
// No framework. No external dependencies. Vanilla TypeScript.

import type { Stack } from "../shared/types.js";
import { createRuntime, dispatch } from "./runtime.js";
import { renderCard } from "./renderer.js";
import { applyScaling } from "./scaler.js";
import { playSound } from "./audio.js";
import { showFatalError } from "./errors.js";

/**
 * Mount the player for `stack` into `root`:
 *   - creates runtime state (score = 0, first card),
 *   - applies viewport scaling,
 *   - defines navigateTo(id, automatic) with the auto-advance counter and the
 *     20-step fatal-error guard,
 *   - renders each card with renderCard and sounds with playSound,
 *   - navigates to the first card.
 *
 * Returns a teardown function that disconnects the scaler's ResizeObserver and
 * clears the root.
 */
export function mountPlayer(stack: Stack, root: HTMLElement): () => void {
  // 1. Create runtime state.
  const state = createRuntime(stack);

  // 2. Apply viewport scaling to the root element.
  const stopScaling = applyScaling(root);

  // 3. Define the navigate function.
  function navigateTo(cardId: string, automatic: boolean): void {
    if (automatic) {
      // Increment the consecutive-auto-nav counter.
      state.autoNavCount++;
      if (state.autoNavCount > 20) {
        // Safety net: infinite-loop guard.
        showFatalError(root);
        return;
      }
    } else {
      // User-initiated navigation resets the counter.
      state.autoNavCount = 0;
    }

    // Find the target card.
    const card = stack.cards.find((c) => c.id === cardId);
    if (!card) {
      showFatalError(root);
      return;
    }

    // Update runtime state.
    state.currentCardId = cardId;

    // Render the card — button click handlers call navigate with automatic=false.
    renderCard(card, root, state, navigateTo, playSound);

    // Fire card-level actions (e.g., auto-advance goto).
    // These pass automatic=true so they count towards the loop guard.
    dispatch(
      card.actions,
      state,
      (id) => navigateTo(id, true),
      playSound,
    );
  }

  // 4. Navigate to the first card (user-initiated: resets counter).
  navigateTo(state.currentCardId, false);

  // 5. Teardown: stop scaling observer and clear the root.
  return function teardown(): void {
    stopScaling();
    root.innerHTML = "";
  };
}
