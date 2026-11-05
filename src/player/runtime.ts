// src/player/runtime.ts
// Player runtime state and action dispatcher.
// No framework. No external dependencies. Vanilla TypeScript.

import type { Stack, Action } from "../shared/types.js";

// ---------------------------------------------------------------------------
// Runtime state

export interface RuntimeState {
  /** The stack being played. */
  readonly stack: Stack;
  /** Runtime variables — always contains at least `score: 0`. */
  variables: Record<string, string | number>;
  /** ID of the card currently being displayed. */
  currentCardId: string;
  /**
   * Counter of consecutive automatic navigations (card-level goto actions).
   * Reset to 0 on any user-initiated (button-click) navigation.
   * If this reaches 20 the player shows a fatal error and stops navigating.
   */
  autoNavCount: number;
}

// ---------------------------------------------------------------------------
// Factory

/**
 * Initialise runtime state for a stack.
 * `variables` starts with `score: 0`.
 * `currentCardId` is the first card in the deck.
 */
export function createRuntime(stack: Stack): RuntimeState {
  return {
    stack,
    variables: { score: 0 },
    currentCardId: stack.cards[0]!.id,
    autoNavCount: 0,
  };
}

/**
 * Reset runtime state for a fresh play-through: score back to zero, every other
 * variable cleared, and the auto-navigation guard reset. Used by the end card's
 * "Play Again" button so a class can go again from the start with a clean score
 * (built-app review round 3, P2 #5). The stack itself is unchanged.
 */
export function resetRuntime(state: RuntimeState): void {
  state.variables = { score: 0 };
  state.autoNavCount = 0;
}

// ---------------------------------------------------------------------------
// Dispatcher

/**
 * Process a list of actions against the current state.
 *
 * - `goto`  — calls `navigate(cardId)` then stops processing further actions.
 * - `score` — adds `action.delta` to `state.variables.score`.
 * - `set`   — assigns `action.value` to `state.variables[action.variable]`.
 * - `sound` — calls `playSound(action.sound)` (injected dependency, may be a
 *             no-op in environments without an AudioContext).
 *
 * @param actions   - Ordered list of actions to process.
 * @param state     - Mutable runtime state (mutated in-place).
 * @param navigate  - Callback invoked by a `goto` action; receives the target card id.
 * @param playSound - Optional callback for `sound` actions; defaults to no-op.
 */
export function dispatch(
  actions: Action[],
  state: RuntimeState,
  navigate: (id: string) => void,
  playSound: (sound: "cheer" | "buzz") => void = _noop,
): void {
  for (const action of actions) {
    switch (action.type) {
      case "goto": {
        navigate(action.cardId);
        // A goto stops all further action processing.
        return;
      }
      case "score": {
        const current = state.variables["score"];
        state.variables["score"] =
          (typeof current === "number" ? current : 0) + action.delta;
        break;
      }
      case "set": {
        state.variables[action.variable] = action.value;
        break;
      }
      case "sound": {
        playSound(action.sound);
        break;
      }
      default: {
        // Exhaustiveness guard — TypeScript will error here if a new action
        // type is added to the union without a corresponding case.
        const _exhaustive: never = action;
        void _exhaustive;
        break;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Private helpers

function _noop(_sound: "cheer" | "buzz"): void {
  // intentional no-op default
}
