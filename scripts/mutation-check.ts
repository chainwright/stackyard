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
import { baselineFailureMessage } from "./mutation-lib.js";

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
  /** Run after the mutant is reverted (e.g. rebuild a bundle the gate had built from the mutated source). */
  rebuild?: string[];
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
    find: "const linked = ensureForwardLinks(spliced.stack);",
    replace: "const linked = ensureForwardLinks(inserted);",
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
    find: ".drag-tab-left { top: auto; bottom: -34px; left: 50%; transform: translateX(-50%); }",
    replace: ".drag-tab-left { left: 0; transform: none; }",
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
  // ---- Round-6 fixes (TASK-30) ----
  {
    name: "server: any name under /samples is looked up on disk (allowlist gone)",
    reverts: "30c — allowlist only",
    file: "server/samples.ts",
    find: 'const name = [...SAMPLE_NAMES].find((n) => n === wanted);',
    replace: "const name = wanted.length > 0 ? wanted : undefined;",
    tests: ["tests/samples-route.test.ts"],
  },
  {
    name: "server (browser): the sample CSP forbids inline scripts, so no sample can play",
    reverts: "30c — sample CSP lets the lesson run",
    file: "server/samples.ts",
    find: `"script-src 'unsafe-inline'",`,
    replace: `"script-src 'none'",`,
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-sample-csp.ts"],
  },
  {
    name: "generator: the fold deletes a vocabulary card whose back is short (prose guard gone)",
    reverts: "30a — long prose only",
    file: "server/normalizeGenerated.ts",
    find: "if (!isLongProse(prose)) return stack;",
    replace: "void isLongProse;",
    tests: ["tests/round6-generation.test.ts"],
  },
  {
    name: "generator: the fold ignores that the other flash cards are term → translation pairs",
    reverts: "30a — vocabulary decks are left alone",
    file: "server/normalizeGenerated.ts",
    find: "if (pairs.length >= Math.ceil(others.length / 2)) return stack;",
    replace: "void pairs;",
    tests: ["tests/round6-generation.test.ts"],
  },
  {
    name: "generator: the fold happens even when nobody asked and the end card has a body",
    reverts: "30a — only when asked or the end card is bare",
    file: "server/normalizeGenerated.ts",
    find: "if (!asksForClosingMessage(ctx.prompt) && endHasBody) return stack;",
    replace: "void endHasBody;",
    tests: ["tests/round6-generation.test.ts"],
  },
  // ---- Round-5 fixes (TASK-29) ----
  {
    name: "editor: the insert notice stays after 'Link these in for me' (share-check repair)",
    reverts: "30i review — notice clears after a repair",
    file: "src/editor/EditorScreen.tsx",
    find: "            if (res.ok) setNotice(null);\n            if (res.ok) void onExport(kind);",
    replace: "            if (res.ok) void onExport(kind);",
    tests: ["tests/maker/round6-ui.dom.test.ts"],
  },
  {
    name: "generator: a short-term front in a vocabulary deck is folded again (vocabulary guard gone)",
    reverts: "30a review — short-term fronts are vocabulary",
    file: "server/normalizeGenerated.ts",
    find: "if (isVocabulary) return stack;",
    replace: "void isVocabulary;",
    tests: ["tests/round6-generation.test.ts"],
  },
  {
    name: "endLine: 'then the last card' alone counts as asking for a message again",
    reverts: "30a review — a message word tied to the last card",
    file: "src/shared/endLine.ts",
    find: "return ASKS_FOR_MESSAGE.some((re) => re.test(prompt));",
    replace: "return ASKS_FOR_MESSAGE.some((re) => re.test(prompt)) || /\\b(last|final|closing)\\s+(card|slide|page|screen)\\b/i.test(prompt);",
    tests: ["tests/round6-generation.test.ts"],
  },
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
  {
    name: "maker (browser): the digits font is inlined as a data: URI again (blocked by font-src 'self')",
    reverts: "30h — fonts are never inlined",
    file: "vite.config.ts",
    find: 'assetsInlineLimit: (file: string) => (file.endsWith(".woff2") ? false : undefined),',
    replace: "assetsInlineLimit: 1_000_000,",
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-maker-fit.ts"],
  },
  {
    name: "maker (real server CSP): the digits font is inlined as a data: URI and the server's font-src 'self' blocks it",
    reverts: "30h review — fonts load under the real CSP",
    file: "vite.config.ts",
    find: 'assetsInlineLimit: (file: string) => (file.endsWith(".woff2") ? false : undefined),',
    replace: "assetsInlineLimit: 1_000_000,",
    tests: [],
    gate: ["node", "--import", "tsx/esm", "scripts/check-maker-fonts.ts"],
  },
  // ---- v2 round-2 fixes (TASK-32) ----
  {
    name: "claims: the article before a number is always 'a' (\"a 86-mutant\")",
    reverts: "32h — a / an by how the number is spoken",
    file: "scripts/claims-lib.ts",
    find: '  return an ? "an" : "a";',
    replace: '  return an ? "a" : "a";',
    tests: ["tests/round8-docs.test.ts"],
  },
  {
    name: "claims: a wrong number in the write-up is accepted",
    reverts: "32g — the write-up is checked like the README",
    file: "scripts/claims-lib.ts",
    find: "    ok: c.values.every((v) => close(c.name, v, actual[c.name])),",
    replace: "    ok: true,",
    tests: ["tests/round8-docs.test.ts"],
  },
  {
    name: "claims: --fix leaves a wrong write-up number in place",
    reverts: "32g — --fix rewrites the write-up from measured values",
    file: "scripts/claims-lib.ts",
    find: "      if (pair) return `${s[0]}${v}${s[2]}${v}${s[4]}`;",
    replace: "      if (pair) return whole;",
    tests: ["tests/round8-docs.test.ts"],
  },
  {
    name: "teacher tab: the flash / last-card 'can't be dragged' note is gone",
    reverts: "32d — say which cards can't be dragged",
    file: "src/living/editor.ts",
    find: 'if (card.kind === "flash" || card.kind === "end") {\n      const note = el("p", "sy-living-hint sy-no-drag");',
    replace: 'if (false) {\n      const note = el("p", "sy-living-hint sy-no-drag");',
    tests: ["tests/maker/round8-ui.dom.test.ts"],
  },
  {
    name: "prompt: a quiz may have two answers again (no 3-or-4 rule)",
    reverts: "32b.1 — three or four answers in the prompt",
    file: "server/promptBuilder.ts",
    find: "has 3 or 4 answer buttons, exactly one of them right",
    replace: "has at least two answer buttons, exactly one of them right",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "lesson check: a two-answer quiz is not flagged",
    reverts: "32b.1 — the share check flags two answers",
    file: "src/shared/lessonCheck.ts",
    find: "if (answers.length === 2 && !isTwoWayComparison(primaryText(card))) {",
    replace: "if (answers.length === 2 && false) {",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "generator: repeated cards are kept",
    reverts: "32b.2 — drop repeats",
    file: "server/normalizeGenerated.ts",
    find: "const deduped = laidValid ? removeRepeatedCards(laid) : { stack: laid, removed: 0 };",
    replace: "const deduped = { stack: laid, removed: 0 };",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "generator: extra quiz cards beyond the request are kept",
    reverts: "32b.3 — trim to the counts asked for",
    file: "server/normalizeGenerated.ts",
    find: "const trimmed = laidValid ? trimToRequestedCounts(deduped.stack, requested) : deduped.stack;",
    replace: "const trimmed = deduped.stack;",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "prompt: the counts from the sentence are not put in the prompt",
    reverts: "32b.3 — hard numbers in the prompt",
    file: "server/promptBuilder.ts",
    find: 'const counts = exact.length > 0 ? `\\n\\n${exact}` : "";',
    replace: 'const counts = "";',
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "generator: a picture that names the right answer is kept",
    reverts: "32b.4 — no giveaway pictures",
    file: "server/normalizeGenerated.ts",
    find: "return pictureGivesAnswerAway(withPicture) ? laid : withPicture;",
    replace: "return withPicture;",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "lesson check: a right answer inside a wrong one is not flagged",
    reverts: "32b.5 — ambiguous keys",
    file: "src/shared/lessonCheck.ts",
    find: "if (containsWords(wrong.label, right.label) || containsWords(right.label, wrong.label)) {",
    replace: "if (false) {",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "lesson check: a quiz that restates a flash card is not flagged",
    reverts: "32b.5 — restates a flash card",
    file: "src/shared/lessonCheck.ts",
    find: 'if (prev.kind === "flash" && restatesFlash(card, prev)) {',
    replace: "if (false) {",
    tests: ["tests/round8-quality.test.ts"],
  },
  {
    name: "share check: lesson warnings are left out of Before you share",
    reverts: "32b.5 — warnings reach the teacher",
    file: "src/shared/shareCheck.ts",
    find: "  const warnings = lessonWarnings(stack);",
    replace: "  const warnings: LessonWarning[] = [];",
    tests: ["tests/round8-quality.test.ts", "tests/maker/round8-ui.dom.test.ts"],
  },
  {
    name: "generator: the pictogram credit line is printed on the child's card again",
    reverts: "32c — no on-card credit",
    file: "server/normalizeGenerated.ts",
    find: "      { type: \"image\", id: newId(), ...PICTURE_SLOT, src: pictogramDataUri(name), alt: pictogramAlt(name) },\n    ],\n  };\n}",
    replace: "      { type: \"image\", id: newId(), ...PICTURE_SLOT, src: pictogramDataUri(name), alt: pictogramAlt(name) },\n      { type: \"text\", id: newId(), x: 48, y: 566, w: 340, h: 28, content: \"Picture: Stackyard pictogram\" },\n    ],\n  };\n}",
    tests: ["tests/pictograms.test.ts"],
  },
  // ---- v2 panel fixes (TASK-31) ----
  {
    name: "normalizer: a bare 'Q0' back is treated as a counter header and erased again",
    reverts: "31g — only clear chrome is dropped",
    file: "server/normalizeGenerated.ts",
    find: "/^\\s*(?:question|card)\\s*#?\\d+\\s*(?:of\\s*\\d+)?\\s*[:.)\\-–—]?\\s*$/i.test(text) ||",
    replace: "/^\\s*(?:question|q|card)\\s*#?\\d+\\s*(?:of\\s*\\d+)?\\s*[:.)\\-–—]?\\s*$/i.test(text) ||",
    tests: ["tests/round6-generation.test.ts"],
  },  {
    name: "gateway: the idle deadline is armed from the first chunk again (a role chunk starts the 20 s clock)",
    reverts: "31c — first-token deadline",
    file: "server/llmGateway.ts",
    find: "if (sawContent) armIdle();",
    replace: "armIdle();",
    tests: ["tests/llmGateway-wait.test.ts"],
  },
  {
    name: "gateway: the Anthropic host no longer defaults to thinking off",
    reverts: "31c — thinking off for api.anthropic.com",
    file: "server/llmThinking.ts",
    find: '=== "api.anthropic.com" ? "off" : "on";',
    replace: '=== "api.anthropic.com" ? "on" : "on";',
    tests: ["tests/llmGateway-wait.test.ts"],
  },
  {
    name: "normalizer: a model element with no coordinates is no longer given a default box",
    reverts: "31c — coordinate-free model output",
    file: "server/normalizeGenerated.ts",
    find: "    return fallback?.[key];",
    replace: "    return undefined;",
    tests: ["tests/round7-generation.test.ts"],
  },
  {
    name: "prompt: the flash-definition rule is reversed in the prompts",
    reverts: "31e — don't ask for the definition just given",
    file: "server/promptBuilder.ts",
    find: "Don't ask for the definition just given",
    replace: "Do ask for the definition just given",
    tests: ["tests/round7-generation.test.ts"],
  },
  {
    name: "start screen: empty slots in the deal pile are filled paper again (no ghost outlines)",
    reverts: "31c — ghost cards while planning",
    file: "src/editor/StartScreen.tsx",
    find: '${card == null ? " deal-ghost" : ""}',
    replace: '${""}',
    tests: ["tests/maker/round7-ui.dom.test.ts"],
  },
  {
    name: "start screen: a quiz preview card with no answers yet shows an empty tile grid",
    reverts: "31c — never empty answer tiles",
    file: "src/editor/StartScreen.tsx",
    find: 'top.kind === "quiz" && top.answers.length > 0 ?',
    replace: 'top.kind === "quiz" ?',
    tests: ["tests/maker/round7-ui.dom.test.ts"],
  },
  {
    name: "living (browser): the phone media query is gone (list beside a clipped card at 390 px)",
    reverts: "31b — Teacher tab fits a phone",
    file: "src/living/styles.ts",
    find: "@media (max-width: 699px) {",
    replace: "@media (max-width: 1px) {",
    tests: [],
    // The gate opens the BUILT bundle, so it builds the mutated source first.
    gate: ["sh", "-c", "npx vite build --config vite.living.config.ts --logLevel error && node --import tsx/esm scripts/check-living-mobile.ts"],
    rebuild: ["npx", "vite", "build", "--config", "vite.living.config.ts", "--logLevel", "error"],
  },
  {
    name: "operations: moveElement stops clamping x to the canvas (drag off the right edge)",
    reverts: "31d — drags stay on the canvas",
    file: "src/editor/operations.ts",
    find: "const clampedX = clamp(x, 0, 800 - moving.w);",
    replace: "const clampedX = x;",
    tests: ["tests/living-drag.dom.test.ts"],
  },
  // ---- Round-6 fixes (TASK-30 g, i) ----
  {
    name: "flow: a card added after a fork leads to deck-next again",
    reverts: "30i — fork-aware splice",
    file: "src/shared/flow.ts",
    find: "x = rejoinCard(stack, before, fresh.id) ?? undefined;",
    replace: "x = deckNext?.id;",
    tests: ["tests/round6-flow.test.ts"],
  },
  {
    name: "operations: repairFlow adds a button to a story fork again",
    reverts: "30i — forks are never given another button",
    file: "src/editor/operations.ts",
    find: "if (isChoiceFork(p)) return null;",
    replace: "",
    tests: ["tests/round6-flow.test.ts"],
  },
  {
    name: "operations: the end-card message is not capped at 300",
    reverts: "30g — message cap",
    file: "src/editor/operations.ts",
    find: "const value = text.slice(0, MAX_END_MESSAGE);",
    replace: "const value = text;",
    tests: ["tests/maker/round6-ui.dom.test.ts"],
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
    name: "generator: a model-supplied picture src is passed through (model bytes reach src)",
    reverts: "26d / 31h — only a NAME from our set becomes a picture",
    file: "server/normalizeGenerated.ts",
    find: 'if (el["type"] === "image") return sanitizePicto(el);',
    replace: 'if (el["type"] === "image") return typeof el["src"] === "string" && /^data:/i.test(el["src"]) ? el : sanitizePicto(el);',
    tests: ["tests/generated-normalize.test.ts", "tests/generate-hardening.test.ts", "tests/pictograms.test.ts"],
  },
  {
    name: "generator: the pictogram's src is taken from the model's own src field",
    reverts: "31h — src is built from our set",
    file: "server/normalizeGenerated.ts",
    find: "    src: pictogramDataUri(name),\n    alt: pictogramAlt(name),\n  };\n}",
    replace: '    src: typeof el["src"] === "string" ? el["src"] : pictogramDataUri(name),\n    alt: pictogramAlt(name),\n  };\n}',
    tests: ["tests/pictograms.test.ts"],
  },
  {
    name: "generator: a second picture on one card is kept",
    reverts: "31h — at most one picture per card",
    file: "server/normalizeGenerated.ts",
    find: "      if (seen) return false;",
    replace: "      void seen;",
    tests: ["tests/pictograms.test.ts"],
  },
  {
    name: "generator: a picture on the end card is kept",
    reverts: "31h — never on the end card",
    file: "server/normalizeGenerated.ts",
    find: 'if (input["kind"] === "end") elements = elements.filter((e) => !isImage(e));',
    replace: 'if (input["kind"] === "end") void isImage;',
    tests: ["tests/pictograms.test.ts"],
  },
  {
    name: "layout: the picture slot moves down onto the question",
    reverts: "31h — the picture sits clear of every other element",
    file: "src/shared/layout.ts",
    find: "export const PICTURE_SLOT: Rect = { x: 356, y: 8, w: 88, h: 88 };",
    replace: "export const PICTURE_SLOT: Rect = { x: 356, y: 120, w: 88, h: 88 };",
    tests: ["tests/pictograms.test.ts"],
  },
  {
    name: "prompt: the picture names are not listed",
    reverts: "31h — the prompts name the pictures",
    file: "server/promptBuilder.ts",
    find: "${PICTOGRAM_NAMES.join(\", \")}",
    replace: "",
    tests: ["tests/pictograms.test.ts"],
  },
  {
    name: "player: a flash card's picture is not drawn",
    reverts: "31h — flash cards show their picture",
    file: "src/player/renderer.ts",
    find: "for (const pic of pictures) {",
    replace: "for (const pic of [] as typeof pictures) {",
    tests: ["tests/maker/round7-pictures.dom.test.ts"],
  },
  {
    name: "operations: swapping a picture leaves the old credit line behind",
    reverts: "31h — setPictogram takes the old credit off",
    file: "src/editor/operations.ts",
    find: "      !(e.type === \"text\" && isPictogramCredit(e.content)),\n  );\n  if (name === null)",
    replace: "      true,\n  );\n  if (name === null)",
    tests: ["tests/maker/round7-pictures.dom.test.ts"],
  },
  {
    name: "start screen: hasPictograms counts decks WITHOUT our pictures",
    reverts: "31h — the note tells the truth",
    file: "src/editor/StartScreen.tsx",
    find: "pictogramNameOfSrc(e.src) !== null));",
    replace: "pictogramNameOfSrc(e.src) === null));",
    tests: ["tests/maker/round7-pictures.dom.test.ts"],
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
    find: "const retry = await attempt(retryMessages, 0.2, opts.onModelCall, opts.signal, request.prompt);",
    replace: "const retry = await attempt(retryMessages, 0.2, undefined, opts.signal, request.prompt);",
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
    name: "maker: the wait screen says 20–45 seconds again",
    reverts: "26f / 32a — the measured estimate (old 20–45 copy)",
    file: "src/editor/StartScreen.tsx",
    find: "Usually about 10–20 seconds.",
    replace: "Usually 20–45 seconds.",
    tests: ["tests/maker/round2-editing.dom.test.ts", "tests/maker/generate-flow.test.ts"],
  },
  {
    name: "start screen: the wait copy promises about 20 seconds",
    reverts: "26f / 32a — the measured estimate (flat 20 s)",
    file: "src/editor/StartScreen.tsx",
    find: "Usually about 10–20 seconds.",
    replace: "Usually about 20 seconds.",
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
  // ---- the lesson is the file (TASK-33) ----
  {
    name: "claims: the floppy count rounds up (7.68 → 8 lessons on a floppy)",
    reverts: "33b — floor(1,457,664 / bytes), never rounded up",
    file: "scripts/claims-lib.ts",
    find: "  return Math.floor(FLOPPY_BYTES / bytes);",
    replace: "  return Math.ceil(FLOPPY_BYTES / bytes);",
    tests: ["tests/export-size.test.ts"],
  },
  // ---- the curriculum bench (TASK-33c) ----
  {
    name: "claims: the bench line is accepted whatever its numbers",
    reverts: "33c7 — the bench line is checked against bench/results.json",
    file: "scripts/claims-lib.ts",
    find: "      ok: claimed.objectives === bench.objectives && claimed.firstTry === bench.firstTry && claimed.lessonClean === bench.lessonClean,",
    replace: "      ok: true,",
    tests: ["tests/bench.test.ts"],
  },
  {
    name: "bench: replay ids are random again (files differ run to run)",
    reverts: "33c4 — replay is deterministic",
    file: "scripts/bench-lib.ts",
    find: '  Object.defineProperty(c, "randomUUID", { value: seededUuids(seed), configurable: true, writable: true });',
    replace: "",
    tests: ["tests/bench.test.ts"],
  },
  {
    name: "prompt: 'vary which position the right answer sits in' is back (and no 'Stackyard shuffles')",
    reverts: "33c9 — mark the right answer on its own button; Stackyard shuffles",
    file: "server/promptBuilder.ts",
    find: "Stackyard shuffles the order of the answers itself, so do not move answers around and never write the same answer twice.",
    replace: "VARY which position the correct answer sits in across the quiz cards — do NOT always make the first button the right one.",
    tests: ["tests/bench-v2.test.ts"],
  },
  {
    name: "prompt: the card plan is only at the end of the request, not at the top",
    reverts: "33c10 — the card plan opens and closes the request",
    file: "server/promptBuilder.ts",
    find: "return `${plan}\\n\\nGenerate a stack for: \"${prompt}\"${counts}\\n\\n${plan}`;",
    replace: "return `Generate a stack for: \"${prompt}\"${counts}\\n\\n${plan}`;",
    tests: ["tests/bench-v2.test.ts"],
  },
  {
    name: "claims: the key-review line is accepted whatever its numbers",
    reverts: "33c16 — the key-review line is checked against bench/key-review.json",
    file: "scripts/claims-lib.ts",
    find: "      ok: claimed.cards === review.cards && claimed.decks === review.decks && claimed.wrong === review.wrong && claimed.ambiguous === review.ambiguous,",
    replace: "      ok: true,",
    tests: ["tests/bench-v3.test.ts"],
  },
  // ---- accessibility evidence (TASK-33d) ----
  {
    name: "player: an answer tile loses its accessible name (no 'Triangle: …')",
    reverts: "33d2 — tiles are named with their shape",
    file: "src/player/renderer.ts",
    find: '    btn.setAttribute("aria-label", tileAccessibleName(slotIndex, el.label));',
    replace: "",
    tests: ["tests/a11y-player.dom.test.ts"],
  },
  {
    name: "player: the live region is turned off (aria-live=off)",
    reverts: "33d2 — 'Correct' / 'Not quite' are announced",
    file: "src/player/renderer.ts",
    find: '  el.setAttribute("aria-live", "polite");',
    replace: '  el.setAttribute("aria-live", "off");',
    tests: ["tests/a11y-player.dom.test.ts"],
  },
  {
    name: "scan: the highlight never advances past the first choice",
    reverts: "33d4 — one-switch scanning steps across the choices",
    file: "src/player/scan.ts",
    find: "  const next = list[(at + 1) % list.length]!;",
    replace: "  const next = list[0]!;",
    tests: ["tests/a11y-player.dom.test.ts"],
  },
  {
    name: "claims: the accessibility line is accepted whatever its numbers",
    reverts: "33d6 — the accessibility line is checked against axe-report.json",
    file: "scripts/claims-lib.ts",
    find: "      ok: claimed.axeVersion === a.axeVersion && claimed.pages === a.pages && claimed.seriousOrCritical === a.seriousOrCritical && claimed.keyboard === a.keyboard && claimed.scan === a.scan,",
    replace: "      ok: true,",
    tests: ["tests/a11y-claims.test.ts"],
  },
  // ---- no joke distractors (TASK-34a) ----
  {
    name: "lesson check: the joke-answer markers never fire",
    reverts: "34a2 — 'may be a joke answer'",
    file: "src/shared/lessonCheck.ts",
    find: "    if (m.re.test(text) && !m.re.test(question)) return m.why;",
    replace: "    if (false) return m.why;",
    tests: ["tests/joke-answers.test.ts"],
  },
  {
    name: "prompt: the wrong-answer rule loses 'never silly, magic or impossible options'",
    reverts: "34a3 — a mistake a pupil might really make",
    file: "server/promptBuilder.ts",
    find: "Never silly, magic or impossible options. Never jokes",
    replace: "Never jokes",
    tests: ["tests/joke-answers.test.ts"],
  },
  {
    name: "claims: a bench line without 'do not verify facts' is accepted",
    reverts: "33c14 — the bench line says the checks are mechanical",
    file: "scripts/claims-lib.ts",
    find: "  if (!line.includes(BENCH_MECHANICAL)) {",
    replace: "  if (false) {",
    tests: ["tests/bench-v3.test.ts"],
  },
];

