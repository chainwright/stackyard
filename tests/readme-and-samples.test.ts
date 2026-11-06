// tests/readme-and-samples.test.ts
// TASK-26m/n: the README tells judges the truth and the three sample lessons
// exist, validate, and need no network.

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { validate } from "../src/shared/validator.js";
import { SAMPLES } from "../scripts/make-samples.js";
import { READY_MADE_IMAGES } from "../src/shared/readyMadeImages.js";
import { creditFull } from "../src/shared/deckImageTypes.js";
import type { Stack } from "../src/shared/types.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const README = read("README.md");
/** The README with line wrapping flattened, for phrase checks. */
const FLAT = README.replace(/\s+/g, " ");

describe("TASK-26m: three sample lessons in samples/", () => {
  it("there are exactly the three listed in the generator", () => {
    expect(SAMPLES.map((s) => s.file)).toEqual(["vikings-in-ireland.html", "times-tables.html", "irish-words.html"]);
  });

  for (const { file, build } of SAMPLES) {
    describe(file, () => {
      const p = path.join(ROOT, "samples", file);

      it("exists, is under the 500 KB budget, and is a living file", () => {
        expect(existsSync(p)).toBe(true);
        expect(statSync(p).size).toBeLessThan(500 * 1024);
        const html = readFileSync(p, "utf8");
        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain("sy-teacher-tab");
      });

      it("embeds a valid stack that is the ready-made deck it claims to be", () => {
        const html = readFileSync(p, "utf8");
        const m = html.match(/<script id="stack-data"[^>]*>([\s\S]*?)<\/script>/)!;
        const stack = JSON.parse(m[1]!) as Stack;
        expect(validate(stack).valid).toBe(true);
        expect(stack.title).toBe(build().title);
      });

      it("loads nothing from the network (no external src/href/url/@import)", () => {
        const html = readFileSync(p, "utf8");
        expect(html).not.toMatch(/\b(?:src|href)\s*=\s*['"]?https?:\/\//i);
        expect(html).not.toMatch(/url\(\s*['"]?(?:https?:)?\/\//i);
        expect(html).not.toMatch(/@import/i);
        expect(html).not.toMatch(/<link[^>]+href\s*=\s*['"]?https?:/i);
      });

      it("is listed in the README", () => {
        expect(README).toContain(`samples/${file}`);
      });
    });
  }
});

describe("TASK-26m: the README is honest for judges", () => {
  it("no longer says the app 'still works offline' (only the exported file does)", () => {
    expect(README).not.toContain("so the app still works offline");
    expect(FLAT).toContain("Maker itself still needs its server");
  });

  it("documents the three STACKYARD_LLM_* switches in the env table", () => {
    for (const v of ["STACKYARD_LLM_JSON_MODE", "STACKYARD_LLM_TEMPERATURE", "STACKYARD_LLM_MAX_TOKENS"]) {
      expect(README, v).toContain(`| \`${v}\``);
    }
    // …and they are the same ones render.yaml sets.
    const render = read("render.yaml");
    for (const v of ["STACKYARD_LLM_JSON_MODE", "STACKYARD_LLM_TEMPERATURE", "STACKYARD_LLM_MAX_TOKENS"]) {
      expect(render, v).toContain(v);
    }
  });

  it("lists every picture with its creator, licence and link", () => {
    for (const img of Object.values(READY_MADE_IMAGES)) {
      expect(README, img.creditCreator).toContain(img.creditCreator);
      expect(README, img.creditSource).toContain(img.creditSource!);
      expect(creditFull(img)).toContain(img.creditSource!);
    }
    expect(README).toContain("Public Domain Mark 1.0");
  });

  it("is honest that one picture is a cartoon, not a photograph", () => {
    expect(README).toMatch(/cartoon of a pupil with an abacus/);
  });

  it("has a screenshot/GIF placeholder section", () => {
    expect(README).toMatch(/^## See it$/m);
    expect(README).toMatch(/GIF/);
  });

  it("labels the reference image as AI-generated, in the README and beside the file", () => {
    expect(FLAT).toMatch(/reference-stamp-pad-tiles\.png`? is an \*\*AI-generated concept image\*\*/);
    const note = read("docs/design/README.md");
    expect(note).toContain("reference-stamp-pad-tiles.png");
    expect(note).toMatch(/AI-generated/);
    expect(existsSync(path.join(ROOT, "docs/design/reference-stamp-pad-tiles.png"))).toBe(true);
    expect(read("docs/KIRO_LOG.md")).toContain("AI-generated concept image");
  });

  it("describes the living file and does not claim an unqualified 'only Stackyard'", () => {
    expect(README).toContain("### The living file");
    expect(README).not.toContain("what only Stackyard does");
    expect(README).not.toContain("What only Stackyard does");
  });
});

describe("TASK-26n: the tile shapes are documented as an accessibility feature", () => {
  it("is in the README", () => {
    expect(README).toMatch(/^## Accessibility: answer tiles carry a shape as well as a colour$/m);
    expect(FLAT).toMatch(/colour-blind pupil can say "the triangle"/);
    expect(README).toMatch(/deliberate/);
  });

  it("is in the design-system steering", () => {
    const ds = read(".kiro/steering/design-system.md");
    expect(ds).toMatch(/Accessibility note \(why the shapes exist\)/);
    expect(ds).toMatch(/colour-blind pupil can say "the triangle"/);
    expect(ds).toMatch(/not copied styling/);
  });
});
