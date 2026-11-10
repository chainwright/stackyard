// tests/bench-v2.test.ts
// TASK-33c9–c13 (.kiro/specs/curriculum-bench/tasks.md): what the v1 bench
// recording showed, and the prompt fixes. The quiz cards below are copied
// exactly from the v1 recordings in bench/cache/ (9 Nov), so the tests keep
// working after a re-record.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { build, buildStream, buildRetry, cardPlan } from "../server/promptBuilder.js";
import { streamGenerate } from "../server/stream-generate.js";
import { finaliseGeneratedStack, sanitizeRawStack } from "../server/normalizeGenerated.js";
import { validate } from "../src/shared/validator.js";
import { rightAnswer, quizAnswers } from "../src/shared/lessonCheck.js";
import { sentenceFor, resultsMarkdown, buildResults, type BenchSummary } from "../scripts/bench-lib.js";
import { readBenchClaim } from "../scripts/claims-lib.js";
import type { GenerateStreamMessage } from "../src/shared/types.js";

const ROOT = process.cwd();
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const SENTENCE = sentenceFor("recognise that vibrations from sounds travel through a medium to the ear");

const score = (d: 0 | 1) => ({ type: "score", delta: d });
const buzz = { type: "sound", sound: "buzz" };
const go = (id: string) => ({ type: "goto", cardId: id });
const btn = (id: string, label: string, actions: unknown[]) => ({ type: "button", id, label, actions });

/** The five quiz cards that broke the v1 first try: every answer has delta 0. */
const BROKEN: Array<[string, Record<string, unknown>]> = [
  ["y3-animals-2", { id: "c4", kind: "quiz", actions: [], elements: [
    { type: "text", id: "c4-q", content: "What pulls on bones to make them move?" },
    btn("c4-a", "Muscles", [score(0), buzz, go("c5")]), btn("c4-b", "Skin", [score(0), buzz, go("c5")]), btn("c4-c", "Hair", [score(0), buzz, go("c5")]),
  ] }],
  ["y3-forces-magnets-3", { id: "c4", kind: "quiz", actions: [], elements: [
    { type: "text", id: "c4-q", content: "What happens when two north poles are brought together?" },
    btn("c4-a", "They push apart", [score(0), buzz, go("c5")]), btn("c4-b", "They pull together", [score(0), buzz, go("c5")]),
    btn("c4-c", "They stick permanently", [score(0), buzz, go("c5")]), btn("c4-d", "They turn into one magnet", [score(0), buzz, go("c5")]),
  ] }],
  ["y3-rocks-3", { id: "c1", kind: "quiz", actions: [], elements: [
    { type: "image", picto: "leaf" },
    { type: "text", id: "c1-q", content: "What is organic matter in soil?" },
    btn("c1-a", "Dead plants and animals that have broken down", [score(0), go("c2")]), btn("c1-b", "Only the sand and clay particles", [score(0), go("c2")]),
    btn("c1-c", "Rain water trapped in the ground", [score(0), go("c2")]), btn("c1-d", "Tiny pieces of glass", [score(0), go("c2")]),
  ] }],
  ["y4-sound-2", { id: "c4", kind: "quiz", actions: [], elements: [
    { type: "text", id: "c4-q", content: "What is needed for sound to travel from a source to our ears?" },
    btn("c4-a", "A medium, such as air", [score(0), buzz, go("c5")]), btn("c4-b", "Bright light", [score(0), buzz, go("c5")]),
    btn("c4-c", "A magnet", [score(0), buzz, go("c5")]), btn("c4-d", "Sunshine", [score(0), buzz, go("c5")]),
  ] }],
  ["y5-materials-6", { id: "c3", kind: "quiz", actions: [], elements: [
    { type: "text", id: "c3-q", content: "Which pair of materials, when mixed, makes a fizzing gas?" },
    btn("c3-a", "Vinegar and bicarbonate of soda", [score(0), go("c4")]), btn("c3-b", "Water and sugar", [score(0), go("c4")]),
    btn("c3-c", "Sand and water", [score(0), go("c4")]), btn("c3-d", "Flour and salt", [score(0), go("c4")]),
  ] }],
];

