// scripts/mutation-check.ts
// Reproducible mutation checks for the TASK-26 fixes (and the TASK-23 MCP
// limits). A test that stays green when its fix is removed proves nothing — and
// the round-2 review caught exactly that twice (the living-file gate and the
// retry-budget test). Each mutant below REVERTS one fix with a one-line edit,
// runs the tests that are supposed to guard it, and demands that they FAIL
// ("killed"). A mutant that leaves the tests green has "survived" — a test gap.
//
//   npm run check:mutants                 # all mutants
//   npm run check:mutants -- living       # only mutants whose name contains "living"
//
// Safe to run: every file is restored (from memory) after each mutant, even if
// vitest crashes. It is not part of pre-submit because it takes a couple of
// minutes; run it after touching one of the guarded areas.

import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface Mutant {
  name: string;
  /** The fix being reverted (shown in the report). */
  reverts: string;
  file: string;
  find: string;
  replace: string;
  /** Tests that must go red. */
  tests: string[];
  /**
   * A real-browser gate instead of vitest files: a command (argv) that must exit
   * NON-zero with the fix reverted. Used for the CSS fixes only a browser can see.
   */
  gate?: string[];
}

const MUTANTS: Mutant[] = [
  // ---- Round-3 fixes (TASK-28k) ----
  {
    name: "claims: the ANSI colour strip is gone",
    reverts: "TASK-28k / 27v — CI-safe test total",
    file: "scripts/claims-lib.ts",
    find: 'return text.replace(/\\u001b\\[[0-9;?]*[A-Za-z]/g, "");',
    replace: "return text;",
    tests: ["tests/claims.test.ts"],
  },
  {
    name: "generator: proper nouns are lowercased again",
    reverts: "27A / z1 — function words only",
    file: "server/normalizeGenerated.ts",
    find: "(i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w)",
    replace: "(i > 0 ? w.toLowerCase() : w)",
    tests: ["tests/round3-addendum.test.ts", "tests/generated-normalize.test.ts"],
  },
  {
    name: "living editor: a flash Front edit refreshes only the list, not the card preview",
    reverts: "27x — preview refresh",
    file: "src/living/editor.ts",
    find: "// Refresh the card preview AND the list label (TASK-27x).\n        this.refreshPreviewOnly();",
    replace: 'const list = this.host.querySelector<HTMLElement>(".sy-living-list");\n        if (list) list.replaceWith(this.renderList());',
    tests: ["tests/living.test.ts"],
  },
  {
    name: "generator: a pronoun becomes the flash term again",
    reverts: "27B / z2 — pronoun guard",
    file: "server/normalizeGenerated.ts",
    find: "&& !isPronounTerm(term)) return { term, back: t };",
    replace: ") return { term, back: t };",
    tests: ["tests/round3-addendum.test.ts", "tests/round3-generation.test.ts"],
  },
  {
    name: "check: a trap loop is not reported",
    reverts: "z3 — reverse reachability",
    file: "src/shared/reachability.ts",
    find: "&& !canFinish.has(c.id),",
    replace: "&& false,",
    tests: ["tests/round3-addendum.test.ts"],
  },
  {
    name: "server: a malformed body still burns a rate slot",
    reverts: "z4 — validate the body before the slot",
    file: "server/index.ts",
    find: "if (goodBody === null) return;",
    replace: "/* mutant: carry on and count the slot */",
    tests: ["tests/round3-addendum.test.ts"],
  },
  {
    name: "stream: the fallback's generate() is not given the client's signal",
    reverts: "z5 — disconnect reaches the fallback",
    file: "server/stream-generate.ts",
    find: "...(signal ? { signal } : {}),",
    replace: "...{},",
    tests: ["tests/round3-addendum.test.ts"],
  },
  // ---- Round-4 fixes (TASK-28) ----
  {
    name: "operations: + Add Card relinks quiz answers only (flash/story Next skip the new card)",
    reverts: "28h — splice links for every card type",
    file: "src/editor/operations.ts",
    find: "return ensureForwardLinks(spliced.stack);",
    replace: "return ensureForwardLinks(inserted);",
    tests: ["tests/round4-flow.test.ts"],
  },
  {
    name: "check: the placeholder list forgets 'Another answer' again",
    reverts: "28m — every default label",
    file: "src/shared/reachability.ts",
    find: "new Set(Object.values(PLACEHOLDER_WORDS));",
    replace: 'new Set([PLACEHOLDER_WORDS.question, PLACEHOLDER_WORDS.rightAnswer, PLACEHOLDER_WORDS.wrongAnswer, PLACEHOLDER_WORDS.term, PLACEHOLDER_WORDS.explanation, PLACEHOLDER_WORDS.story]);',
    tests: ["tests/round4-flow.test.ts"],
  },
  {
    name: "generator: cap() takes the '.' in '2.5' for a sentence end again",
    reverts: "28i — look-ahead on the full text",
    file: "server/normalizeGenerated.ts",
    find: "for (const m of t.matchAll(/[.!?]",
    replace: "for (const m of window.matchAll(/[.!?]",
    tests: ["tests/round4-generation.test.ts"],
  },
  {
    name: "maker (browser): the card is only shrunk by the 0.9 floor, so a banner pushes the flash switch under it",
    reverts: "28r — banner never hides the controls (now through the fit scale)",
    file: "src/editor/Canvas.tsx",
    find: "const h = area.clientHeight - reservedTop - 32 - 24;",
    replace: "const h = 9999;",
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-maker-fit.ts"],
  },
  {
    name: "maker (browser): the Drag pill sits over the Right answer tab again",
    reverts: "28d — drag pill moves left",
    file: "src/editor/styles.css",
    find: ".drag-tab-left { left: 0; transform: none; }",
    replace: ".drag-tab-left { }",
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-maker-fit.ts"],
  },
  {
    name: "maker (browser): the start card's peek tiles hang off a hidden edge again",
    reverts: "28e — peek content in the visible strip",
    file: "src/editor/styles.css",
    find: "padding: 28px 32px 28px 308px;",
    replace: "padding: 28px 32px;",
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-maker-fit.ts"],
  },
  // ---- Round-5 fixes (TASK-29) ----
  {
    name: "operations: a fork's first link is retargeted when a card is added after it (branches get merged)",
    reverts: "29a — never rewire a fork",
    file: "src/shared/flow.ts",
    find: "if (targets.length === 1) {",
    replace: "if (targets.length >= 1) {",
    tests: ["tests/round5-flow.test.ts"],
  },
  {
    name: "check: the share check doubles the full stop again",
    reverts: "29b — one full stop",
    file: "src/shared/reachability.ts",
    find: "(/[.!?…]$/.test(s) ? s : s + \".\")",
    replace: "(s + \".\")",
    tests: ["tests/round5-flow.test.ts"],
  },
  {
    name: "tooling: check:trace counts a comment as a test title",
    reverts: "29c — titles, not mentions",
    file: "scripts/check-task-trace.ts",
    find: "if (TITLE_LINE.test(line) && !COMMENT_LINE.test(line)) scan(line);",
    replace: "scan(line);",
    tests: ["tests/task-trace.test.ts"],
  },
  {
    name: "hooks: the shell-edit guard no longer catches `> file` redirects",
    reverts: "29d — echo/printf/cat writes",
    file: "scripts/after-bash.patterns",
    find: "(^|[^0-9&>])> *[~A-Za-z./_-]",
    replace: "NEVER-MATCHES-ZZZ",
    tests: ["tests/hooks.test.ts"],
  },
  {
    name: "generator: a real flash card before the end card is folded into the end card",
    reverts: "29k — fold only a sign-off",
    file: "server/normalizeGenerated.ts",
    find: "if (front.length === 0 || !soundsLikeEnding(front)) return stack;",
    replace: "if (front.length === 0) return stack;",
    tests: ["tests/round5-generation.test.ts"],
  },
  {
    name: "generator: the first card is no longer timed (no ttfc in the log)",
    reverts: "29h — ttfc",
    file: "server/stream-generate.ts",
    find: "if (firstCardMs === null) firstCardMs = now() - t0;",
    replace: "void 0;",
    tests: ["tests/round5-generation.test.ts"],
  },
  {
    name: "renderer: a teacher's own end heading is swapped for 'You finished!' at score 0",
    reverts: "29m — keep the teacher's heading",
    file: "src/player/renderer.ts",
    find: "if (total > 0 && score === 0 && isStockEndLine(headingText)) headingText",
    replace: "if (total > 0 && score === 0) headingText",
    tests: ["tests/maker/round5-ui.dom.test.ts"],
  },
  {
    name: "maker: '+ Add an answer' leaves the cursor on <body>",
    reverts: "29n — focus the new answer",
    file: "src/editor/Inspector.tsx",
    find: "setTimeout(focusAnswerBox, 0);",
    replace: "void 0;",
    tests: ["tests/maker/round5-ui.dom.test.ts"],
  },
  {
    name: "renderer: sibling choices are fitted one by one again",
    reverts: "29l — one shared size",
    file: "src/player/renderer.ts",
    find: "applyFit(btn, sharedFit ?? genericButtonFit(el), 32);",
    replace: "applyFit(btn, genericButtonFit(el), 32);",
    tests: ["tests/maker/round5-ui.dom.test.ts"],
  },
  {
    name: "maker (browser): the card is not shrunk to the space under a banner (floor 0.9 again)",
    reverts: "29e — fit under the banner",
    file: "src/editor/Canvas.tsx",
    find: "return Math.max(0.5, Math.min(s, 1.35));",
    replace: "return Math.max(0.9, Math.min(s, 1.35));",
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-maker-fit.ts"],
  },
  // ---- Round-2 fixes (TASK-26) ----
  {
    name: "living: Save a Copy serialises the live DOM",
    reverts: "26a — pristine snapshot",
    file: "src/living/livingApp.ts",
    find: "const result = saveCopy(edited, { pristineHtml });",
    replace: 'const result = saveCopy(edited, { pristineHtml: "<!doctype html>\\n" + document.documentElement.outerHTML });',
    tests: ["tests/living.test.ts"],
  },
  {
    name: "living: copy keeps the original's file name",
    reverts: "26a.6 — new name",
    file: "src/shared/messages.ts",
    find: "count === 1 ? `${base} (copy).html`",
    replace: "count === 1 ? `${base}.html`",
    tests: ["tests/living.test.ts"],
  },
  {
    name: "living editor: the refresh after a text edit re-renders WITHOUT the selection listener (the J3 N3 bug)",
    reverts: "26e — one shared mountPreview",
    file: "src/living/editor.ts",
    find: "    if (!area) return;\n    this.mountPreview(area);\n    // The left list names",
    replace:
      "    if (!area) return;\n" +
      "    area.innerHTML = '';\n" +
      "    const w = el('div', '');\n" +
      "    area.appendChild(w);\n" +
      "    const rt = createRuntime(this.stack);\n" +
      "    rt.currentCardId = this.card().id;\n" +
      "    renderCard(this.card(), w, rt, () => {}, () => {}, {});\n" +
      "    // The left list names",
    tests: ["tests/living.test.ts"],
  },
  {
    name: "player: no Next Card on the front of a back-less flash card",
    reverts: "26b — player draws a way forward",
    file: "src/player/renderer.ts",
    find: 'if (side === "back" || !hasBack) {',
    replace: 'if (side === "back") {',
    tests: ["tests/forward-play.dom.test.ts"],
  },
  {
    name: "player: a button with no goto no longer falls forward",
    reverts: "26b/o — never greys out and stops",
    file: "src/player/renderer.ts",
    find: "if (fallbackNext === undefined || gotoOf(el.actions) !== null) return el;",
    replace: "return el;",
    tests: ["tests/forward-play.dom.test.ts"],
  },
  {
    name: "renderer: text is no longer fitted to its box",
    reverts: "26c — fit-text",
    file: "src/player/renderer.ts",
    find: "if (fit.size === defaultSize) return;",
    replace: "return;",
    tests: ["tests/forward-play.dom.test.ts"],
  },
  {
    name: "generator: invented pictures are kept",
    reverts: "26d — strip non-data pictures",
    file: "server/normalizeGenerated.ts",
    find: 'if (el["type"] === "image" && !isDataUri(el["src"])) return null;',
    replace: "",
    tests: ["tests/generated-normalize.test.ts", "tests/generate-hardening.test.ts"],
  },
  {
    name: "generator: the model's own layout (y=40) is used",
    reverts: "26c — template layout",
    file: "src/shared/layout.ts",
    find: "export const QUIZ_QUESTION: Rect = { x: 48, y: 104, w: 704, h: 144 };",
    replace: "export const QUIZ_QUESTION: Rect = { x: 48, y: 40, w: 704, h: 144 };",
    tests: ["tests/generated-normalize.test.ts", "tests/generate-hardening.test.ts"],
  },
  {
    name: "generator: a one-text flash card is not split",
    reverts: "26b — server normalisation",
    file: "server/normalizeGenerated.ts",
    find: "  if (t.length === 0) return null;\n\n  // 1. Newline",
    replace: "  return null;\n\n  // 1. Newline",
    tests: ["tests/generated-normalize.test.ts"],
  },
  {
    name: "generator: Title Case answers are left alone",
    reverts: "26j — sentence case",
    file: "server/normalizeGenerated.ts",
    find: "  if (words.length < 3) return label;\n  const capitalised",
    replace: "  return label;\n  const capitalised",
    tests: ["tests/generated-normalize.test.ts", "tests/generate-hardening.test.ts"],
  },
  {
    name: "generator: the timeout reason is sniffed from the message again",
    reverts: "26g — kind, not text",
    file: "server/stackGenerator.ts",
    find: 'return err.kind === "timeout" ? "timeout" : "error";',
    replace: 'return /time/i.test(err.message ?? "") ? "timeout" : "error";',
    tests: ["tests/generate-hardening.test.ts"],
  },
  {
    name: "generator: the retry is not counted against the budget (the survived mutant D)",
    reverts: "26g — retry budget test",
    file: "server/stackGenerator.ts",
    find: "const retry = await attempt(retryMessages, 0.2, opts.onModelCall, opts.signal);",
    replace: "const retry = await attempt(retryMessages, 0.2, undefined, opts.signal);",
    tests: ["tests/generate-hardening.test.ts"],
  },
  {
    name: "check: a card with no way forward is not reported",
    reverts: "26b/o — stuck cards",
    file: "src/shared/reachability.ts",
    find: "const stuck = live.filter((c) => !reported.has(c.id) && !cardHasForward(c));",
    replace: "const stuck: Card[] = [];",
    tests: ["tests/reachability.test.ts", "tests/flow.property.test.ts", "tests/maker/round2-editing.dom.test.ts"],
  },
  {
    name: "inspector: text typed into Back is dropped when there is no back",
    reverts: "26o — setFlashSide",
    file: "src/editor/Inspector.tsx",
    find: 'dispatch((s) => setFlashSide(s, card.id, "back", value));',
    replace: "if (back) dispatch((s) => editText(s, back.id, value));",
    tests: ["tests/maker/round2-editing.dom.test.ts"],
  },
  {
    name: "operations: a question can have unlimited answers",
    reverts: "26o — add an answer stops at four",
    file: "src/editor/operations.ts",
    find: "if (answers.length >= MAX_QUIZ_ANSWERS) return reject(ANSWERS_FULL_MESSAGE);",
    replace: "",
    tests: ["tests/maker/round2-editing.dom.test.ts"],
  },
  {
    name: "maker: a deliberately chosen ready-made deck is called a failure again",
    reverts: "26i — honest banner",
    file: "src/editor/fallbackMessages.ts",
    find: 'if (reason === "chosen") {',
    replace: 'if (reason === ("never" as string)) {',
    tests: ["tests/maker/round2-editing.dom.test.ts"],
  },
  {
    name: "maker: the wait screen promises 20 seconds again",
    reverts: "26f — honest estimate",
    file: "src/editor/StartScreen.tsx",
    find: "Usually 20–45 seconds.",
    replace: "About 20 seconds.",
    tests: ["tests/maker/round2-editing.dom.test.ts", "tests/maker/generate-flow.test.ts"],
  },
  {
    name: "mcp: the size cap is no longer clamped",
    reverts: "26h — maxKB clamp",
    file: "mcp/openverse/openverse.ts",
    find: "const maxKB = clampMaxKB(requestedKB);",
    replace: "const maxKB = requestedKB;",
    tests: ["mcp/openverse/openverse.test.ts"],
  },
  {
    name: "mcp: the timer is cleared once the headers arrive (slow-drip body hangs)",
    reverts: "26h — read timeout",
    file: "mcp/openverse/openverse.ts",
    find: "      const location = redirectLocation(res);",
    replace: "      clearTimeout(timer);\n      const location = redirectLocation(res);",
    tests: ["mcp/openverse/openverse.test.ts"],
  },
];

