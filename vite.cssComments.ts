// vite.cssComments.ts
// TASK-34b: a build-only plugin for the two source files whose CSS ships as a
// template string (the player's PLAYER_STYLES and the living chrome's
// LIVING_STYLES). The minifier strips JS comments but cannot see inside a
// string, so ~6.7 KB of CSS commentary, plus the indentation and the spaces
// around ":", ";", "{", "}", "," and ">", rode in every lesson file.
//
// Squeezing them paid for the class-results feature (TASK-34b). TASK-35b moved
// the floppy claim to 6 with a margin (tests/export-size.test.ts); the squeeze
// is kept, because it is tested, and nothing more is squeezed.
// The source is untouched; only the bundle changes.
//
// Safe because:
// - outside the CSS strings only JS comments go (no "/*" or "*/" sits in a
//   string or a regex in either file; checked by tests/css-squeeze.test.ts);
// - inside them the only quoted CSS value is `content: ''`.

import type { Plugin } from "vite";

const FILES = [/[\\/]src[\\/]player[\\/]renderer\.ts$/, /[\\/]src[\\/]living[\\/]styles\.ts$/];
const CSS_START = /((?:PLAYER_STYLES|LIVING_STYLES) = `)([^`]*)`/g;

/** Squeeze one CSS template's text (no comments left, `${…}` kept as is). */
export function squeezeCss(css: string): string {
  return css
    .replace(/\s+/g, " ")
    .replace(/\s*([{};,>])\s*/g, "$1")
    .replace(/:\s+/g, ":")
    .replace(/;}/g, "}")
    .replace(/([:,( ])0\.(\d)/g, "$1.$2")
    .trim();
}

/** The whole transform, exported for the test. */
export function squeezeSource(code: string): string {
  const noComments = code.replace(/\/\*[\s\S]*?\*\//g, "");
  return noComments.replace(CSS_START, (_m, head: string, css: string) => `${head}${squeezeCss(css)}\``);
}

export function stripCssComments(): Plugin {
  return {
    name: "stackyard-squeeze-css",
    enforce: "pre",
    transform(code, id) {
      if (!FILES.some((r) => r.test(id))) return null;
      return { code: squeezeSource(code), map: null };
    },
  };
}