/** A stream of: header, the card, the end card (its gotos point at a missing id, which the pipeline re-points at the next card). */
function streamOf(card: Record<string, unknown>): string {
  const header = { kind: "stack", id: "s", title: "Bench", theme: { background: "#FBF8F1", foreground: "#1E2A47", font: "sans-serif" } };
  const end = { id: "end", kind: "end", actions: [], elements: [{ type: "text", id: "e-t", content: "You finished!" }, { type: "field", id: "e-s", variable: "score" }] };
  return [header, { kind: "card", card }, { kind: "card", card: end }].map((l) => JSON.stringify(l)).join("\n") + "\n";
}

async function firstTry(raw: string): Promise<boolean> {
  let fellBack = false;
  const out: GenerateStreamMessage[] = [];
  const log = console.log;
  const warn = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    await streamGenerate({ prompt: SENTENCE }, { write: (m) => void out.push(m), end: () => {} }, {
      callStream: async function* () { yield raw; },
      generate: async () => { fellBack = true; return { ok: false, message: "no retry" }; },
      sleep: async () => {},
    });
  } finally {
    console.log = log;
    console.warn = warn;
  }
  return !fellBack && out.some((m) => m.type === "done");
}

/** The card with its FIRST answer marked right (what the model wrote first, in all five). */
function keyFirst(card: Record<string, unknown>): Record<string, unknown> {
  let done = false;
  const elements = (card["elements"] as Array<Record<string, unknown>>).map((e) => {
    if (e["type"] !== "button" || done) return e;
    done = true;
    return { ...e, actions: (e["actions"] as Array<Record<string, unknown>>).map((a) => (a["type"] === "score" ? { ...a, delta: 1 } : a)) };
  });
  return { ...card, elements };
}

const PROMPTS = (): Array<[string, string]> => [
  ["one-shot", build({ prompt: SENTENCE }).system],
  ["streaming", buildStream({ prompt: SENTENCE }).system],
  ["retry", buildRetry({ prompt: SENTENCE }, ["quiz-answer"]).system],
];