function run(tests: string[], gate?: string[]): number {
  const r =
    gate !== undefined
      ? spawnSync(gate[0]!, gate.slice(1), { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600_000 })
      : spawnSync("npx", ["vitest", "run", ...tests], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 300_000,
        });
  return r.status ?? 1;
}

function main(): void {
  const filter = process.argv.slice(2).find((a) => !a.startsWith("-"));
  const chosen = MUTANTS.filter((m) => filter === undefined || m.name.toLowerCase().includes(filter.toLowerCase()));
  if (chosen.length === 0) {
    console.error(`mutation-check: no mutant matches "${filter}".`);
    process.exit(1);
  }

  // Sanity: the guarding tests must be GREEN before we break anything.
  const all = [...new Set(chosen.flatMap((m) => m.tests))];
  if (all.length > 0 && run(all) !== 0) {
    console.error("mutation-check: the guarding tests are not green on the unmodified code; fix that first.");
    process.exit(1);
  }
  if (chosen.some((m) => m.gate !== undefined) && run([], chosen.find((m) => m.gate !== undefined)!.gate) !== 0) {
    console.error("mutation-check: the browser gate is not green on the unmodified code; fix that first.");
    process.exit(1);
  }

  const survived: Mutant[] = [];
  for (const m of chosen) {
    const abs = path.join(ROOT, m.file);
    const original = readFileSync(abs, "utf8");
    if (!original.includes(m.find)) {
      console.error(`mutation-check: cannot apply "${m.name}": text not found in ${m.file} (the code moved? update the mutant).`);
      process.exit(1);
    }
    try {
      writeFileSync(abs, original.replace(m.find, m.replace), "utf8");
      const status = run(m.tests, m.gate);
      if (status !== 0) {
        console.log(`  KILLED    ${m.name}   [reverts ${m.reverts}]`);
      } else {
        console.log(`  SURVIVED  ${m.name}   [reverts ${m.reverts}]  <-- no test caught this`);
        survived.push(m);
      }
    } finally {
      writeFileSync(abs, original, "utf8");
    }
  }

  console.log(`mutation-check: ${chosen.length - survived.length} of ${chosen.length} mutants killed.`);
  if (survived.length > 0) process.exit(1);
}

main();
