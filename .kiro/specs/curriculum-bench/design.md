# Curriculum bench — Design

## Files

```
bench/
  objectives.json      55 rows (REQ-BENCH-01)
  README.md            what it is, source + OGL attribution, template, replay / re-record
  cache/<id>.json      recorded model text + timings (written only by bench:record)
  files/<id>.html      living lesson file per objective (written by bench)
  results.json         per-objective metrics + summary (written by bench)
  RESULTS.md           summary table + one row per objective, linking its file
scripts/
  bench-lib.ts         pure: template, cache schema, FK grade, metrics, percentiles,
                       RESULTS.md, deterministic UUIDs, replay of one cache
  bench.ts             CLI: `record` | replay (default) | `--check`
  check-bench-offline.ts  headless Chrome over bench/files/*.html (CDP, port 9347)
tests/
  bench.test.ts        unit tests on fixtures (TASK-33c*)
  fixtures/bench/      three hand-made caches: clean, two-answer quiz, repeated card
```

## Recording (`npm run bench:record`)

`scripts/bench.ts record [--force] [--only id,id]`:

1. Refuse to start without `STACKYARD_LLM_API_KEY` (plain message, nothing written).
2. Queue every objective without a cache (all with `--force`); run a pool of 3.
3. Per objective, call `streamGenerate({prompt}, sink, deps)` with
   - `callStream`: a tee around the real `llmGateway.callStream` that appends each
     delta to `raw` and stamps the first delta (`firstContentMs`);
   - `generate`: a stub that makes NO model call and answers `{ok:false}`, so a
     failed streamed attempt is recorded as it happened (no retry spend);
   - `sleep`: no-op; `now`: `performance.now`.
   The sink stamps the first and last `card` and the terminator.
4. Write `bench/cache/<id>.json`:
   `{ id, sentence, raw, streamError?, timings: { firstContentMs, firstCardMs,
   lastCardMs, totalMs }, model, thinking, recordedAt }`. `model` is
   `STACKYARD_LLM_MODEL` (or the gateway's default). Before writing, the
   serialised JSON is checked for the key's value; if present, the write throws.

## Replay (`npm run bench`)

For each objective with a cache, in id order and **sequentially** (the UUID
seam below is global):

1. Check `cache.sentence === sentenceFor(outcome)`; else fail (stale cache).
2. Install a deterministic `crypto.randomUUID` (mulberry32 seeded from the
   objective id, version nibble 4, variant 8–b) for the duration of the replay.
   The pipeline mints every id with `crypto.randomUUID`, and the answer shuffle
   is seeded from the stack id, so the same cache gives the same file.
3. `streamGenerate` with a fake `callStream` that yields the cached raw text in
   line-sized chunks (then throws `LlmUnavailableError(kind)` if a stream error
   was recorded) and a `generate` stub that records "fallback needed".
4. `firstTry` = the sink got `done` with `isFallback: false` and the stub was
   never called. Only first-try decks are exported (`exportLivingStack`).
5. Metrics on the `done` stack:
   - `lessonWarnings(stack)` (codes) → `lessonClean` when empty;
   - `countKinds` → `countsOk` when quiz = 5 and flash = 2;
   - `checkReachability`: `allReachable` (no unreachable card) and
     `endReachable` (the end card is reachable, no trapped, stuck or dead-end card);
   - `fkGrade` of all card text (text elements and button labels);
   - answers per quiz, pictures (image elements), file bytes;
   - recorded timings.
6. Summary: counts of each boolean, p50 / p90 (nearest rank) of `firstCardMs`
   and `totalMs`, median FK grade, min / max file size.

### Flesch-Kincaid grade

`0.39 × (words / sentences) + 11.8 × (syllables / words) − 15.59`, rounded to
one decimal. Each text element or button label is at least one sentence; inside
it, every run of `.`, `!` or `?` ends one. Words are runs of letters (an
apostrophe is kept inside). Syllables per word: lower-case letters only; words of
three letters or fewer count 1; otherwise drop a final silent `e` (not `le`), a
final `es` or `ed` (not after `t`/`d`), then count runs of `aeiouy`, minimum 1.
It is an estimate, close enough to show a reading level, not a measurement of
any pupil.

## The offline check (`check-bench-offline.ts`)

One headless Chrome (`--remote-debugging-port=9347`, throwaway profile, all
hosts mapped to NOTFOUND, dead proxy, `Network.emulateNetworkConditions`
offline). For each file: navigate `file://…`, wait for `.sy-card`, record
`Network.requestWillBeSent` for anything not `file:`, `data:`, `blob:` or
`about:`, and fail on any. Play the first card: click the right tile (or the
flash card, or the first button) and wait until `#player-root` changes.
Runtime exceptions fail. Skips (exit 0) when no Chrome is found, like the other
browser gates. `BENCH_SAMPLE=n` checks the first n files only.

## `check:bench` and pre-submit

`npm run check:bench` = `bench.ts --check` (fresh in-memory replay compared
byte-for-byte with `bench/files/` and `bench/results.json`) + the offline check.
With an empty cache it prints "bench: 0 recorded" and passes (and fails if
results exist without a cache). Whether it runs in full in pre-submit is decided
by the timing measured in TASK-33c6 (see tasks.md).

## Claims

`claims-lib.ts` gains `BenchNumbers {objectives, firstTry, lessonClean}`,
`benchSentence`, `readBenchClaim`, `compareBench(text, bench, needsDisclaimer)`
and `fixBench(text, bench, anchor, wrap)`. `check-claims.ts` reads
`bench/results.json` when it exists; README and write-up each need exactly the
measured line (the write-up's with "not a classroom study"); `--fix` rewrites
it or inserts it after a fixed anchor. Without results, a bench line in
either file fails.
