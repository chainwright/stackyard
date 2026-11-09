# Curriculum bench — Tasks

TASK-33 step 3 (c). Requirements: `requirements.md` (REQ-BENCH-01…07). Design: `design.md`.
Each task: Bug (what is missing) / Fix / Acceptance criteria.

### TASK-33c1: the objectives, verbatim and attributed  *(REQ-BENCH-01)*
  - **Bug.** We have no evidence from outside our own decks. "A real teacher used it" is not something we can claim.
  - **Fix.**
    - `bench/objectives.json` holds all 55 statutory Years 3–5 bullets from the England science programmes of study, verbatim. Each row has an id, the year, the topic, the source title, the URL and the licence.
    - `bench/README.md` covers what the bench is, the source with OGL v3.0 attribution, the template, how to replay and how to re-record. It says plainly that the bench is not a classroom study.
  - **Acceptance criteria.** Tests check:
    - there are 55 rows with unique ids and years 3–5;
    - each outcome equals the extracted source (compared in full on 9 Nov against the extraction; a test pins the SHA-256 of the outcomes);
    - the URL and licence are on every row;
    - the README has the attribution and the disclaimer.

### TASK-33c2: one fixed sentence template  *(REQ-BENCH-02)*
  - **Fix.** `sentenceFor(outcome)` in `scripts/bench-lib.ts`, and the same template, word for word, in `bench/README.md`.
  - **Acceptance criteria.** A unit test checks the exact sentence. `parseRequestedCounts` reads quiz 5 and flash 2 from it. The README contains the template.

### TASK-33c3: `npm run bench:record` (we run it; it needs our key)  *(REQ-BENCH-03)*
  - **Fix.** The real `streamGenerate` runs with a teed `callStream` and a no-model fallback stub. A pool of 3 runs at a time. Objectives already cached are skipped unless `--force`. The cache stores the raw text, timings, model and thinking setting. There is a key guard.
  - **Acceptance criteria.** Unit tests with a fake gateway check:
    - the cache holds the raw text exactly as streamed, plus the timings;
    - a cached objective is skipped;
    - no more than 3 objectives run at once;
    - a cache containing the key is refused;
    - with no key, recording refuses to start.

### TASK-33c4: `npm run bench` replays offline and deterministically  *(REQ-BENCH-04)*
  - **Fix.**
    - The fake gateway goes through the same `streamGenerate` pipeline as live.
    - A seeded `crypto.randomUUID` is used during replay.
    - Replay writes a living file per first-try deck, plus `results.json` and `RESULTS.md`.
    - The metrics are those in the design. The FK grade uses the documented syllable counter.
  - **Acceptance criteria.** Unit tests on the three fixture caches:
    - **clean:** first try, no warnings, counts right, all reachable;
    - **two-answer:** a `two-answers` warning;
    - **repeated card:** one repeat removed;
    - two replays give byte-identical files and results;
    - a stale sentence fails;
    - an empty cache reports "0 recorded" and writes nothing;
    - the FK grade on known texts, and the syllable counter on known words;
    - p50 / p90 by nearest rank.

### TASK-33c5: every bench file plays offline  *(REQ-BENCH-05)*
  - **Fix.** `scripts/check-bench-offline.ts`: one headless Chrome on port 9347 with the network blocked. For each file: a card renders, the first card plays, 0 requests, and no exception.
  - **Acceptance criteria.** The gate passes on the three fixture decks replayed into a temp folder, and on `bench/files/` once recorded. It skips when no Chrome is found.

### TASK-33c6: `check:bench` and where it runs  *(REQ-BENCH-06)*
  - **Fix.** `npm run check:bench` does the fresh in-memory replay (`bench/files/` and `results.json` must match byte for byte), then the offline check.
  - **Where it runs.** Measured on this Mac with 55 synthetic decks (the clean fixture under all 55 ids):
    - replay: 0.2 s; `--check`: 0.2 s;
    - offline check of all 55 files in one headless Chrome: 10.6 s.

    That is well under about 90 s, so pre-submit runs the full `check:bench`, just before `check:claims`.
    CI (`.github/workflows/ci.yml`) is unchanged: our token can't push workflow files (TASK-32f), so the coordinator adds a `check:bench` step if wanted.
  - **Acceptance criteria.** With an empty cache, `check:bench` prints "bench: 0 recorded" and passes. Results with no cache fail. A changed file fails ("stale").

### TASK-33c7: the bench line is checked by check:claims  *(REQ-BENCH-07)*
  - **Fix.** README "By the numbers" and the write-up's "Accomplishments" each get "N of 55 England KS2 science objectives (Years 3–5) became a valid lesson file on the first try; M passed our lesson check with no warnings", checked against `bench/results.json`.
    - The write-up line also says it is not a classroom study.
    - `--fix` rewrites the line or inserts it.
    - Before `results.json` exists, neither file may carry the line.
  - **Acceptance criteria.**
    - Unit tests: a right line passes; a wrong N or M fails; a write-up line without the disclaimer fails; a line without results fails; no results and no line passes; `--fix` inserts and rewrites.
    - A mutant (the bench line is accepted whatever its numbers) is killed.

