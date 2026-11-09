// scripts/check-generation-quality.ts
// TASK-32b gate: run the WHOLE generator finish path — sanitise the raw model
// JSON, validate, finaliseGeneratedStackDetailed — over the live-shaped fixtures
// in tests/fixtures/generation/ (the shapes we measured on live generated decks,
// 9 Nov), and assert what the teacher gets:
//   - the deck is valid and every card is reachable;
//   - no two non-end cards share a kind and front (repeats removed);
//   - the quiz / flash counts are what the fixture expects (extras trimmed to the
//     sentence, shortfalls kept and noted);
//   - no picture names its card's right answer;
//   - the expected lesson warnings ("Before you share") are present;
//   - the Maker's notes are the expected ones.
//
//   node --import tsx/esm scripts/check-generation-quality.ts

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeRawStack, finaliseGeneratedStackDetailed } from "../server/normalizeGenerated.js";
import { pictureGivesAnswerAway } from "../server/deckQuality.js";
import { validate } from "../src/shared/validator.js";
import { reachableIds } from "../src/shared/flow.js";
import { frontKey, lessonWarnings } from "../src/shared/lessonCheck.js";
import { qualityNotes } from "../src/shared/qualityNotes.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "tests", "fixtures", "generation");

interface Fixture {
  prompt: string;
  expect: {
    quiz?: number;
    flash?: number;
    removedRepeats?: number;
    warnings?: string[];
    notes?: string[];
    noGiveawayPictures?: boolean;
  };
  stack: unknown;
}

export function checkFixture(name: string, fx: Fixture): string[] {
  const problems: string[] = [];
  const v = validate(sanitizeRawStack(JSON.parse(JSON.stringify(fx.stack))));
  if (!v.valid) return [`${name}: the sanitised model deck is invalid (${v.errors.join(", ")})`];
  const out = finaliseGeneratedStackDetailed(v.stack, { prompt: fx.prompt });
  const s = out.stack;
  if (!validate(s).valid) problems.push(`${name}: the finalised deck is invalid`);
  const reach = reachableIds(s);
  for (const c of s.cards) if (!reach.has(c.id)) problems.push(`${name}: a ${c.kind} card is unreachable`);
  const keys = s.cards.filter((c) => c.kind !== "end").map(frontKey);
  const dups = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dups.length > 0) problems.push(`${name}: ${dups.length} repeated card(s) survived: ${dups.join("; ")}`);
  const quiz = s.cards.filter((c) => c.kind === "quiz").length;
  const flash = s.cards.filter((c) => c.kind === "flash").length;
  if (fx.expect.quiz !== undefined && quiz !== fx.expect.quiz) problems.push(`${name}: ${quiz} quiz cards, expected ${fx.expect.quiz}`);
  if (fx.expect.flash !== undefined && flash !== fx.expect.flash) problems.push(`${name}: ${flash} flash cards, expected ${fx.expect.flash}`);
  if (fx.expect.removedRepeats !== undefined && out.removedRepeats !== fx.expect.removedRepeats) {
    problems.push(`${name}: removed ${out.removedRepeats} repeated card(s), expected ${fx.expect.removedRepeats}`);
  }
  if (out.requested.quiz !== undefined && quiz > out.requested.quiz) problems.push(`${name}: more quizzes (${quiz}) than asked (${out.requested.quiz})`);
  if (out.requested.flash !== undefined && flash > out.requested.flash) problems.push(`${name}: more flash cards (${flash}) than asked (${out.requested.flash})`);
  for (const c of s.cards) if (pictureGivesAnswerAway(c)) problems.push(`${name}: a picture names the right answer on "${(c.elements.find((e) => e.type === "text") as { content?: string } | undefined)?.content ?? c.kind}"`);
  const codes = new Set(lessonWarnings(s).map((w) => w.code as string));
  for (const w of fx.expect.warnings ?? []) if (!codes.has(w)) problems.push(`${name}: expected a "${w}" warning in Before you share`);
  const notes = qualityNotes(fx.prompt, s, out.removedRepeats);
  for (const want of fx.expect.notes ?? []) if (!notes.includes(want)) problems.push(`${name}: expected the note "${want}" (got ${JSON.stringify(notes)})`);
  if ((fx.expect.notes ?? []).length === 0 && notes.length > 0) problems.push(`${name}: unexpected notes ${JSON.stringify(notes)}`);
  return problems;
}

function main(): void {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) {
    console.error("check-generation-quality: FAIL — no fixtures in tests/fixtures/generation/.");
    process.exit(1);
  }
  let failed = false;
  for (const f of files) {
    const fx = JSON.parse(readFileSync(path.join(DIR, f), "utf8")) as Fixture;
    const problems = checkFixture(f, fx);
    if (problems.length > 0) {
      failed = true;
      for (const p of problems) console.error(`check-generation-quality: FAIL — ${p}`);
    } else {
      console.log(`check-generation-quality: OK — ${f}`);
    }
  }
  if (failed) process.exit(1);
  console.log(`check-generation-quality: OK — TASK-32b: ${files.length} live-shaped decks finalise with no repeats, the asked-for counts, no giveaway picture and the expected warnings.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
