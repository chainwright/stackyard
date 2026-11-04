// server/exporter.ts
// ExportValidationError — typed error class for all validation and
// path-security failures in the export pipeline.
//
// exportStack(stack) validates, inlines image assets, serialises the stack as
// an escape-safe JSON blob, reads the pre-built player IIFE, and returns the
// final self-contained HTML string. No file is written here; no environment
// variable is read here (see .kiro/specs/exporter/design.md security model).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validate } from "../src/shared/validator.js";
import { inlineImages } from "./inline-assets.js";
import { buildHtml } from "./html-template.js";
import type { Stack } from "../src/shared/types.js";

// ---------------------------------------------------------------------------
// Error type

/**
 * Thrown by the export pipeline for every validation or security failure.
 * Callers can inspect `error.errors` for machine-readable error codes.
 */
export class ExportValidationError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`Export validation failed: ${errors.join(", ")}`);
    this.name = "ExportValidationError";
    this.errors = errors;
    // Restore the prototype chain (needed when targeting pre-ES2015 runtimes).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ---------------------------------------------------------------------------
// Paths — resolved relative to this module, never from env vars.

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
// server/exporter.ts → project root is one level up.
const PROJECT_ROOT = path.resolve(MODULE_DIR, "..");
const DEFAULT_ASSETS_DIR = path.join(PROJECT_ROOT, "assets");
const PLAYER_IIFE_PATH = path.join(
  PROJECT_ROOT,
  "dist",
  "player",
  "player.iife.js",
);

// ---------------------------------------------------------------------------
// Escape-safe JSON serialisation

/**
 * Serialise `value` to JSON, then escape `<`, `>` and `/` to their `\uXXXX`
 * forms. JSON structural syntax uses none of these three characters, so they
 * only ever occur inside string values — escaping them in the output string
 * is safe and is restored exactly by `JSON.parse`.
 *
 * Effects:
 *   - `</script>` inside any string can never close the embedding
 *     `<script type="application/json">` block.
 *   - A URL such as `https://example.com` is serialised as
 *     `https:\u002f\u002fexample.com`, so no raw `https://` appears in the
 *     output (REQ-EXP-01), while the parsed value is byte-for-byte identical.
 */
function toEscapedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\//g, "\\u002f");
}

// ---------------------------------------------------------------------------
// Export pipeline

/**
 * Validates a stack and returns the exported, fully self-contained HTML
 * string.
 *
 * @param stack      The stack to export.
 * @param assetsDir  Directory relative image `src` values resolve against.
 *                   Defaults to the project's `assets/` directory.
 * @throws ExportValidationError on validation failure or an unsafe asset path.
 */
export async function exportStack(
  stack: Stack,
  assetsDir: string = DEFAULT_ASSETS_DIR,
): Promise<string> {
  // 1. Validate — wrap any failure in ExportValidationError (never a plain Error).
  const result = validate(stack);
  if (!result.valid) {
    throw new ExportValidationError(result.errors);
  }

  // 2. Inline image assets. Any ExportValidationError ("path-traversal")
  //    from inlineImages propagates unchanged.
  const inlinedStack = await inlineImages(stack, assetsDir);

  // 3. Serialise the inlined stack as an escape-safe JSON blob.
  const stackJson = toEscapedJson(inlinedStack);

  // 4. Read the pre-built player IIFE from disk.
  const playerIife = await fs.readFile(PLAYER_IIFE_PATH, "utf8");

  // 5. Assemble and return the final HTML document.
  return buildHtml({ title: stack.title, stackJson, playerIife });
}
