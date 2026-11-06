// tests/fit-text.test.ts
// TASK-26c: text is fitted to its box instead of overflowing it. The estimate is
// pure (no DOM), so it is the same in the player, the editor and these tests.

import { describe, it, expect } from "vitest";
import {
  estimateLines,
  fitText,
  fitQuestion,
  fitBody,
  fitTileLabel,
  MIN_FONT,
} from "../src/shared/fitText.js";

describe("estimateLines", () => {
  it("one short line is one line", () => {
    expect(estimateLines("Dublin", 300, 32)).toBe(1);
  });

  it("wraps on word boundaries, never mid-word", () => {
    // 10 chars × 20px × 0.54 = 108px per word; a 120px box holds one word per line.
    expect(estimateLines("aaaaaaaaaa bbbbbbbbbb cccccccccc", 120, 20)).toBe(3);
  });

  it("counts explicit newlines and blank lines", () => {
    expect(estimateLines("one\ntwo\n\nfour", 700, 20)).toBe(4);
  });

  it("breaks a word wider than the box across lines", () => {
    expect(estimateLines("x".repeat(100), 100, 20)).toBeGreaterThan(5);
  });

  it("more width means fewer (or equal) lines — monotone", () => {
    const text = "Which people began raiding Ireland around the year 795 and why did they come";
    let prev = Infinity;
    for (const w of [200, 300, 400, 500, 704]) {
      const n = estimateLines(text, w, 30);
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });
});

describe("fitQuestion (the quiz question box is 704 × 160)", () => {
  it("leaves a short question at the full 44 px", () => {
    const f = fitQuestion("What is a longship?", 704, 160);
    expect(f.size).toBe(44);
    expect(f.lineHeight).toBe(64); // keeps the ruled-line rhythm
    expect(f.fits).toBe(true);
  });

  it("the Vikings question (two lines at 44 px) is unchanged", () => {
    const f = fitQuestion("Which people began raiding Ireland around the year 795?", 704, 160);
    expect(f.size).toBe(44);
    expect(f.fits).toBe(true);
  });

  it("steps a long question down so it fits the box", () => {
    const long =
      "Long ago, around the year 795, a people from the far north first sailed their " +
      "longships to the coast of Ireland. Which people were they, and what were they after?";
    const f = fitQuestion(long, 704, 160);
    expect(f.size).toBeLessThan(44);
    expect(f.size).toBeGreaterThanOrEqual(24);
    expect(f.fits).toBe(true);
    expect(f.lines * f.lineHeight).toBeLessThanOrEqual(160);
  });

  it("every question up to the 240-character cap fits, at any content", () => {
    for (const n of [20, 60, 100, 140, 180, 240]) {
      const text = Array.from({ length: n }, (_, i) => (i % 7 === 6 ? " " : "w")).join("");
      const f = fitQuestion(text, 704, 160);
      expect(f.fits, `length ${n}`).toBe(true);
    }
  });

  it("never goes below its minimum, and says honestly when it cannot fit", () => {
    const f = fitQuestion("word ".repeat(400), 704, 160);
    expect(f.size).toBe(24);
    expect(f.fits).toBe(false);
  });
});

describe("fitTileLabel (a 344 × 96 answer tile)", () => {
  it("a short answer keeps the full 32 px", () => {
    expect(fitTileLabel("Dublin", 344, 96).size).toBe(32);
  });

  it("a two-line answer fits inside the tile", () => {
    const f = fitTileLabel("Along the edges of tectonic plates", 344, 96);
    expect(f.fits).toBe(true);
    expect(f.lines).toBeLessThanOrEqual(3);
    expect(f.lines * f.lineHeight).toBeLessThanOrEqual(96 - 12);
  });

  it("the long freezer answer from the live review fits in at most three lines", () => {
    const f = fitTileLabel("They put it in the freezer overnight until it sets", 344, 96);
    expect(f.fits).toBe(true);
    expect(f.lines).toBeLessThanOrEqual(3);
    expect(f.size).toBeLessThan(32);
  });

  it("never drops below the hard floor", () => {
    const f = fitTileLabel("word ".repeat(100), 344, 96);
    expect(f.size).toBe(MIN_FONT);
    expect(MIN_FONT).toBeGreaterThanOrEqual(20); // 18 px floor at the minimum 0.9 scale
  });
});

describe("fitBody / fitText", () => {
  it("fits story text to its box", () => {
    const text = "The crew raids the monastery. ".repeat(12);
    const f = fitBody(text, 704, 300);
    expect(f.fits).toBe(true);
  });

  it("honours maxLines", () => {
    // ~33 characters: three lines at 30 px in 200 px, two at 20 px.
    const f = fitText("alpha beta gamma delta epsilon zeta", {
      w: 200, h: 1000, maxSize: 30, minSize: 20, maxLines: 2,
    });
    expect(f.fits).toBe(true);
    expect(f.lines).toBeLessThanOrEqual(2);
    expect(f.size).toBeLessThan(30); // it had to step down to honour the limit
  });
});
