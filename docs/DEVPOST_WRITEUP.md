# Stackyard: Devpost write-up

Category: Resurrection (HyperCard, 1987)

**Stackyard turns one sentence into a lesson file the teacher hands to the class. It plays offline, it edits itself, and the pupils' results come back to her as short codes she types in: no internet, no accounts, no server.** HyperCard (1987) gave a teacher a stack of cards she could hand on. Stackyard brings that stack back, and this time the results come back too. (Making the lesson in the Maker needs the internet; the lesson file does not.)

Video (public, AI disclosure set on YouTube, v8b uploaded 10.11): https://youtu.be/x6W2BzhpAyU

The video (v8b) was recorded on the live app at commit 4703964: a real generation in real time (Build Cards to the editor in 13.7 s in that take; usually 10–20 s), "Swap this wrong answer" with Undo, one-switch Scan, a pupil's results code on the end card and the teacher's Class Results table (two of the three pupil codes were played by script off camera, as the video says), Save a Copy with the Wi-Fi off (files of about 212 KB in the take), and check:trace and check:claims at commit 8e24ecd. The commit we submit reports 196 of 196 and 1,499 tests and a 12.8 KB player (gzipped, 1 KB = 1,024 bytes); a generated lesson file is now about 211 KB.

## Try it in 10 seconds
- Live app: https://stackyard-sdqt.onrender.com (a paid Render instance, so it stays awake).
- Open a lesson file without generating anything: https://stackyard-sdqt.onrender.com/samples/vikings-in-ireland.html (also `times-tables.html`, `irish-words.html`). Press Teacher in its corner to edit it; Save a Copy writes a new file that plays with the Wi-Fi off.
- The README's screens and GIF use the ready-made Vikings deck, not a live generation.
- Judging in 3 minutes: https://github.com/chainwright/stackyard/blob/main/JUDGES.md. Every number and the command that reproduces it: https://github.com/chainwright/stackyard/blob/main/EVIDENCE.md. Every claim in this write-up, the README and the blog, with its status: https://github.com/chainwright/stackyard/blob/main/CLAIMS.md

## Inspiration
In 1987 HyperCard let a teacher who couldn't code build a clickable stack of cards for tomorrow's lesson. Today she can fill in forms in H5P and Lumi, use a quiz platform that keeps the quiz in its own app or site, usually with accounts and a connection, or ask a chatbot for a one-off HTML quiz with no editor inside it. Most HyperCard revivals bring back the editor; Stackyard brings back the stack you could hand to someone. The editor is a sentence now, and the lesson is the file: one HTML file that plays, scores and edits itself with the Wi-Fi off.

## What it does
- Ms. Brennan types one sentence, for example "A 6-question quiz on the water cycle for 4th class, two flash cards (evaporation, condensation) and a short choose-your-path story about a raindrop, the right answer plays a cheer". Stackyard deals the cards as the model writes them: quiz questions, flash cards and a branching story card.
- In the Maker she edits any card HyperCard-style: drag a button, change a word, "If they pick this, show card…". Try It flips the card over and plays it in place. On a quiz card, Swap replaces a wrong answer she doesn't like (a suspected joke answer is marked) with another answer from the same deck, or one she types: no model call, and one Undo puts it back.
- The lesson is the file. Export gives one HTML file the teacher can hand on: the class opens it on a laptop in a browser (checked in headless Chrome by the repo's gates at this commit; on 6 Nov an earlier export also played offline in Playwright's Firefox and WebKit builds), with no account, no install and no internet, and the last card shows the score. It is small: 6 lesson files like the water-cycle test deck fit on a 1.44 MB floppy (the photo samples are larger).
- The file is alive: a small Teacher tab inside it opens a lighter editor (text, answers, links and cards, plus drag on quiz and story cards (not flash or end cards), with Undo and Redo; no adding or swapping pictures), offline, built on the same validated edit operations, and Save a Copy writes a new file that can edit itself too. That is the self-saving single-file trick of TiddlyWiki and Decker, brought to a lesson.
- Class results without a server: each pupil's last card shows a short code with a check letter (no names; initials optional), and the teacher types the codes into the Teacher tab of her own copy to see, per question, who got it right, wrong or never reached it, the middle score and what to revisit, with nothing leaving the laptop.
- No AI available? She picks a ready-made deck or types her own questions. Every path ends in the same playable file.

