// tests/css-squeeze.test.ts
// TASK-34b2: the build-time CSS squeeze (vite.cssComments.ts) that pays for the
// class-results code. (TASK-35b: the floppy claim is now 6 with a margin; the
// squeeze is kept because it is tested, and nothing more is squeezed.)
// It must change nothing but CSS comments and CSS whitespace.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { squeezeCss, squeezeSource } from "../vite.cssComments.js";

const FILES = ["src/player/renderer.ts", "src/living/styles.ts"];
const CSS_TEMPLATE = /((?:PLAYER_STYLES|LIVING_STYLES) = `)[^`]*`/g;

/** The JS that esbuild emits for a file, with its CSS template emptied. */
function jsOnly(src: string): string {
  return transformSync(src.replace(CSS_TEMPLATE, "$1`"), { loader: "ts", minify: true }).code;
}

describe("TASK-34b2: the CSS squeeze only touches CSS", () => {
  it("TASK-34b2: outside the CSS templates, the squeezed files compile to exactly the same JavaScript", () => {
    for (const f of FILES) {
      const src = readFileSync(f, "utf8");
      expect(jsOnly(squeezeSource(src)), f).toBe(jsOnly(src));
    }
  });

  it("TASK-34b2: inside them, comments and spaces go; interpolations, selectors, media queries and content values stay", () => {
    expect(squeezeCss("\n/* note */\n:root {\n  --c:   ${COLOR.ink};\n}\n.a .b:focus-visible, .c > .d {\n  content: '';\n  opacity: 0.92;\n  margin: 0 0.5em;\n}\n@media (max-width: 699px) { .a { gap: 8px; } }\n".replace(/\/\* note \*\//, "")))
      .toBe(":root{--c:${COLOR.ink}}.a .b:focus-visible,.c>.d{content:'';opacity:.92;margin:0 .5em}@media (max-width:699px){.a{gap:8px}}");
    const squeezed = squeezeSource(readFileSync("src/player/renderer.ts", "utf8"));
    const css = /PLAYER_STYLES = `([^`]*)`/.exec(squeezed)![1]!;
    expect(css).not.toContain("/*");
    expect(css).toContain(".sy-end-code-block{");
    expect(css).toContain("${COLOR.paper}");
  });
});
