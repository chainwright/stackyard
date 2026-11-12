# Claims and their status

Every public claim we make about Stackyard, in the README, the Devpost write-up (`docs/DEVPOST_WRITEUP.md`) and the blog post, with its status and where to check it. **TRUE** means checked against the code, a file in this repo or a cited source. **PARTIAL** means true as far as it goes; the last column says what is missing. The blog post is on dev.to: https://dev.to/automate_ai/we-brought-back-hypercards-stack-not-its-editor-3g3g

`npm run check:claims` checks this file: each quoted claim must appear word for word on the README or write-up line it cites, each status must be TRUE or PARTIAL, and each PARTIAL row must say what is missing. The blog is not in this repo, so its rows were checked by hand (11 Nov 2026). Quotes keep the wording; the current numbers are in [EVIDENCE.md](EVIDENCE.md).

| # | Claim | Where | Status | Proof, or what is missing |
|---|---|---|---|---|
| C1 | "one HTML file that plays, scores and edits itself with the Wi-Fi off" | docs/DEVPOST_WRITEUP.md:18 | TRUE | `npm run check:living-file`; `npm run check:bench` (lesson files opened with the network blocked, 0 requests) |
| C2 | "Stackyard deals the cards as the model writes them" | docs/DEVPOST_WRITEUP.md:21 | TRUE | `tests/stream-generate.test.ts`; video 0:24–0:38 (real time, labelled) |
| C3 | "no model call, and one Undo puts it back" | docs/DEVPOST_WRITEUP.md:22 | TRUE | `src/editor/swapCandidates.ts`; the swap mutants in `scripts/mutation-check.ts` |
| C4 | "lesson files like the water-cycle test deck fit on a 1.44 MB floppy" | docs/DEVPOST_WRITEUP.md:23, README.md:186 | TRUE | `npm run check:claims` (floppy count); EVIDENCE.md |
| C5 | "with no account, no install and no internet" | docs/DEVPOST_WRITEUP.md:23 | TRUE | For the exported file (the Maker needs the internet, as the README's first paragraph says): `npm run check:export-opens`, `npm run check:bench` |
| C6 | "Save a Copy writes a new file that can edit itself too" | docs/DEVPOST_WRITEUP.md:24 | TRUE | `npm run check:living-file` (a copy of a copy plays and saves) |
| C7 | "with nothing leaving the laptop" | docs/DEVPOST_WRITEUP.md:25 | TRUE | `npm run check:class-results`; `src/living` and `src/player` make no fetch, XHR, WebSocket or beacon call |
| C8 | "Every path ends in the same playable file." | docs/DEVPOST_WRITEUP.md:26 | TRUE | `src/editor/StartScreen.tsx`: a ready-made deck and typed questions open in the same Maker and export the same way |
| C9 | "At least one builds a stack from a description" | docs/DEVPOST_WRITEUP.md:29 | PARTIAL | Missing: from our own web search of public pages (9 Nov); the Kiroween 2026 gallery was not public yet. NecroCard says so in its own README. |
| C10 | "we found no AI generation or self-saving copy in it" | docs/DEVPOST_WRITEUP.md:29 | PARTIAL | Missing: this is what AfterStack's public page shows; we did not test the tool itself. |
| C11 | "Caramel, made by two teachers" | docs/DEVPOST_WRITEUP.md:29 | TRUE | outilstice.com's article on Caramel ("créée par deux enseignants") |
| C12 | "saves one self-contained HTML file that keeps its editor, but it has no AI generation" | docs/DEVPOST_WRITEUP.md:31 | TRUE | https://beyondloom.com/decker/ |
| C13 | "at least 500 characters of pasted text" | docs/DEVPOST_WRITEUP.md:33 | TRUE | H5P's Smart Import step-by-step tutorial (help.h5p.com) |
| C14 | "Wayground also exports printable PDF or DOC worksheets" | docs/DEVPOST_WRITEUP.md:33 | PARTIAL | Missing: a link to Wayground's own help page. |
| C15 | "but the file has no editor inside and no class results" | README.md:152 | TRUE | OpenMAIC's README Export table (checked 12 Nov 2026): 'Offline HTML: One file that plays the classroom without a network connection'; the Classroom ZIP is a separate export for backup or sharing. Nothing in it describes an editor or class results inside the HTML file. |
| C16 | "Six specs: five product features" | docs/DEVPOST_WRITEUP.md:43 | TRUE | `.kiro/specs/` has six folders (test TASK-38b) |
| C17 | "Every lettered task id is named in a test title, a gate or a hook" | docs/DEVPOST_WRITEUP.md:43 | TRUE | `npm run check:trace`; EVIDENCE.md |
| C18 | "75 fast-check properties" | docs/DEVPOST_WRITEUP.md:45 | TRUE | `npm run check:claims` counts them; EVIDENCE.md |
| C19 | "118 of 118 killed in the newest logged run" | docs/DEVPOST_WRITEUP.md:45 | TRUE | `docs/mutation-runs/2026-11-10-a215331.log`; `check:claims` ties the count to the newest log and the script's hash |
| C20 | "Kiro's session store recorded 493 hook firings" | docs/DEVPOST_WRITEUP.md:46, README.md:132 | PARTIAL | Missing: the raw session store is not in the repo; the excerpts and the per-hook counts are in `docs/kiro-sessions/README.md`. |
| C21 | "is not yet recorded firing" | docs/DEVPOST_WRITEUP.md:46 | TRUE | A stated limit: `docs/kiro-sessions/README.md` (sections 5 and 6); EVIDENCE.md |
| C22 | "that an earlier fix of ours had introduced" | docs/DEVPOST_WRITEUP.md:47 | TRUE | `docs/KIRO_LOG.md` (the lesson-checker entry: "introduced by the earlier TASK-22 … fix"); `docs/kiro-sessions/README.md` section 3 |
| C23 | "its search was also called once through Kiro as an MCP tool (10 Nov)" | docs/DEVPOST_WRITEUP.md:48, README.md:134 | TRUE | `docs/kiro-sessions/README.md` section 6; `docs/kiro-sessions/mcp-call-2026-11-10.md` |
| C24 | "Kiro CLI wrote the steering and specs and most of the code" | docs/DEVPOST_WRITEUP.md:49 | PARTIAL | Missing: the session excerpts start on 5 Nov; 30 Oct to 8 Nov rests on `docs/KIRO_LOG.md` and the git history (the '(built in Kiro)' mark starts at TASK-30). |
| C25 | "12.8 KB gzipped against a 50 KB budget" | docs/DEVPOST_WRITEUP.md:63 | TRUE | `npm run check:claims`; the size guard in `npm test` |
| C26 | "a generated lesson file is now about 211 KB" | docs/DEVPOST_WRITEUP.md:9 | TRUE | `npm run check:claims` (decimal KB, ±3 %) |
| C27 | "became a valid lesson file on the first try" | docs/DEVPOST_WRITEUP.md:64, README.md:190 | TRUE | `bench/RESULTS.md`; `npm run check:bench`. The checks are mechanical and do not verify facts. |
| C28 | "found 0 serious or critical violations" | docs/DEVPOST_WRITEUP.md:67, README.md:193 | TRUE | `npm run check:a11y`; `docs/accessibility/axe-report.json`. An automated audit, not a user test. |
| C29 | "an AI review found joke answers fell from" | docs/DEVPOST_WRITEUP.md:66, README.md:192 | TRUE | `bench/LESSON_CHECKER.md`; `bench/distractor-review*.json`. An AI review, not a teacher's. |
| C30 | "113 green tests still let a real defect through" | docs/DEVPOST_WRITEUP.md:55 | TRUE | `docs/KIRO_LOG.md`, 30 Oct (113/113 tests, then the UUID v4 defect from a live run) |
| C31 | "All jsdom tests were green while real Chrome showed five problems" | docs/DEVPOST_WRITEUP.md:56 | TRUE | `docs/KIRO_LOG.md`, 31 Oct ("five problems the tests could not see") |
| C32 | "keyed the limit on the address Cloudflare sets" | docs/DEVPOST_WRITEUP.md:57 | TRUE | `server/clientAddress.ts`; `tests/client-address.test.ts` |
| C33 | "A test now fails if any bundle the server reads is missing from the build." | docs/DEVPOST_WRITEUP.md:58 | TRUE | `tests/render-build.test.ts` |
| C34 | "about 23 s in seven on-screen windows, eight shots in all" | docs/DEVPOST_WRITEUP.md:79 | TRUE | the YouTube description lists the seven windows; each shot is tagged on screen |
| C35 | "a paid Render instance, so it stays awake" | docs/DEVPOST_WRITEUP.md:12 | TRUE | `render.yaml` (`plan: starter`) |
| C36 | "plays offline in Chrome (checked by our gates)" | README.md:19 | TRUE | `npm run check:export-opens`; `npm run check:bench`; the one-off Firefox and WebKit run is in `docs/cross-browser/` |
| C37 | "it makes **zero network requests**" | README.md:31 | TRUE | `npm run check:bench`; `npm run check:living-file` (network blocked) |
| C38 | "Any one wrong letter, or two neighbouring" | README.md:66 | TRUE | `tests/results-code.property.test.ts` (every substitution and adjacent swap, exhaustively) |
| C39 | "Length: nine characters for five questions, 11 for ten and 14 for 20" | README.md:70 | TRUE | `tests/results-code.property.test.ts` |
| C40 | "No names or accounts are collected" | README.md:81 | TRUE | `src/living/classResults.ts` (up to three optional initials); no network use (C7) |
| C41 | "we have not found one that turns a teacher's sentence into a checked lesson file that plays and edits itself offline" | README.md:141 | PARTIAL | Missing: a search result, not proof that none exists. |
| C42 | "round-tripped losslessly, checked by a 1,000-run property test" | README.md:144 | TRUE | `tests/roundtrip.property.test.ts` |
| C43 | "We built it with Kiro over about ten days." | blog | TRUE | first commit 30 Oct (`c68ffc7`), build commits until 10 Nov (git log) |
| C44 | "The review of the class-results spec found two serious problems, and its design doc records both." | blog | TRUE | `.kiro/specs/class-results/design.md` (P0-1, P0-2) |
| C45 | "On 10 Nov all 176 did; on 12 Nov, after more tasks, all 206 do." | blog | TRUE | `npm run check:trace` (176 of 176 at the 10 Nov commits; 206 of 206 on 12 Nov) |
| C46 | "Before we had that script, the count was quietly drifting." | blog | PARTIAL | Missing: `docs/KIRO_LOG.md` records that the stricter script found the real count was 51 of 84; there is no record of the count over time. |
| C47 | "Across 5–9 November the session store recorded 493 hook firings" | blog | PARTIAL | Missing: as C20, the raw store is not in the repo. |
| C48 | "an ambiguous Vikings question that one of our own fixes had introduced" | blog | TRUE | as C22 |
| C49 | "113 green tests still let a defect through" | blog | TRUE | as C30 |
| C50 | "In the last logged run, all 118 were caught." | blog | TRUE | as C19 |
| C51 | "gate on day one, not day seven" | blog | TRUE | the export-opens hook came on 5 Nov, day 7 (`docs/KIRO_LOG.md`); review in a real browser began on 31 Oct, day 2 |
| C52 | "ours grew to six" | blog | TRUE | `.kiro/steering/` has six files |
| C53 | "another exports a stack as one play-only HTML file" | docs/DEVPOST_WRITEUP.md:29, README.md:141 | PARTIAL | Missing: from that entry's public repository (its spec: "File -> Export Standalone HTML", a browse-only player); it was not on Devpost on 11 Nov and we did not run it. |
| C54 | "Egatari's lesson file plays offline and carries its own source" | docs/DEVPOST_WRITEUP.md:31 | TRUE | https://github.com/egatari/egatari-spec and https://github.com/egatari/egatari-studio (README: "--portable writes one HTML file ... that plays offline and also carries its source"; the editor app at studio.egatari.org opens and saves it) |
| C55 | "LessonRemix, a browser studio, exports a lesson with multiple-choice checks as one HTML file that works offline" | docs/DEVPOST_WRITEUP.md:31 | TRUE | https://github.com/Vertex-blip/lesson-remix (README) |
| C56 | "Doppel turns product screenshots into a practice lesson with AI-suggested steps" | docs/DEVPOST_WRITEUP.md:31 | TRUE | https://github.com/coldrazer/doppel (README: "Offline HTML export") |
| C57 | "Syllabind, a Claude Code skill, turns a topic into a course" | docs/DEVPOST_WRITEUP.md:31 | TRUE | https://github.com/Khalidfpv/syllabind (README) |
| C58 | "The typed codes are the part we have not seen in the tools above." | docs/DEVPOST_WRITEUP.md:35 | PARTIAL | Missing: from the public pages we read (11 Nov), not proof that none exists; Egatari's player spec reports progress to a SCORM LMS, the host page or local storage, and we did not check every tool's reporting. |
| C59 | "plays offline, it edits itself, and the pupils' results come back to her as short codes she types in" | docs/DEVPOST_WRITEUP.md:5, README.md:5 | TRUE | For the lesson file (the Maker needs the internet, as the same line says): `npm run check:class-results`, `npm run check:living-file` |
| C60 | "a few tools now hand you an offline lesson file" | blog | TRUE | Egatari, OpenMAIC and LessonRemix export offline lesson files (C54, C15, C55 and their sources) |
| C61 | "the teacher types the codes into her own copy" | blog | TRUE | `npm run check:class-results` (three pupils' codes typed into the Teacher tab rebuild the table) |
| C62 | "the play-only class file of the same lesson is 149 KB" | docs/DEVPOST_WRITEUP.md:9 | TRUE | `tests/round13-docs.test.ts` (TASK-41g measures the class export) |
| C63 | "The first four (product, tech, stack format, audience) were written before any code" | docs/DEVPOST_WRITEUP.md:42 | TRUE | git: `c68ffc7` (the first commit) adds the four; `90fa2d8` adds the design system; `cd20abf` adds pre-submit |
| C64 | "how many got it right, got it wrong or never reached it" | docs/DEVPOST_WRITEUP.md:25 | TRUE | `src/living/classResults.ts`; `npm run check:class-results` |
| C65 | "Four run the real checks when Kiro saves the files they watch" | docs/DEVPOST_WRITEUP.md:46 | TRUE | `.kiro/hooks/*.json` triggers: four `PostFileSave`, one `PostToolUse`, one `PostTaskExec` |
| C66 | "our check marks a few likely joke answers but misses most, so read every answer" | docs/DEVPOST_WRITEUP.md:22 | TRUE | `bench/DIAGNOSIS.md` (recall 0.05, 0.01 and 0.03 out of sample) |
| C67 | "the exporter, Maker and class-results specs went back to Kiro with changes before their code" | docs/DEVPOST_WRITEUP.md:44 | TRUE | `docs/KIRO_LOG.md` (the 30 Oct, 4 Nov and 10 Nov entries) |
| C68 | "sees how many missed each question" | blog | TRUE | `src/living/classResults.ts` (counts per question) |
