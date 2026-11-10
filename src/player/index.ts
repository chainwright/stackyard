// src/player/index.ts
// Player entry point — a thin wrapper around mountPlayer (TASK-17a).
// Compiled to a single IIFE by Vite (vite.player.config.ts).
// No framework. No external dependencies. Vanilla TypeScript.

import { validate } from "../shared/validator.js";
import { mountPlayer } from "./mount.js";
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
    const parsed: unknown = JSON.parse(rawJson);

    // 2. Validate the stack.
    const result = validate(parsed as Parameters<typeof validate>[0]);
    if (!result.valid) {
      showFatalError(root);
      return;
    }

    // 3. Mount the player (shared with the Maker's Play mode).
    mountPlayer(result.stack, root, { scan: true, portrait: true });
  } catch {
    // If anything throws before the first render, show the error message.
    showFatalError(root);
  }
});
