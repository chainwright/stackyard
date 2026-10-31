// src/player/index.ts
// Player entry point — wires up all player modules.
// Compiled to a single IIFE by Vite (vite.player.config.ts).
// No framework. No external dependencies. Vanilla TypeScript.

import { validate } from "../shared/validator.js";
import { createRuntime, dispatch } from "./runtime.js";
import { renderCard } from "./renderer.js";
import { applyScaling } from "./scaler.js";
import { playSound } from "./audio.js";
import { showFatalError } from "./errors.js";

// ---------------------------------------------------------------------------
// Bootstrap on DOMContentLoaded

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("player-root");
  if (!root) return; // Should never happen in a well-formed exported file.

  try {
    // 1. Read the embedded stack JSON.
    const dataEl = document.getElementById("stack-data");
    if (!dataEl) {
      showFatalError(root);
      return;
    }

    const rawJson = dataEl.textContent ?? "";
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed: unknown = JSON.parse(rawJson);

    // 2. Validate the stack.
    const result = validate(parsed as Parameters<typeof validate>[0]);
    if (!result.valid) {
      showFatalError(root);
      return;
    }

    const stack = result.stack;

    // 3. Create runtime state.
    const state = createRuntime(stack);

    // 4. Apply viewport scaling to the root element.
    applyScaling(root);

    // 5. Define the navigate function.
    function navigateTo(cardId: string, automatic: boolean): void {
      if (automatic) {
        // Increment the consecutive-auto-nav counter.
        state.autoNavCount++;
        if (state.autoNavCount > 20) {
          // Safety net: infinite-loop guard.
          showFatalError(root!);
          return;
        }
      } else {
        // User-initiated navigation resets the counter.
        state.autoNavCount = 0;
      }

      // Find the target card.
      const card = stack.cards.find((c) => c.id === cardId);
      if (!card) {
        showFatalError(root!);
        return;
      }

      // Update runtime state.
      state.currentCardId = cardId;

      // Render the card — button click handlers call navigate with automatic=false.
      renderCard(card, root!, state, navigateTo, playSound);

      // Fire card-level actions (e.g., auto-advance goto).
      // These pass automatic=true so they count towards the loop guard.
      dispatch(
        card.actions,
        state,
        (id) => navigateTo(id, true),
        playSound,
      );
    }

    // 6. Navigate to the first card (user-initiated: resets counter).
    navigateTo(state.currentCardId, false);
  } catch {
    // If anything throws before the first render, show the error message.
    showFatalError(root);
  }
});
