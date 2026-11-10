// src/shared/shareCheck.ts
// "Before you share" in one place (TASK-32b): the flow problems from the
// reachability check (cards the class can't reach, dead ends, unfinished words)
// followed by the lesson warnings (two-answer quizzes, ambiguous keys, repeats…).
// Used by the Maker's export and the Teacher tab's Save a Copy, so both say the
// same thing. Lesson warnings never block: "Export anyway" / OK still saves.
//
// TASK-36c3: only STRUCTURAL problems open the dialog (the flow problems, two
// answers with the same words, an answer inside another, a two-answer quiz, a
// repeated card). "Restates a flash card" and "may be a joke answer" are NOTES:
// listed after the export, never in the way of it. Flash-then-quiz on the same
// term is what a teacher often asks for (round-3 panel, J03 / J04 §4.13).
// Every card is named with its question in full, in curly quotes.

import type { Card, Stack } from "./types.js";
import { checkReachability, describeProblems, firstProblemCard, type ReachabilityReport } from "./reachability.js";
import { lessonWarnings, describeLessonWarnings, type LessonWarning } from "./lessonCheck.js";
import { quotedCardName } from "./cardTitle.js";

/** TASK-36c3: the lesson warnings that never block an export or a copy. */
export const NOTE_CODES: ReadonlyArray<LessonWarning["code"]> = ["restates-flash", "joke-answer"];

export interface ShareCheckResult {
  /** True when nothing would block sharing (notes may still be there). */
  ok: boolean;
  /** One plain sentence per BLOCKING problem, flow problems first. */
  lines: string[];
  /** TASK-36c3: one plain sentence per non-blocking note (shown after export). */
  notes: string[];
  /** The first card with anything to fix, for "Take me to the card". */
  first: Card | undefined;
  /** True when "Link these in for me" can help (a flow problem). */
  flowProblem: boolean;
  report: ReachabilityReport;
  warnings: LessonWarning[];
}

export function beforeYouShare(stack: Stack, label: (card: Card) => string = (c) => quotedCardName(stack, c)): ShareCheckResult {
  const report = checkReachability(stack);
  const warnings = lessonWarnings(stack);
  const blocking = warnings.filter((w) => !NOTE_CODES.includes(w.code));
  const noted = warnings.filter((w) => NOTE_CODES.includes(w.code));
  const lines = [
    ...(report.ok ? [] : describeProblems(report, label)),
    ...describeLessonWarnings(stack, blocking, label),
  ];
  const flowFirst = report.ok ? undefined : firstProblemCard(report, stack);
  const warned = new Set(blocking.map((w) => w.cardId));
  const lessonFirst = stack.cards.find((c) => warned.has(c.id));
  const first =
    flowFirst !== undefined && lessonFirst !== undefined
      ? stack.cards.indexOf(flowFirst) <= stack.cards.indexOf(lessonFirst) ? flowFirst : lessonFirst
      : flowFirst ?? lessonFirst;
  return {
    ok: report.ok && blocking.length === 0,
    lines,
    notes: describeLessonWarnings(stack, noted, label),
    first,
    flowProblem: report.unreachable.length + report.deadEndQuiz.length + report.deadEndOther.length + report.stuck.length > 0,
    report,
    warnings,
  };
}