describe("TASK-33c9: the five v1 first-try failures were quizzes with no right answer", () => {
  for (const [id, card] of BROKEN) {
    it(`TASK-33c9: ${id} — the exact cached quiz has 0 answers with delta 1 (never 2), fails the quiz-answer invariant and is not a first try`, async () => {
      const answers = (card["elements"] as Array<Record<string, unknown>>).filter((e) => e["type"] === "button");
      const rights = answers.filter((b) => (b["actions"] as Array<Record<string, unknown>>).some((a) => a["type"] === "score" && a["delta"] === 1));
      expect(rights.length).toBe(0);
      expect(card["kind"]).toBe("quiz"); // every answer carries a score action: plainly a quiz, not a story choice
      expect(await firstTry(streamOf(card))).toBe(false);
      // The model's intended answer was written FIRST; with that one marked, the deck is valid.
      expect(await firstTry(streamOf(keyFirst(card)))).toBe(true);
    });
  }

  it("TASK-33c9: the server does not guess a key: finalising a zero-right quiz never marks an answer right", () => {
    const [, card] = BROKEN[0]!;
    const raw = { id: "s", title: "T", theme: { background: "#fff", foreground: "#000", font: "sans-serif" }, cards: [card, { id: "end", kind: "end", actions: [], elements: [{ type: "text", id: "t", content: "Done" }] }] };
    const v = validate(sanitizeRawStack(raw));
    expect(v.valid).toBe(false);
    if (!v.valid) expect(v.errors.join(" ")).toMatch(/quiz/i);
  });

  it("TASK-33c9: the prompts drop 'vary the position' (Stackyard shuffles) and say to mark the right answer on its own button", () => {
    for (const [name, sys] of PROMPTS()) {
      expect(sys, name).not.toMatch(/VARY which position/);
      expect(sys, name).not.toMatch(/do NOT always make the first button the right one/);
      expect(sys, name).toContain('Put { "type": "score", "delta": 1 } on the button whose label IS the right answer, as you write that button');
      expect(sys, name).toContain("never leave a quiz card with no delta 1");
      expect(sys, name).toContain("Stackyard shuffles the order of the answers itself");
    }
  });

  it("TASK-33c9: …and that is true: five right-first quizzes do not stay right-first after finalising", () => {
    const ids = Array.from({ length: 7 }, (_, i) => `c${i + 1}`);
    const quiz = (i: number) => ({ id: ids[i], kind: "quiz", actions: [], elements: [
      { type: "text", id: `q${i}`, content: `Question number ${i + 1} about sound?` },
      btn(`a${i}`, `Right ${i}`, [score(1), go(ids[i + 1]!)]), btn(`b${i}`, `Wrong b${i}`, [score(0), go(ids[i + 1]!)]),
      btn(`c${i}`, `Wrong c${i}`, [score(0), go(ids[i + 1]!)]), btn(`d${i}`, `Wrong d${i}`, [score(0), go(ids[i + 1]!)]),
    ] });
    const raw = { id: "s", title: "Sound", theme: { background: "#fff", foreground: "#000", font: "sans-serif" },
      cards: [...[0, 1, 2, 3, 4].map(quiz), { id: "c6", kind: "end", actions: [], elements: [{ type: "text", id: "t", content: "Done" }] }] };
    const v = validate(sanitizeRawStack(raw));
    expect(v.valid).toBe(true);
    if (!v.valid) return;
    const fin = finaliseGeneratedStack(v.stack, { prompt: "a 5-question quiz on sound" });
    const firstIsRight = fin.cards.filter((c) => c.kind === "quiz").map((c) => quizAnswers(c)[0] === rightAnswer(c));
    expect(firstIsRight.length).toBe(5);
    expect(firstIsRight.every(Boolean)).toBe(false);
  });

  it("TASK-33c9: bench/DIAGNOSIS.md names each failure and each cause with its count", () => {
    const d = read("bench/DIAGNOSIS.md");
    for (const [id] of BROKEN) expect(d).toContain(id);
    expect(d).toContain("5 of 5");
    expect(d).toContain("25 of 55");
    expect(d).toMatch(/not a classroom study/);
  });
});

describe("TASK-33c10: the card plan, near the top and at the end of the request", () => {
  const PLAN = "Card plan: exactly 5 quiz cards, exactly 2 flash cards, 1 story card with its 2 consequence cards, 1 end card (11 cards in all). The story cards are not quiz cards. Write the end card only after quiz card 5.";

  it("TASK-33c10: the bench sentence gives the full plan; the count parser reads quiz 5 and flash 2", () => {
    expect(cardPlan(SENTENCE)).toBe(PLAN);
    expect(cardPlan("a 6-question quiz on fractions")).toBe("Card plan: exactly 6 quiz cards, 1 end card. Write the end card only after quiz card 6.");
    expect(cardPlan("a quiz about the Vikings")).toBe("");
  });

  it("TASK-33c10: the one-shot and streaming user messages open AND close with the plan; the retry ends with it", () => {
    for (const user of [build({ prompt: SENTENCE }).user, buildStream({ prompt: SENTENCE }).user]) {
      expect(user.startsWith(PLAN + "\n\n")).toBe(true);
      expect(user.endsWith("\n\n" + PLAN)).toBe(true);
      expect(user).toContain(`Generate a stack for: "${SENTENCE}"`);
      expect(user).toContain("Write exactly 5 quiz cards and exactly 2 flash cards.");
    }
    expect(buildRetry({ prompt: SENTENCE }, ["quiz-answer"]).user.endsWith(PLAN)).toBe(true);
    expect(build({ prompt: "a quiz about the Vikings" }).user).not.toContain("Card plan");
  });

  it("TASK-33c10: the system prompts say a story card never counts as a quiz card", () => {
    for (const [name, sys] of PROMPTS()) {
      expect(sys, name).toContain("## Card plan");
      expect(sys, name).toContain("A story card and its consequence cards are never quiz cards: they do not count towards the quiz cards, even when the story asks the class a question.");
    }
  });
});