function run(tests: string[], gate?: string[]): { status: number; output: string } {
  const r =
    gate !== undefined
      ? spawnSync(gate[0]!, gate.slice(1), { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 600_000 })
      : spawnSync("npx", ["vitest", "run", ...tests], {
          cwd: ROOT,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 300_000,
        });
  return { status: r.status ?? 1, output: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
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
  if (all.length > 0) {
    const base = run(all);
    if (base.status !== 0) {
      console.error(baselineFailureMessage("tests", base.output));
      process.exit(1);
    }
  }
  const firstGate = chosen.find((m) => m.gate !== undefined);
  if (firstGate !== undefined) {
    const base = run([], firstGate.gate);
    if (base.status !== 0) {
      console.error(baselineFailureMessage("gate", base.output));
      process.exit(1);
    }
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
      const { status } = run(m.tests, m.gate);
      if (status !== 0) {
        console.log(`  KILLED    ${m.name}   [reverts ${m.reverts}]`);
      } else {
        console.log(`  SURVIVED  ${m.name}   [reverts ${m.reverts}]  <-- no test caught this`);
        survived.push(m);
      }
    } finally {
      writeFileSync(abs, original, "utf8");
      // A gate that runs a BUILT bundle must not leave the mutated build behind.
      if (m.rebuild !== undefined) spawnSync(m.rebuild[0]!, m.rebuild.slice(1), { cwd: ROOT, stdio: "ignore" });
    }
  }

  console.log(`mutation-check: ${chosen.length - survived.length} of ${chosen.length} mutants killed.`);
  if (survived.length > 0) process.exit(1);
}

main();
