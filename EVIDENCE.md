# Evidence

Every headline number about Stackyard, the command or file that reproduces it, and what is not proven. Commands run from a clone of the submitted commit with Node 24 or later, after `npm ci`. Commands marked (Chrome) need a local Chrome or Chromium; without one they say so and skip. `npm run check:claims` checks the numbers in this file against the code, as it does for the README and the write-up.

## Numbers you can reproduce

| Number | What it means | Reproduce | Backed by |
|---|---|---|---|
| 1,514 tests pass | the whole Vitest suite: unit, integration, property and docs tests | `npm test` | CI on every push (`.github/workflows/ci.yml`) |
| 206 of 206 lettered task ids | every lettered task id in `.kiro/specs/*/tasks.md` is named in a test title, a gate script or a hook | `npm run check:trace` | `scripts/check-task-trace.ts` |
| 9 stack invariants | the rules every stack satisfies (unique UUID v4 ids, every go-to points at a real card, exactly one end card, one right answer per quiz card, everything inside the canvas, …) | `npm run check:invariants` | `src/shared/validator.ts`; `.kiro/steering/stack-format.md` |
| 75 fast-check properties | property-based tests over random stacks, edits, codes and files | `grep -rhoE "fc\.(property\|asyncProperty)\(" tests \| wc -l` | `tests/*.property.test.ts` and others |
| 1,000-run round trip | stack → HTML file → stack, lossless | `npm run check:invariants` | `numRuns` in `tests/roundtrip.property.test.ts` |
| 118 of 118 mutants killed | a script reverts 118 review fixes one at a time; each must turn a test red | `npm run check:mutants` (slow), or read the log | `docs/mutation-runs/2026-11-10-a215331.log` (clean tree); `check:claims` ties the count to the newest log and to the script's sha256 |
| 12.8 KB gzipped | the player runtime inlined in every lesson file (1 KB = 1,024 bytes) | `npm test` (size guard, budget 50 KB) | `dist/player/player.iife.js` |
| about 211 KB | a living export of the water-cycle test deck (decimal KB, bytes / 1000) | `npm run check:claims` | `tests/fixtures/generation/water-cycle-g2.json`; `tests/export-size.test.ts` |
| 149 KB | the play-only class export of the same water-cycle test deck (decimal KB, bytes / 1000) | `npx vitest run tests/round13-docs.test.ts` | `tests/fixtures/generation/water-cycle-g2.json` |
| 6 lesson files like the water-cycle test deck fit on a 1.44 MB floppy | floor(1,457,664 / that file's bytes), stated as at most 6 | `npm run check:claims` | `scripts/claims-lib.ts` (`FLOPPY_CLAIM`) |
| 54 bench lesson files, 0 network requests | every bench lesson file opened from disk in headless Chrome with the network blocked: a card renders, the first card plays, no request, no page error | `npm run check:bench` (Chrome) | `scripts/check-bench-offline.ts`; `bench/files/` |
| a living file that edits itself offline | export, edit in the Teacher tab, Save a Copy, open the copy and a copy of the copy with the network blocked, play to the end card | `npm run check:living-file` (Chrome) | `scripts/check-living-file.ts`; also the `living-file-gate` hook |
| class results with no server | three pupils play offline, their three codes plus a repeat and a typo go into the teacher's copy, every number in the table is checked, Save a Copy keeps the codes | `npm run check:class-results` (Chrome) | `scripts/check-class-results.ts`; `.kiro/specs/class-results/` |
| 493 hook firings | `ContextualHookInvoked` records in Kiro's session store, session `sess_4ead26b8`, 5 to 9 Nov, counted per hook | read the table | `docs/kiro-sessions/README.md` (section 5) |

## Content and accessibility numbers

Each sentence below is checked word for word against its data file by `npm run check:claims`.

- 54 of 55 England KS2 science objectives (Years 3–5) became a valid lesson file on the first try; 43 passed our automatic lesson check with no warnings (`bench/RESULTS.md` in the repo, one lesson file per objective). The checks are mechanical (structure, counts, answer overlap) and do not verify facts. This measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.
- An AI review of 60 quiz cards from 12 decks of an earlier bench run (v2) found 0 wrong keys and 2 ambiguous ones; the current run's re-recorded decks have 1 known wrong key (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's.
- In the 32 re-recorded decks that became lesson files in every run, an AI review found joke answers fell from 88 of 319 (v2) to 71 of 320 (v5) wrong answers; 1 wrong key (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's.
- Accessibility: axe-core 4.14.0 audited 16 pages (the Maker, the 3 samples in Play and in the Teacher tab, a class export, an end card with a results code, the Class results panel and 5 bench files) and found 0 serious or critical violations; the keyboard-only play-through passes and the one-switch scan play-through passes (`docs/accessibility/README.md` in the repo). No screen-reader user or disabled pupil has tested it.
- Reproduce: `npm run check:bench` (Chrome) replays the 55 recorded objectives from `bench/cache/` with no model call; the reviews are in `bench/LESSON_CHECKER.md`, `bench/key-review.json` and `bench/distractor-review*.json`; `npm run check:a11y` (Chrome) writes `docs/accessibility/axe-report.json`.

## Measured once (not re-runnable from the repo)
- **Live generation time.** Build Cards to the editor took 13.7 s in the video's take (labelled on screen); usually 10–20 s on the live app. It depends on the model host. The bench's in-process times are in `bench/RESULTS.md`.
- **A hook 1.6 s after Kiro's edit.** Two session-store lines shown in the video at 2:22 (a scratch-copy session, labelled).
- **Other browsers.** On 6 Nov, files exported before TASK-29/30 played offline in Playwright's Chromium, Firefox and WebKit builds (0 requests, 0 errors): `docs/cross-browser/`. Today's gates use headless Chrome only.
- **One MCP call through Kiro.** 10 Nov, 06:07Z: `docs/kiro-sessions/mcp-call-2026-11-10.md`.

## Kiro's limits in this build
- **The pre-submit hook (`PostTaskExec`) is not yet recorded firing.** kiro-cli sessions have no task-status tool, so a task ticked there is a file edit, and that does not fire it. The documented trigger is a task-status change in the Kiro IDE's tasks view, which we did not drive. kiro.dev lists Manual hooks as not invocable in the CLI, so we did not use one. The same gate runs on demand as `/pre-submit` (run once from kiro-cli on 6 Nov, session `2028064e`) or `npm run pre-submit`.
- **Hooks fire on the files they watch, not on every save.** `invariants-on-save` watches `src/shared` and `src/player`; `living-file-gate` watches `src/living`; `export-regression-check` watches the exporter, the security headers and the HTML template; `ready-made-content-check` watches the ready-made decks; `invariants-after-shell-edit` runs after a shell command that looks like it wrote a file.
- **MCP was mostly run as a script.** The Openverse server's search and allowlisted fetch were run as a script outside Kiro (Kiro's sandbox had no network) to pick the deck photos. Through Kiro, its search was called once, on 10 Nov, approved automatically by `--trust-all-tools`; no image from that call was used.
- **CLI only.** No Kiro IDE, no Powers, no Kiro Web. The sessions ran in vibe mode, with the spec format as the plan of record.
- **Session excerpts start on 5 Nov.** The excerpts in `docs/kiro-sessions/` come from sessions of 5 to 10 Nov. The steering, the first specs and the core code (30 Oct to 4 Nov) are recorded in `docs/KIRO_LOG.md` and the git history, not in session excerpts.
- **Some fixes were made outside Kiro,** such as the live-deploy model switches, the picture swap, a test follow-up for the video link and the hosting change. Each is logged in `docs/KIRO_LOG.md`.
- **The AI review panel.** Our own AI agents played judges in review rounds; the tasks they led to are marked in the specs (TASK-22 onwards) and logged in `docs/KIRO_LOG.md`.
- **Our coordinator worked outside Kiro.** The coordinator, an AI agent working outside Kiro, wrote the task briefs, recorded the bench runs, installed CI and keep-warm, changed the Render plan and edited parts of the write-up. Each is logged in `docs/KIRO_LOG.md`. Commits carry "(built in Kiro)" from TASK-30 (9 Nov) on; earlier Kiro work rests on `docs/KIRO_LOG.md`.

## Not proven
- **No real classroom.** No teacher or pupil has used Stackyard. The curriculum bench measures the generator against curriculum objectives; it is not a classroom study. The teacher and class in the video are AI-generated and tagged on screen.
- **Answer keys are AI-reviewed, not teacher-checked.** The automatic lesson check is mechanical and does not verify facts, so a wrong key passes it. The current run has 1 known wrong key. Joke answers are down but not gone; the joke-answer marker catches only a small share of them (`bench/DIAGNOSIS.md`), so Swap lets the teacher replace any wrong answer.
- **Kiro CLI only** (see above).
- **Accessibility** is an automated audit plus scripted keyboard and one-switch play-throughs. No screen-reader user or disabled pupil has tested it.
- **Browsers and hardware.** Real Safari, Windows and old school laptops were not tried.
- **Class results** were tested by script with three pupils and by hand. No class has used them.
- **Access during judging.** The live app is on a paid Render instance. A daily cap on model calls (`GENERATE_DAILY_CAP`, 300 a day by default) switches generation to the ready-made decks, and the app says so.
