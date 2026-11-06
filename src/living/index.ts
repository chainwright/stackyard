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
//
// All of the start-up logic is in boot.ts (so a test can drive it); the pristine
// snapshot Save a Copy needs is taken there, before anything mounts.

import { bootLivingFile } from "./boot.js";

document.addEventListener("DOMContentLoaded", () => {
  bootLivingFile(document);
});
