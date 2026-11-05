// src/living/index.ts
// Living-file entry point (TASK-24). Compiled to a single IIFE by Vite
// (vite.living.config.ts) and inlined into an exported living file.
//
// The living file PLAYS by default (exactly as the class file), and carries a
// small "Teacher" tab that, behind a confirm, opens an offline in-file editor
// with a "Save a Copy" that writes a new self-contained living file. No server,
// no network, ever.
//
// No framework (keep the bundle small). Vanilla TypeScript built on the SHARED
// pure pieces: validator, operations, reachability, renderer + mountPlayer.

import { validate } from "../shared/validator.js";
import { showFatalError } from "../player/errors.js";
import { mountLivingApp } from "./livingApp.js";

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("player-root");
  if (!root) return;

  try {
    const dataEl = document.getElementById("stack-data");
    if (!dataEl) {
      showFatalError(root);
      return;
    }
    const parsed: unknown = JSON.parse(dataEl.textContent ?? "");
    const result = validate(parsed as Parameters<typeof validate>[0]);
    if (!result.valid) {
      showFatalError(root);
      return;
    }
    mountLivingApp(result.stack, root);
  } catch {
    showFatalError(root);
  }
});
