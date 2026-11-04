// tests/player-size.test.ts
// Player bundle size guard (TASK-17).
//
// Reads the pre-built player IIFE, gzips it at the default level with Node's
// built-in zlib, and asserts the compressed size is within the 50 KB budget
// (51,200 bytes). This check runs as part of `npm test`, so an over-budget
// bundle fails the build.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// tests/ → project root is one level up.
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const PLAYER_IIFE_PATH = path.join(
  PROJECT_ROOT,
  "dist",
  "player",
  "player.iife.js",
);

const BUDGET_BYTES = 51_200; // 50 KB

describe("player bundle size (TASK-17)", () => {
  it("is ≤ 50 KB (51,200 bytes) gzipped", () => {
    const raw = readFileSync(PLAYER_IIFE_PATH);
    const gzipped = gzipSync(raw); // default compression level
    expect(gzipped.byteLength).toBeLessThanOrEqual(BUDGET_BYTES);
  });
});
