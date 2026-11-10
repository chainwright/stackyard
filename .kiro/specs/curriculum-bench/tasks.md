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

### TASK-33c14: say the lesson check is automatic and does not verify facts  *(round 3, item 1)*
  - **Bug.** The bench lines say "passed our lesson check". The check is mechanical (`src/shared/lessonCheck.ts`). In v1 a wrong answer key passed every mechanical check (`DIAGNOSIS.md` a; `LESSON_CHECKER.md`), so "our lesson check" reads as more than it is.
  - **Fix.**
    - The README and write-up bench lines say "M passed our automatic lesson check with no warnings".
    - The sentence after them says: "The checks are mechanical (structure, counts, answer overlap) and do not verify facts."
    - `check:claims` reads only the new wording and requires that sentence on the line. `--fix` rewrites a line in the old wording, or one without the sentence, to the full new line.
    - The `RESULTS.md` row and `bench/README.md` use the same words.
  - **Acceptance criteria.**
    - Unit tests: the new sentence passes; the old wording is not read as the claim; a line without the mechanical sentence fails; `--fix` turns an old line into the new one without adding a second line.
    - The real README and write-up carry the new line.

### TASK-33c15: a key-accuracy sample by the lesson-checker persona  *(round 3, item 2)*
  - **Bug.** No v2 deck has had its answer keys read. The mechanical checks cannot tell a wrong key from a right one.
  - **Fix.**
    - Sample rule (`keyReviewSample` in `scripts/bench-lib.ts`, deterministic, no randomness):
      - every 5th objective in `bench/objectives.json` order, starting at the 1st (positions 1, 6, 11, … 51), which gives 11;
      - when that objective has no first-try file, take the next objective in order that has one and is not already picked;
      - plus `y3-rocks-2`, because v1 had a wrong key there.
    - On v2 that is 12 decks. `y4-electricity-2` (position 36) has no first-try file, so `y4-electricity-3` stands in.
    - Inside this Kiro session, acting read-only as `.kiro/agents/lesson-checker.md`, read each deck's `#stack-data`. Give EVERY quiz card a verdict: key correct, key wrong or ambiguous, with one line of reason for any that is not correct.
    - Write a v2 section in `bench/LESSON_CHECKER.md`, keeping v1. It has the date, "run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's", a per-deck table and the totals.
  - **Acceptance criteria.**
    - A test re-derives the 12 decks from the rule and `bench/results.json`.
    - For each deck, `bench/key-review.json` lists exactly the quiz cards of its file, in order, with their questions and keys.
    - The totals equal the sum of the verdicts, and the v2 section's totals match the JSON.

### TASK-33c16: the key-review line is checked by check:claims  *(round 3, item 3)*
  - **Fix.**
    - `bench/key-review.json` is machine-readable: the rule, deck ids, per-card verdicts and totals.
    - The README and the write-up each get one line: "A read-only AI review of N quiz cards from 12 generated decks found W wrong keys and A ambiguous ones (bench/LESSON_CHECKER.md)."
    - `check:claims` checks it against totals recomputed from the verdicts in `key-review.json`. It is required while that file exists and refused while it doesn't. `--fix` inserts the line or rewrites it.
    - If W > 0, `bench/DIAGNOSIS.md` lists the wrong keys under "v2" and says whether a prompt change could plausibly fix them. The prompt is not changed in this task.
  - **Acceptance criteria.**
    - Unit tests: a right line passes; a wrong N, W or A fails; no file plus a line fails; `--fix` inserts and rewrites.
    - A mutant (the key-review line accepted whatever its numbers) is killed.

### Pending (after we record; not a task id yet)
  - **Done (TASK-33c13).** The lesson-checker persona ran over the five decks named in round 2; see `bench/LESSON_CHECKER.md`.

### TASK-34a1: the distractor ground truth  *(TASK-34a, item 1)*
  - **Bug.** A spot check of v2 found joke distractors ("To make the body glow in the dark", "Clouds and wind"). Nothing counts them.
  - **Fix.**
    - Inside the Kiro session, acting read-only as the lesson-checker persona, label every wrong answer on every quiz card of the 54 v2 bench files "plausible" or "absurd", giving a reason for each absurd one.
    - The judgement goes in `bench/distractor-labels.json`. `scripts/build-distractor-review.ts` expands it, with every distractor from the files, into `bench/distractor-review.json`. It fails if a label matches no distractor.
    - `bench/LESSON_CHECKER.md` gets a "v2 distractor review" summary that says it is an AI review.
  - **Acceptance criteria.**
    - Tests check: every distractor is labelled; every absurd one has a reason; the totals add up; while a deck is still its v2 recording, the review lists exactly its quiz cards; the summary's totals match.