## Where it sits
Other Kiroween 2026 entries revive HyperCard's editor too. At least one builds a stack from a description, and another exports a stack as one play-only HTML file. AfterStack is itself one offline page with a form editor; we found no AI generation or self-saving copy in it. Caramel, made by two teachers, turns a subject, level and objective into H5P activities that need a host or Lumi.

Handing on one offline lesson file is not new on its own. Egatari's lesson file plays offline and carries its own source, so it can be reopened in the Egatari Studio editor, edited and saved again. OpenMAIC (open source) turns a topic or a document into an AI-generated lesson with quizzes and can export it as an offline HTML player. LessonRemix, a browser studio, exports a lesson with multiple-choice checks as one HTML file that works offline. Doppel turns product screenshots into a practice lesson with AI-suggested steps and exports it as one self-contained HTML file. Syllabind, a Claude Code skill, turns a topic into a course and builds it as offline HTML and a PDF. Decker revives HyperCard's decks and saves one self-contained HTML file that keeps its editor, but it has no AI generation.

Lumi's desktop app exports most H5P activities as an all-in-one HTML file for teachers, and H5P.com's Smart Import drafts activities from a document, web page, video or at least 500 characters of pasted text, rather than a one-line request. AI quiz makers start from a topic, a document or a link, and either keep the playable quiz on their own platform (Kahoot, Wayground; Wayground also exports printable PDF or DOC worksheets) or hand it to Google Forms or an LMS through an export or a third-party converter; general AI chat tools such as Claude can write a single offline HTML quiz, which arrives without an editor inside unless you ask for one, and nothing in them checks that the class can't get stuck.

Stackyard puts three things together: a lesson built and checked from one teacher's sentence; an editor inside the lesson file itself, whose Save a Copy writes a new file that edits itself too; and the pupils' results coming back to the teacher as short typed codes, with no server. The typed codes are the part we have not seen in the tools above.

## How we built it: Kiro, feature by feature
One claim per row, and where to check it. What Kiro did not do in this build is listed in EVIDENCE.md: https://github.com/chainwright/stackyard/blob/main/EVIDENCE.md#kiros-limits-in-this-build

| Kiro feature | Claim | Proof |
|---|---|---|
| Steering | Six steering files (five always on, one on demand), written before any code. The stack format's 9 invariants are the contract the generator, editor, exporter and tests share. | `.kiro/steering/`; the first commit (`c68ffc7`) is the steering, before any code |
| Specs | Six specs: five product features (generator, exporter + player, Maker, curriculum bench, class results) in EARS form and a small `kiro-evidence` spec for the MCP call record. Every lettered task id is named in a test title, a gate or a hook (196 of 196 by `npm run check:trace`). | `.kiro/specs/`; `npm run check:trace` |
| Spec vs vibe | The spec format is the plan of record. Kiro wrote each feature's requirements, design and tasks from a chat request, and we reviewed them like pull requests and sent them back. The sessions ran in vibe mode; visual fixes were written back into the spec. | `.kiro/specs/class-results/design.md` (the review's two P0 findings) |
| Property-based testing | 75 fast-check properties: every invariant, a 1,000-run stack → HTML → stack round trip, edit sequences that must stay valid, exact undo and a lossless Save a Copy. A 118-mutant script (`npm run check:mutants`, 118 of 118 killed in the newest logged run) reverts 118 of the review fixes and demands a red test for each. | `tests/*.property.test.ts`; `docs/mutation-runs/` |
| Hooks | Six hooks run the real checks when Kiro saves the files they watch: the stack invariants, a living-file replay in headless Chrome with the network blocked, the ready-made deck check, an export-opens check, and a `PostToolUse` hook for files Kiro writes through the shell. Kiro's session store recorded 493 hook firings (5 to 9 Nov). The pre-submit hook (`PostTaskExec`) is not yet recorded firing. | `.kiro/hooks/`; `docs/kiro-sessions/README.md` (firings counted per hook) |
| Custom agent | `lesson-checker`, a read-only reviewer for 8–10-year-old content, run as a sub-agent. It caught an ambiguous Vikings question (all four answers were true) that an earlier fix of ours had introduced. | `.kiro/agents/lesson-checker.md`; `docs/kiro-sessions/README.md`, section 3 |
| MCP | A local Openverse image-search server with a host allowlist. It was mostly run as a script outside Kiro, to pick the deck photos; its search was also called once through Kiro as an MCP tool (10 Nov). | `.kiro/settings/mcp.json`; `mcp/openverse/`; `docs/kiro-sessions/README.md`, section 6 |
| CLI | Kiro CLI wrote the steering and specs and built almost all of the code, over many resumed sessions. The few fixes made outside Kiro are logged. | `docs/KIRO_LOG.md`; commits marked "(built in Kiro)" |
| IDE and Powers | Not used: every session ran in Kiro CLI, and we used no Powers. | — |

