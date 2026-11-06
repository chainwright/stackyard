// tests/round4-generation.test.ts
// TASK-28i (cap respects decimals and abbreviations) and TASK-28p (the prompt's
// wrong-answer rules are general, plausible, and not tuned to one topic).

import { describe, it, expect } from "vitest";
import { cap } from "../server/normalizeGenerated.js";
import { build, buildStream } from "../server/promptBuilder.js";

describe("TASK-28i: cap() is decimal- and abbreviation-safe", () => {
  it("never cuts after the '2.' of '2.5 kilograms' (the J4 repro)", () => {
    const out = cap("The answer is 2.5 kilograms of flour plus water", 16);
    expect(out).toBe("The answer is…");
    expect(out).not.toMatch(/is 2…?\.?$/); // not cut after the "2" of "2.5"
    expect(out.endsWith("…")).toBe(true);
  });

  it("never cuts after 'Dr.' as if the sentence ended (the J4 repro)", () => {
    // Window of 14 = "We met Dr. Mur": the only "." in it is the abbreviation's.
    const out = cap("We met Dr. Murphy. Then we all went home along the long road together.", 14);
    expect(out).not.toMatch(/Dr\.…?$/);
    expect(out.endsWith("…")).toBe(true);
  });

  it("the word-boundary path does not end on a dangling 'Dr.' either", () => {
    const text = "The light bulb was improved by Dr. Thomas Edison in a lab in the year 1879";
    const out = cap(text, 34);
    expect(out).not.toMatch(/Dr\.…?$/);
    expect(out).toBe("The light bulb was improved by…");
  });

  it.each(["Mr", "Mrs", "Ms", "St", "e.g", "i.e", "etc"])("does not end a sentence on the abbreviation %s.", (abbr) => {
    const text = `We met ${abbr}. Murphy at the harbour and then walked home along the long road together`;
    const dotIndex = `We met ${abbr}.`.length - 1;
    const out = cap(text, dotIndex + 20);
    // The sentence pass skips the abbreviation dot, so the kept text goes past it.
    expect(out).toMatch(new RegExp(`${abbr.replace(".", "\\.")}\\. Murphy`));
  });

  it("a real sentence end is still used, and says it dropped the rest", () => {
    const text = "The Vikings sailed to Ireland in 795. They built a town at Dublin and traded silver for many years";
    const out = cap(text, 60);
    expect(out).toBe("The Vikings sailed to Ireland in 795…");
  });

  it("property: anything shortened ends with '…'; anything not shortened is unchanged", () => {
    const samples = [
      "A short one.",
      "Pi is about 3.14159 and e is about 2.71828, both of which go on forever without repeating themselves.",
      "Dr. Who and Mr. Smith went to St. Mary's e.g. on a Tuesday, etc. and then home again after a very long day.",
    ];
    for (const s of samples) {
      for (let max = 10; max <= s.length + 5; max += 7) {
        const out = cap(s, max);
        if (s.length <= max) expect(out).toBe(s);
        else {
          expect(out.endsWith("…"), `${s} @${max} -> ${out}`).toBe(true);
          expect(out.length).toBeLessThanOrEqual(max);
        }
      }
    }
  });
});

describe("TASK-28p: the prompt's wrong-answer rules are general", () => {
  const req = { prompt: "A quiz about the planets" };
  const prompts = [build(req), buildStream(req)].map((p) => `${p.system}\n${p.user}`);

  it.each([0, 1])("prompt %i: wrong answers must be plausible, same topic, never jokes or absurd", (i) => {
    const p = prompts[i]!.toLowerCase();
    expect(p).toMatch(/plausible/);
    expect(p).toMatch(/same topic/);
    expect(p).toMatch(/never jokes or absurd/);
    expect(p).toMatch(/clearly (false|wrong)/);
  });

  it.each([0, 1])("prompt %i: carries no topic-specific example from a review", (i) => {
    const p = prompts[i]!.toLowerCase();
    for (const banned of ["robin", "grass seed", "field mouse", "field mice", "holiday to italy", "insects"]) {
      expect(p, banned).not.toContain(banned);
    }
  });
});