### TASK-34a4: re-record only the affected objectives, and keep v2  *(TASK-34a, item 4)*
  - **Fix.**
    - `bench:record -- --only-file <file>` reads ids from a file (`#` starts a comment).
    - `bench/rerecord.txt` lists the decks with at least one absurd distractor, plus a `# v2-recorded-until:` cut-off.
    - `bench/results-v2.json` is a byte-for-byte copy of the v2 `results.json`.
    - `RESULTS.md` shows v1, v2 and the current run, and says v3 re-records only the listed objectives, with how many are re-recorded so far.
  - **Acceptance criteria.** Tests check: `rerecord.txt` equals the ground truth's affected decks; the file parser; the v2 summary (54 / 48 / 47); the order of the three tables and the v3 sentence.

### TASK-34a5: the v3 distractor and key review  *(TASK-34a part 2)*
  - **Fix.**
    - Inside the Kiro session, acting read-only as the lesson-checker persona, label every wrong answer on every quiz card of the 34 re-recorded decks with the v2 definitions, and judge every key (correct / wrong / ambiguous, with a reason when it is not correct).
    - The judgement is in `bench/distractor-labels-v3.json`. `scripts/build-distractor-review.ts --labels … --out bench/distractor-review-v3.json --only-file bench/rerecord.txt` expands it.
    - The v2 review is frozen: its 34 decks were re-recorded, so it can no longer be rebuilt from the files.
    - `scripts/distractor-eval.ts` now measures a review from its JSON alone, which gives the check's honest out-of-sample precision and recall on v3.
    - `LESSON_CHECKER.md` "v3 distractor review (34 re-recorded decks)" compares the same 34 decks before and after: absurd count, per 100, decks with at least one; the out-of-sample numbers; every wrong and ambiguous key.
  - **Acceptance criteria.**
    - A fresh build equals `distractor-review-v3.json`.
    - The totals recompute from the labels; every absurd label and every non-correct key has a reason.
    - The section's numbers equal the JSONs and `evaluate()`.

### TASK-34a6: the joke-answer claim line  *(TASK-34a part 2)*
  - **Fix.**
    - README and write-up: "In the 34 re-recorded decks, an AI review found joke answers fell from A of N to B of M wrong answers; C wrong keys (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's."
    - `check:claims` checks it against numbers recomputed from `distractor-review.json` (restricted to the re-recorded decks) and `distractor-review-v3.json`. `--fix` inserts or rewrites it.
    - `RESULTS.md` says the current run (v3) re-recorded only the 34 listed objectives.
  - **Acceptance criteria.**
    - Unit tests: a right line passes; each wrong number fails; the disclaimer is required; no v3 review plus a line fails.
    - A mutant (the line accepted whatever its numbers) is killed.

### Pending (TASK-34a, item 5)
  - **Done (TASK-34a5).** The lesson-checker labelled the 34 re-recorded decks' distractors and keys; see `bench/LESSON_CHECKER.md`, "v3 distractor review".

### TASK-34a9: the v4 (why-field prompt) review, and v3 kept  *(TASK-34a part 4)*
  - **Fix.**
    - Inside the Kiro session, acting read-only as the lesson-checker persona, label every distractor and judge every key of the 34 objectives re-recorded with the TASK-34a7 prompt. The judgement is in `bench/distractor-labels-v4.json`; `build-distractor-review.ts … --out bench/distractor-review-v4.json --only-file bench/rerecord.txt` expands it.
    - A re-recorded deck that failed validation has no file. It is listed in the review's `noFile` (y5-materials-5, y5-earth-space-3), not reviewed. The v3 review is now frozen, like v2.
    - `LESSON_CHECKER.md` "v4 (why-field prompt)" gives the v2 → v3 → v4 table on the same 32 decks (absurd per 100, decks with at least one, wrong and ambiguous keys), the check's precision and recall on v4, and why the 2 new failures failed (read offline from `bench/cache/`).
    - `bench/results-v3.json` (saved by the coordinator) gives a "v3" table in `RESULTS.md`, by the same mechanism as v1 and v2. `RESULTS.md` says the current run (v4) re-recorded only the same 34 objectives.
    - The claim line is recounted from `distractor-review.json` and the latest review (v4): "In the 32 re-recorded decks that became lesson files, an AI review found joke answers fell from A of N (v2) to B of M (v4) wrong answers; C wrong keys (bench/LESSON_CHECKER.md). It is an AI review, not a teacher's." `--fix` replaces the v3-era wording.
  - **Acceptance criteria.**
    - A fresh build equals `distractor-review-v4.json`, and decks plus `noFile` equal `rerecord.txt`.
    - The section's table and precision / recall equal the JSONs and `evaluate()`.
    - The order of the v1, v2, v3 and current tables in `RESULTS.md`.
    - The claim line equals `jokeFromReviews(v2, v4, "v4")`. The joke-line mutant still guards it.