**The line that set the architecture** (REQ-EXP-01 as amended in TASK-28, `.kiro/specs/exporter/requirements.md`): "When the Maker exports a stack, the system shall produce a single HTML file in which every asset — player runtime JavaScript, card images, fonts, and sounds — is inlined; the file shall load nothing from the network at runtime; inert licence source URLs inside comments are allowed."

## Challenges we ran into (the honest ones)
- 113 green tests still let a real defect through: fallback ids that weren't UUID v4. A 30-second live run caught it, and the fix went back into the spec as a new invariant.
- All jsdom tests were green while real Chrome showed five problems, including a stamp that never appeared. Since then, every review happens in a real browser.
- On the live deploy, our own limit could be dodged by a visitor-set header. We read Render's real header chain and keyed the limit on the address Cloudflare sets.
- The living file worked locally and failed live, because Render's build skipped its bundle. A test now fails if any bundle the server reads is missing from the build.

## Accomplishments we're proud of
- A file a teacher can email to the class laptop that plays offline and edits itself offline.
- The numbers in the README's "By the numbers" block are checked by a script, and the pre-submit gate fails if they drift beyond its tolerances (±0.5 KB for the bundle, ±3 % for the file size).
- The player bundle is 12.8 KB gzipped against a 50 KB budget (1 KB = 1,024 bytes here; lesson-file sizes are decimal KB).
- 54 of 55 England KS2 science objectives (Years 3–5) became a valid lesson file on the first try; 43 passed our automatic lesson check with no warnings (`bench/RESULTS.md` in the repo, one lesson file per objective). The checks are mechanical (structure, counts, answer overlap) and do not verify facts. This measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.
- An AI review of 60 quiz cards from 12 decks of an earlier bench run (v2) found 0 wrong keys and 2 ambiguous ones; the current run's re-recorded decks have 1 known wrong key (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's.
- In the 32 re-recorded decks that became lesson files in every run, an AI review found joke answers fell from 88 of 319 (v2) to 71 of 320 (v5) wrong answers; 1 wrong key (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's.
- Accessibility: axe-core 4.14.0 audited 16 pages (the Maker, the 3 samples in Play and in the Teacher tab, a class export, an end card with a results code, the Class results panel and 5 bench files) and found 0 serious or critical violations; the keyboard-only play-through passes and the one-switch scan play-through passes (`docs/accessibility/README.md` in the repo). No screen-reader user or disabled pupil has tested it.

## What we learned
Spec-driven work with Kiro was fastest when we argued with the spec before any code was written. The bugs that mattered were found by running the real thing: a live run, a real browser, a real deploy. More tests in the same place didn't find them.

## What's next
Adding and swapping pictures inside the Teacher tab, and printing a stack as worksheet cards.

## Built with
Kiro (CLI, specs, steering, hooks, one custom agent and an MCP server; see the Kiro table), TypeScript, Preact, Vite, Vitest, fast-check, Node, Render, Anthropic model (OpenAI-compatible endpoint), Openverse. Fonts: Bricolage Grotesque and Atkinson Hyperlegible (SIL OFL 1.1; the Atkinson subset renamed "Stackyard Reading" as the OFL requires). Pictures: three photos found on Openverse (one Public Domain Mark, two CC0), credited on the cards. Generated cards can carry one of 42 pictograms we drew ourselves (MIT), chosen by name; the model never supplies picture data. Every answer tile pairs its colour with a permanent shape, so a colour-blind pupil can say "the triangle"; shape-plus-colour coding is a common accessibility pattern, and our palette, type and rubber-stamp feedback are our own. Development used our own AI review panel (AI agents) for judging rounds; disclosed in KIRO_LOG.


**Credits.** Music in the demo video: generated by the team with ElevenLabs Music (paid plan), made on 27 Oct 2026 for an earlier project of ours and reused here. The classroom shots are dramatised: the teacher, the pupils, the laptops and the room are AI-generated footage (about 23 s in seven on-screen windows, eight shots in all), each tagged 'AI-generated' on screen, as the on-screen tags and the end card say; the app screens in them are real recordings composited in. The narration is a synthetic voice; the cursor, sounds, labels, the OFFLINE stamp and the network-request badge were added in editing; the badge shows the count from the real recording.