describe("TASK-33c11: sharper rules for two-answer quizzes, overlapping answers and restating a flash card", () => {
  it("TASK-33c11: yes/no is not a comparison, no questions about the lesson itself, no answer inside another, no flash fact asked straight back", () => {
    for (const [name, sys] of PROMPTS()) {
      expect(sys, name).toContain("A yes/no question is not a comparison: ask it another way, with 3 or 4 answers.");
      expect(sys, name).toContain('Never ask a question about the lesson itself ("How many questions have you tried?").');
      expect(sys, name).toContain('No answer may be another answer with words added or taken away ("Sieve" and "Sieve with larger holes"');
      expect(sys, name).toContain('In the three cards after a flash card, no quiz may have that flash card\'s term as its right answer, ask "What is <term>?", or ask for a fact its explanation states');
    }
  });
});

describe("TASK-33c12: v1 is kept, and RESULTS.md shows both runs", () => {
  it("TASK-33c12: bench/results-v1.json holds the v1 summary (50 / 36 / 25 of 55)", () => {
    const v1 = JSON.parse(read("bench/results-v1.json")) as { summary: BenchSummary };
    expect(v1.summary).toMatchObject({ objectives: 55, recorded: 55, firstTry: 50, lessonClean: 36, countsOk: 25 });
  });

  it("TASK-33c12: RESULTS.md opens with the v1 table, then the current run", () => {
    const md = read("bench/RESULTS.md");
    const v1 = md.indexOf("## v1 (before the TASK-33 prompt fixes)");
    const now = md.indexOf("## Current run");
    expect(v1).toBeGreaterThan(0);
    expect(now).toBeGreaterThan(v1);
    expect(md.slice(v1, now)).toContain("| Valid lesson file on the first try (no retry, no fallback) | 50 of 55 |");
    expect(md.slice(v1, now)).toContain("| Asked-for counts (5 quiz, 2 flash) | 25 of 55 |");
    const r = buildResults(55, []);
    expect(resultsMarkdown(r)).not.toContain("## v1");
  });

  it("TASK-33c12: check:claims checks the CURRENT results.json, not v1", () => {
    const now = (JSON.parse(read("bench/results.json")) as { summary: BenchSummary }).summary;
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      expect(readBenchClaim(read(f)), f).toEqual({ objectives: now.objectives, firstTry: now.firstTry, lessonClean: now.lessonClean });
    }
    expect(read("scripts/check-claims.ts")).not.toContain("results-v1");
  });
});

describe("TASK-33c13: the lesson-checker persona's review of five bench decks", () => {
  it("TASK-33c13: bench/LESSON_CHECKER.md is dated, says how it ran, and covers the five decks with facts, ambiguity, reading level and a fix each", () => {
    expect(existsSync(path.join(ROOT, "bench", "LESSON_CHECKER.md"))).toBe(true);
    const md = read("bench/LESSON_CHECKER.md");
    expect(md).toContain("run inside Kiro by the lesson-checker persona; read-only");
    expect(md).toMatch(/9 November 2026/);
    const decks = ["y3-light-3", "y3-rocks-2", "y4-states-of-matter-3", "y4-electricity-2", "y5-earth-space-4"];
    const sections = md.split(/^## /m).slice(1).filter((s) => /^y\d/.test(s));
    expect(sections.map((s) => s.split(/\s/)[0])).toEqual(decks);
    for (const s of sections) {
      for (const h of ["**Facts.**", "**Ambiguity.**", "**Reading level.**", "**Suggested fix.**"]) expect(s, s.slice(0, 30)).toContain(h);
    }
  });
});