### TASK-33c8: fixtures first  *(design "tests/")*
  - **Fix.** Three hand-made caches in `tests/fixtures/bench/`, in the recorded format: `clean.json`, `two-answers.json` and `repeated-card.json`.
  - **Acceptance criteria.** The replay, metrics and FK tests above all run on them, with no network and no key.

### TASK-33c9: the v1 first-try failures: quizzes with no right answer  *(v1 bench, `bench/DIAGNOSIS.md` a)*
  - **Bug.** 5 of 55 v1 decks failed whole-stack validation with "quiz-answer":
    - The failures are y3-animals-2, y3-rocks-3, y3-forces-magnets-3, y4-sound-2 and y5-materials-6.
    - In each, one quiz card has 0 answers with delta 1. Never 2, and no story or flash card has a score action.
    - In all five the right answer is written first and marked 0. The prompt told the model not to make the first button the right one.
    - The same rule also put the key on a wrong later button in at least 5 decks that passed validation.
  - **Fix.**
    - The prompt only. All three prompts drop "VARY which position". They now say: put delta 1 on the button whose label is the right answer as you write it; never leave a quiz with no delta 1; Stackyard shuffles the order.
    - No server repair: marking an answer right would be guessing the key, and dropping the card hides the error. The live app already retries an invalid deck.
  - **Acceptance criteria.**
    - Each of the five exact cached cards fails the invariant and is not a first try. With its first answer marked right, it is valid.
    - The prompts carry the new rule and not the old one.
    - Finalising does shuffle right-first quizzes.
    - `bench/DIAGNOSIS.md` names the five ids and the counts.
    - A mutant that restores the position rule is killed.

### TASK-33c10: a card plan at the top and the end of the request  *(DIAGNOSIS b)*
  - **Bug.** 25 of 55 v1 decks kept the asked-for counts. 25 wrote 4 quiz cards and 3 wrote 3. In 20 of the 25 four-quiz decks the shape is the same: 2 flash, 3 quiz, the story trio, 1 quiz, end. The story's question stood in for the fifth. The parser reads quiz 5 and flash 2 correctly; the counts were stated only once, at the end.
  - **Fix.**
    - `cardPlan(prompt)`, e.g. "Card plan: exactly 5 quiz cards, exactly 2 flash cards, 1 story card with its 2 consequence cards, 1 end card (11 cards in all). The story cards are not quiz cards."
    - It opens and closes the one-shot and streaming user messages, and ends the retry.
    - A "Card plan" section in the system prompts says story cards never count as quiz cards.
  - **Acceptance criteria.**
    - Prompt tests check the exact plan, its place at the start and the end, and the system-prompt rule.
    - A mutant that drops the top plan is killed.

### TASK-33c11: sharper rules for two answers, overlapping answers and restating a flash card  *(DIAGNOSIS c)*
  - **Bug.** 14 of 50 first-try decks had lesson warnings:
    - two-answers: 7 cards in 5 decks (yes/no questions and questions about the lesson itself);
    - restates-flash: 6, all the first quizzes straight after the flash cards;
    - answer-inside-answer: 4.
  - **Fix.** Prompt rules, with no server-side invention:
    - a yes/no question is not a comparison;
    - never ask about the lesson itself;
    - in the three cards after a flash card, no quiz has its term as the key, asks "What is <term>?" or asks for a fact it states;
    - no answer is another answer with words added or taken away.
  - **Acceptance criteria.** Prompt tests for each rule in all three prompts.

### TASK-33c12: v1 is kept beside the current run  *(round 2, item 2)*
  - **Fix.**
    - `bench/results-v1.json` is a byte-for-byte copy of the v1 `results.json`.
    - `npm run bench` writes a "v1 (before the TASK-33 prompt fixes)" table at the top of `RESULTS.md` from it, then the current run.
    - `check:claims` still checks the current `results.json`.
  - **Acceptance criteria.**
    - Tests check the v1 summary (50 / 36 / 25 of 55), the order of the two tables in `RESULTS.md`, and that the claim lines match the current results.
    - `check:bench` (freshness) covers the new `RESULTS.md`.

### TASK-33c13: the lesson-checker persona over five bench decks  *(round 2, item 3)*
  - **Fix.** Inside the Kiro session, acting read-only as `.kiro/agents/lesson-checker.md`, review the `#stack-data` of `bench/files/y3-light-3.html`, `y3-rocks-2.html`, `y4-states-of-matter-3.html`, `y4-electricity-2.html` and `y5-earth-space-4.html`. Write the findings to `bench/LESSON_CHECKER.md`, dated and marked "run inside Kiro by the lesson-checker persona; read-only".
  - **Acceptance criteria.** A docs test checks the date, the line, the five decks in order, and a Facts / Ambiguity / Reading level / Suggested fix block in each.

### Pending (after we record; not a task id yet)
  - **Done (TASK-33c13).** The lesson-checker persona ran over the five decks named in round 2; see `bench/LESSON_CHECKER.md`.
