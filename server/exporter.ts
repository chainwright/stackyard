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
import { buildHtml, buildLivingHtml } from "./html-template.js";
import { toEscapedStackJson } from "../src/shared/escapeStackJson.js";
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
// The living-file runtime: the player PLUS the in-file editor and Save a Copy
// (TASK-24). Built by vite.living.config.ts into dist/living/living.iife.js.
const LIVING_IIFE_PATH = path.join(
  PROJECT_ROOT,
  "dist",
  "living",
  "living.iife.js",
);

// The three Latin-subset woff2 fonts the design system loads. They are inlined
// as base64 `@font-face` data URIs in the exported file so the class sees the
// real type with no internet (design-system.md "the exported HTML must carry
// the font notice"). The two `reading-*` files are the renamed
// ("Stackyard Reading") Modified Version of Atkinson Hyperlegible — their name
// tables carry no reserved name (scripts/rename-reading-font.py; guarded by
// tests/font-name.test.ts), so the base64 blob leaks no reserved name either.
const FONTS_DIR = path.join(PROJECT_ROOT, "src", "assets", "fonts");

interface FontFace {
  file: string;       // woff2 filename under FONTS_DIR
  family: string;     // CSS font-family presented to the page
  weight: string;     // font-weight descriptor
  /** OFL notice carried in a CSS comment above the @font-face (design-system). */
  notice: string[];
}

// Each notice is the font's copyright line, the licence statement, and the
// upstream source — the OFL-required notice that must travel with the font.
// The reading font uses ONLY the copyright line (never the reserved-name line),
// so the reserved font name "Atkinson" / "Hyperlegible" never appears.
const FONT_FACES: readonly FontFace[] = [
  {
    file: "bricolage.woff2",
    family: "Bricolage Grotesque",
    weight: "700 800",
    notice: [
      "Bricolage Grotesque",
      "Copyright 2022 The Bricolage Grotesque Project Authors",
      "SIL Open Font License 1.1 (no Reserved Font Name)",
      "Source: https://github.com/ateliertriay/bricolage",
    ],
  },
  {
    file: "reading-400.woff2",
    family: "Stackyard Reading",
    weight: "400",
    notice: [
      "Stackyard Reading (Latin subset, Modified Version under the SIL OFL 1.1)",
      "Copyright 2020 Braille Institute of America, Inc.",
      "SIL Open Font License 1.1",
      "Source: https://github.com/googlefonts/atkinson-hyperlegible",
    ],
  },
  {
    file: "reading-700.woff2",
    family: "Stackyard Reading",
    weight: "700",
    notice: [
      "Stackyard Reading (Latin subset, Modified Version under the SIL OFL 1.1)",
      "Copyright 2020 Braille Institute of America, Inc.",
      "SIL Open Font License 1.1",
      "Source: https://github.com/googlefonts/atkinson-hyperlegible",
    ],
  },
];

/**
 * Read the three design-system woff2 files and return a `<style>`-ready block
 * of `@font-face` rules, each with its base64 data URI `src` and an OFL notice
 * comment immediately above it. No external URL is loaded — the fonts are
 * embedded, so the exported file is fully self-contained and offline.
 */
async function buildFontFacesCss(fontsDir: string = FONTS_DIR): Promise<string> {
  const blocks: string[] = [];
  for (const face of FONT_FACES) {
    const bytes = await fs.readFile(path.join(fontsDir, face.file));
    const dataUri = `data:font/woff2;base64,${bytes.toString("base64")}`;
    const comment =
      "  /*\n" +
      face.notice.map((line) => `     ${line}`).join("\n") +
      "\n  */";
    blocks.push(
      comment +
        "\n  @font-face {\n" +
        `    font-family: '${face.family}';\n` +
        "    font-style: normal;\n" +
        `    font-weight: ${face.weight};\n` +
        "    font-display: swap;\n" +
        `    src: url(${dataUri}) format('woff2');\n` +
        "  }",
    );
  }
  return blocks.join("\n");
}

// ---------------------------------------------------------------------------
// Export pipeline
//
// Escape-safe JSON serialisation lives in src/shared/escapeStackJson.ts
// (toEscapedStackJson) so the server exporter and the living file's Save a Copy
// escape user text identically.

/**
 * Validate + inline-images + escape a stack, returning the parts both the
 * class export and the living export need. Throws ExportValidationError on a
 * validation or path failure (never a plain Error).
 */
async function prepare(
  stack: Stack,
  assetsDir: string,
): Promise<{ stackJson: string; fontFaces: string }> {
  const result = validate(stack);
  if (!result.valid) {
    throw new ExportValidationError(result.errors);
  }
  // Inline image assets. Any ExportValidationError ("path-traversal") from
  // inlineImages propagates unchanged.
  const inlinedStack = await inlineImages(stack, assetsDir);
  const stackJson = toEscapedStackJson(inlinedStack);
  // Inline the design-system fonts as base64 @font-face rules (OFL notices
  // included) so the file shows the real type offline.
  const fontFaces = await buildFontFacesCss();
  return { stackJson, fontFaces };
}

/**
 * Validates a stack and returns the exported, fully self-contained HTML string
 * — the CLASS file (play only, smaller).
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
  const { stackJson, fontFaces } = await prepare(stack, assetsDir);
  const playerIife = await fs.readFile(PLAYER_IIFE_PATH, "utf8");
  return buildHtml({ title: stack.title, stackJson, playerIife, fontFaces });
}

/**
 * Validates a stack and returns a LIVING-FILE HTML string (TASK-24): it plays
 * exactly like the class file, and also carries the offline in-file editor and
 * "Save a Copy". Same self-containment and escaping guarantees as
 * {@link exportStack}; the only difference is the embedded runtime (the living
 * bundle, which includes the player) and a Teacher tab.
 *
 * @throws ExportValidationError on validation failure or an unsafe asset path.
 */
export async function exportLivingStack(
  stack: Stack,
  assetsDir: string = DEFAULT_ASSETS_DIR,
): Promise<string> {
  const { stackJson, fontFaces } = await prepare(stack, assetsDir);
  const livingIife = await fs.readFile(LIVING_IIFE_PATH, "utf8");
  return buildLivingHtml({ title: stack.title, stackJson, livingIife, fontFaces });
}
