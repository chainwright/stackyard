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

### Pending (after we record; not a task id yet)
  - Run the lesson-checker persona (`.kiro/agents/lesson-checker.md`, read-only) inside the Kiro session over five bench decks we name. Its findings go in `bench/LESSON_CHECKER.md`.
