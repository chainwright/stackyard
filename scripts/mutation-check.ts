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
}

const MUTANTS: Mutant[] = [
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
    find: "return `${base} (copy).html`;",
    replace: "return `${base}.html`;",
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
    find: "export const QUIZ_QUESTION: Rect = { x: 48, y: 104, w: 704, h: 160 };",
    replace: "export const QUIZ_QUESTION: Rect = { x: 48, y: 40, w: 704, h: 160 };",
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
    find: "const retry = await attempt(retryMessages, 0.2, opts.onModelCall);",
    replace: "const retry = await attempt(retryMessages, 0.2);",
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
    find: "About 30–45 seconds.",
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

function run(tests: string[]): number {
  const r = spawnSync("npx", ["vitest", "run", ...tests], {
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
  if (run(all) !== 0) {
    console.error("mutation-check: the guarding tests are not green on the unmodified code; fix that first.");
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
      const status = run(m.tests);
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
