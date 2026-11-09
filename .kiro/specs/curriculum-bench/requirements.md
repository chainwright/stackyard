# Curriculum bench — Requirements

## Feature summary

A public-curriculum benchmark: our honest substitute for "a real teacher used
it". Every statutory "Pupils should be taught to" requirement of the National
curriculum in England, science programmes of study, Years 3, 4 and 5 (55
objectives, none left out) becomes one fixed teacher sentence. The sentence goes
through the REAL streaming generator once (recorded by us, with our model key),
and the recorded model text is then replayed offline, deterministically, through
the same server pipeline into a living lesson file per objective.

The bench measures the generator against curriculum objectives. **It is not a
classroom study: no teacher or pupil was involved.** Every text that reports a
bench number says so.

Source: <https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study>
(Open Government Licence v3.0, © Crown copyright 2015, page "Updated 6 May 2015").
Year 5 is roughly Irish 4th class (ages 9 to 10).

From the teardown (`../CLONES_TEARDOWN_2026-11-09.md` §4 row 4).

---

## Requirements

### REQ-BENCH-01 — The objectives, verbatim and attributed

**The system shall** keep the 55 statutory requirements of Years 3–5 in
`bench/objectives.json`, one row per outcome: `id` (`y<year>-<topic-slug>-<n>`,
e.g. `y4-sound-2`), `year`, `topic`, `outcome` (verbatim), `source`, `url`,
`licence`.

**Acceptance criteria**

- WHEN `bench/objectives.json` is read, THEN it has exactly 55 rows with unique
  ids, years 3 to 5 only, and every `outcome` equal to the extracted source text.
- WHEN any row is read, THEN its `url` is the gov.uk page and its `licence`
  names the Open Government Licence v3.0.
- WHEN `bench/README.md` is read, THEN it carries the OGL v3.0 attribution
  ("Contains public sector information licensed under the Open Government
  Licence v3.0"), the template and the sentence "it is not a classroom study and
  no teacher or pupil was involved".

### REQ-BENCH-02 — One fixed sentence per objective

**When** the bench builds the teacher sentence for an objective,
**the system shall** use exactly the template
"A 5-question quiz, two flash cards and a short choose-your-path story for
pupils aged 8 to 10 on this objective: <outcome>."

**Acceptance criteria**

- WHEN the template is applied, THEN the result is the template with the
  verbatim outcome. `parseRequestedCounts` reads quiz 5 and flash 2 from it.
- WHEN `bench/README.md` is read, THEN it states the same template, word for word.

### REQ-BENCH-03 — Recording (needs a model key; run by us)

**When** `npm run bench:record` runs with `STACKYARD_LLM_*` set,
**the system shall**, for each objective not yet cached (or every objective with
`--force`), run the real streaming generation path (`streamGenerate` →
`llmGateway.callStream`, in process, not over HTTP, so no rate limiter is
involved), at most three at a time, and write `bench/cache/<id>.json` with: the
sentence, the raw model text exactly as streamed, any stream error kind, the ms
to the first content, to the first card, to the last card and in total, the
model id and the thinking setting.

**Acceptance criteria**

- WHEN no `STACKYARD_LLM_API_KEY` is set, THEN recording stops before any call
  with a plain message and writes nothing.
- WHEN a cache file is written, THEN it never contains the key (the writer
  refuses one that does).
- WHEN the streamed attempt fails, THEN no retry or ready-made fallback model
  call is made; the failure is recorded as it happened.

### REQ-BENCH-04 — Replay (no network, deterministic)

**When** `npm run bench` runs,
**the system shall** replay every cached raw text through `streamGenerate` with a
fake gateway that yields the cached text (the same parsing, sanitising,
finalising, deck-quality passes and lesson check as live), export a LIVING file
to `bench/files/<id>.html` for each deck that reached `done`, and write
`bench/results.json` and `bench/RESULTS.md`.

**Acceptance criteria**

- WHEN the cache is empty, THEN it prints "bench: 0 recorded" and exits 0
  without writing results.
- WHEN replay runs twice on the same cache, THEN every file and the results are
  byte-identical (ids are minted from a seed per objective during replay).
- WHEN a cache's sentence is not the template applied to its objective, THEN
  replay fails ("stale cache").
- Per deck the results carry: valid on the first try (the streamed attempt
  reached `done` with no retry and no fallback); no lesson warnings; count
  fidelity (quiz = 5 and flash = 2); every card reachable; the end score
  reachable; the Flesch-Kincaid grade of all card text; answers per quiz;
  pictures; file size in bytes; the recorded timings. The summary carries the
  p50 and p90 of the time to the first card and to done.

### REQ-BENCH-05 — Every file plays offline

**When** `npm run check:bench` runs,
**the system shall** open every `bench/files/*.html` in headless Chrome with the
network blocked, assert that a card renders, play the first card, and count 0
network requests.

### REQ-BENCH-06 — Fresh results

**When** `npm run check:bench` runs,
**the system shall** replay the cache in memory and fail if `bench/files/` or
`bench/results.json` differ from a fresh replay.

### REQ-BENCH-07 — The claim is checked

**While** `bench/results.json` exists,
**the system shall** require one bench line in the README's "By the numbers" and one in
`docs/DEVPOST_WRITEUP.md`
("N of 55 England KS2 science objectives (Years 3–5) became a valid lesson
file on the first try; M passed our lesson check with no warnings"), each
matching the results, the write-up's also saying it is not a classroom study;
`check:claims --fix` writes or inserts them. **While** it does not exist, a bench
line in either file is a failure (nothing backs it).
