// tests/card-count-plan.test.ts
// TASK-36c4: "A 6-question quiz" asks for 6, twice, and the server never pads a
// short deck by turning a story or flash card into a quiz.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { build, buildStream, buildRetry, cardPlan } from "../server/promptBuilder.js";
import { finaliseGeneratedStackDetailed } from "../server/normalizeGenerated.js";
import { qualityNotes } from "../src/shared/qualityNotes.js";
import { parseRerecordFile } from "../scripts/bench.js";
import type { Stack } from "../src/shared/types.js";

const HERO =
  "A 6-question quiz on the water cycle for 4th class, two flash cards (evaporation, condensation) and a short choose-your-path story about a raindrop, the right answer plays a cheer";

describe("TASK-36c4: the card plan states the quiz count first and ties the end card to it", () => {
  it("TASK-36c4: the hero sentence's plan names 6 quiz cards first and ends with the end-card sentence", () => {
    const plan = cardPlan(HERO);
    expect(plan.startsWith("Card plan: exactly 6 quiz cards, exactly 2 flash cards,")).toBe(true);
    expect(plan.endsWith("Write the end card only after quiz card 6.")).toBe(true);
  });

  it("TASK-36c4: the plan is at the top and the end of the user message, in the stream, one-shot and retry prompts", () => {
    for (const p of [build({ prompt: HERO }), buildStream({ prompt: HERO })]) {
      const plan = cardPlan(HERO);
      expect(p.user.startsWith(plan)).toBe(true);
      expect(p.user.endsWith(plan)).toBe(true);
    }
    expect(buildRetry({ prompt: HERO }, ["x"]).user).toContain("Write the end card only after quiz card 6.");
  });

  it("TASK-36c4: both system prompts' end-card section says the end card comes only after the last planned quiz card", () => {
    const rule = "When the request gives a card plan, the end card comes only after the last planned quiz card";
    expect(build({ prompt: HERO }).system).toContain(rule);
    expect(buildStream({ prompt: HERO }).system).toContain(rule);
    const src = readFileSync("server/promptBuilder.ts", "utf8");
    expect(src.split(rule).length - 1).toBe(2);
  });
});

describe("TASK-36c4: the server keeps a shortfall honest", () => {
  it("TASK-36c4: a deck with 5 quiz cards asked for 6 is not padded (no story or flash card becomes a quiz) and keeps its notice", () => {
    const fx = JSON.parse(readFileSync("tests/fixtures/generation/water-cycle-g2.json", "utf8")) as { stack: Stack };
    const input: Stack = structuredClone(fx.stack);
    // Drop the last two quiz cards: 7 → 5. Point the story's last quiz to the end card.
    const quizIds = input.cards.filter((c) => c.kind === "quiz").map((c) => c.id);
    const drop = new Set(quizIds.slice(-2));
    const endId = input.cards.find((c) => c.kind === "end")!.id;
    input.cards = input.cards.filter((c) => !drop.has(c.id));
    for (const c of input.cards) {
      for (const e of c.elements) if (e.type === "button") e.actions = e.actions.map((a) => (a.type === "goto" && drop.has(a.cardId) ? { ...a, cardId: endId } : a));
      c.actions = c.actions.map((a) => (a.type === "goto" && drop.has(a.cardId) ? { ...a, cardId: endId } : a));
    }
    const kinds = (s: Stack): Record<string, number> => s.cards.reduce<Record<string, number>>((m, c) => ({ ...m, [c.kind]: (m[c.kind] ?? 0) + 1 }), {});
    const before = kinds(input);
    expect(before["quiz"]).toBe(5);
    const out = finaliseGeneratedStackDetailed(input, { prompt: HERO });
    expect(kinds(out.stack)).toEqual(before);
    expect(qualityNotes(HERO, out.stack, out.removedRepeats)).toContain("You asked for 6 questions; the model wrote 5.");
  });

  it("TASK-36c4: bench/rerecord-counts.txt lists exactly the objectives whose recording has a count shortfall", () => {
    const r = JSON.parse(readFileSync("bench/results.json", "utf8")) as { decks: Array<{ id: string; countsOk: boolean }> };
    const want = r.decks.filter((d) => !d.countsOk).map((d) => d.id).sort();
    const got = parseRerecordFile(readFileSync("bench/rerecord-counts.txt", "utf8")).ids.sort();
    expect(got).toEqual(want);
    expect(got.length).toBeGreaterThan(0);
    const d = readFileSync("bench/DIAGNOSIS.md", "utf8");
    expect(d).toContain("## Count shortfall after round 3 (TASK-36c4)");
    expect(d).toContain("npm run bench:record -- --force --only-file bench/rerecord-counts.txt");
  });
});
