// src/shared/shareCheck.ts
// "Before you share" in one place (TASK-32b): the flow problems from the
// reachability check (cards the class can't reach, dead ends, unfinished words)
// followed by the lesson warnings (two-answer quizzes, ambiguous keys, repeats…).
// Used by the Maker's export and the Teacher tab's Save a Copy, so both say the
// same thing. Lesson warnings never block: "Export anyway" / OK still saves.

import type { Card, Stack } from "./types.js";
import { checkReachability, describeProblems, firstProblemCard, type ReachabilityReport } from "./reachability.js";
import { lessonWarnings, describeLessonWarnings, type LessonWarning } from "./lessonCheck.js";

export interface ShareCheckResult {
  /** True when there is nothing at all to say. */
  ok: boolean;
  /** One plain sentence per problem, flow problems first. */
  lines: string[];
  /** The first card with anything to fix, for "Take me to the card". */
  first: Card | undefined;
  /** True when "Link these in for me" can help (a flow problem). */
  flowProblem: boolean;
  report: ReachabilityReport;
  warnings: LessonWarning[];
}

export function beforeYouShare(stack: Stack, label: (card: Card) => string): ShareCheckResult {
  const report = checkReachability(stack);
  const warnings = lessonWarnings(stack);
  const lines = [
    ...(report.ok ? [] : describeProblems(report, label)),
    ...describeLessonWarnings(stack, warnings, label),
  ];
  const flowFirst = report.ok ? undefined : firstProblemCard(report, stack);
  const warned = new Set(warnings.map((w) => w.cardId));
  const lessonFirst = stack.cards.find((c) => warned.has(c.id));
  const first =
    flowFirst !== undefined && lessonFirst !== undefined
      ? stack.cards.indexOf(flowFirst) <= stack.cards.indexOf(lessonFirst) ? flowFirst : lessonFirst
      : flowFirst ?? lessonFirst;
  return {
    ok: report.ok && warnings.length === 0,
    lines,
    first,
    flowProblem: report.unreachable.length + report.deadEndQuiz.length + report.deadEndOther.length + report.stuck.length > 0,
    report,
    warnings,
  };
}
