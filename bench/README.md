# Curriculum bench

**This measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.**

We have no evidence that a real teacher used Stackyard, so we built the next most honest thing. The bench turns every statutory learning objective of a public curriculum into a lesson file and reports what came out, as numbers anyone can re-run.

## The objectives

[`objectives.json`](objectives.json) holds **all 55** statutory requirements of Years 3, 4 and 5 in the *National curriculum in England: science programmes of study*. These are the "Pupils should be taught to: …" bullets, copied verbatim, with none left out. The non-statutory "Notes and guidance" are not included. Year 5 is roughly Irish 4th class (ages 9 to 10).

Each row has an `id` (e.g. `y4-sound-2`: Year 4, Sound, second bullet), `year`, `topic`, `outcome`, `source`, `url` and `licence`.

- Source: [National curriculum in England: science programmes of study](https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study), Department for Education (page "Updated 6 May 2015").
- Licence: © Crown copyright 2015. Contains public sector information licensed under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

## The sentence

Every objective becomes the same teacher sentence, with the outcome copied in word for word:

> A 5-question quiz, two flash cards and a short choose-your-path story for pupils aged 8 to 10 on this objective: &lt;outcome&gt;.

The same template is `TEMPLATE_HEAD` / `sentenceFor` in [`scripts/bench-lib.ts`](../scripts/bench-lib.ts), and a test checks the two agree.

## What is measured

For each objective, [`RESULTS.md`](RESULTS.md) and [`results.json`](results.json) report:

- **Valid on the first try.** The model's streamed deck became a valid lesson with no retry and no ready-made fallback.
- **Lesson check.** The deck passed our lesson check (`src/shared/lessonCheck.ts`, the mechanical half of the lesson-checker persona) with no warnings: no two-answer guess, no duplicate or overlapping answers, no quiz that just restates a flash card, no repeated card.
- **Count fidelity.** The deck has 5 quiz cards and 2 flash cards, as asked.
- **Reachability.** Every card can be reached, and the end score can be reached with no card stuck, trapped or a dead end.
- **Reading level.** The Flesch-Kincaid grade of all card text and button labels, using the small syllable counter documented in `scripts/bench-lib.ts`. It is an estimate of the text, not a measurement of any pupil.
- Answers per quiz, pictures, the file size, and the recorded time to the first card and to done (p50 / p90).

Each first-try deck is also a **living lesson file** in [`files/`](files/), so anyone can open one. `npm run check:bench` opens every file in headless Chrome with the network blocked. It checks that a card renders and the first card plays, and that the file makes 0 network requests.

## Replay (no network, no key)

```
npm run bench          # replays bench/cache/*.json → files/, results.json, RESULTS.md
npm run check:bench    # replay in memory, compare with what is committed, then the offline check
```

Replay feeds each recorded model text through the same server path as the live app. That means `streamGenerate` with a fake gateway, then the same parsing, normalising, finalising, deck-quality passes and lesson check.

Replay is deterministic: ids are minted from a seed per objective, so the same recording always gives the same file. With no recordings it prints "bench: 0 recorded" and writes nothing.

## Re-record (needs a model key; we run this)

```
STACKYARD_LLM_API_KEY=… STACKYARD_LLM_BASE_URL=… STACKYARD_LLM_MODEL=… npm run bench:record
npm run bench:record -- --force                 # record everything again
npm run bench:record -- --only y4-sound-2,y3-light-2
```

Recording runs the real streaming generation path in process (not over HTTP, so the per-visitor limit is not involved), at most three at a time. For each objective it writes `cache/<id>.json`, containing:

- the raw model text exactly as streamed;
- the time to the first content, to the first and last card, and to done;
- the model id and the thinking setting.

Objectives already cached are skipped unless `--force`. A failed stream is recorded as it happened, with no retry. The API key is never written: the writer refuses any cache that contains it.

After recording, run `npm run bench` and `npm run check:claims:fix`, which writes the bench line in the README and the write-up. Then commit `bench/`.
