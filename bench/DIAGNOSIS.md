# Curriculum bench v1: diagnosis

Written on 9 November 2026 inside Kiro from the v1 recordings in `bench/cache/` (offline; we read the raw model text). The run used the live model config, `claude-haiku-5-5` with thinking off, and its summary is kept in [`results-v1.json`](results-v1.json). The bench measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.

The v1 headline: 50 of 55 decks were valid on the first try, 36 of 55 had no lesson warnings, and 25 of 55 kept the asked-for counts (5 quiz cards, 2 flash cards).

## a) The five first-try failures: a quiz with no right answer (5 of 5)

All five decks failed whole-stack validation on invariant 4 (the quiz answer rule). In each, one quiz card has **0** answers with `score` delta 1.

- No card had 2 right answers.
- No story or flash card carried a score action. Each broken card is plainly a quiz: every answer has a score action, so there is no story choice mislabelled as a quiz.

| Objective | Card | Question | What the model wrote |
|---|---|---|---|
| y3-animals-2 | c4 | What pulls on bones to make them move? | "Muscles" first, delta 0, with "buzz" on every answer |
| y3-forces-magnets-3 | c4 | What happens when two north poles are brought together? | "They push apart" first, delta 0, "buzz" on every answer |
| y3-rocks-3 | c1 | What is organic matter in soil? | "Dead plants and animals that have broken down" first, delta 0 |
| y4-sound-2 | c4 | What is needed for sound to travel from a source to our ears? | "A medium, such as air" first, delta 0, "buzz" on every answer |
| y5-materials-6 | c3 | Which pair of materials, when mixed, makes a fizzing gas? | "Vinegar and bicarbonate of soda" first, delta 0 |

**Cause.** In 5 of 5 the right answer is the **first** button, and it is marked wrong. The prompt said: "VARY which position the correct answer sits in … do NOT always make the first button the right one." The model kept writing the right answer first, then took the "1" off it.

**The same cause also gives wrong answer keys that pass every check.** We read by eye every v1 quiz whose key sits on the third or fourth button (32 cards). In these, the right answer is written first and a later, wrong button carries the delta 1:

- y3-rocks-2: sediment settles "Deep inside volcanoes".
- y4-electricity-4: opening the switch makes the lamp "turn a different colour".
- y4-living-things-3: a forest fire "helps seeds to sleep".
- y4-sound-1: a plucked string is "shining brightly".
- y4-states-of-matter-2: water freezing is "Dissolving".
- In the failed decks: y3-rocks-3 c6 ("Salt from the sea") and y5-materials-6 c4 ("Hydrogen").

So "valid on the first try" over-counts good decks: at least 5 of the 50 have a wrong key. We did not read the second-button keys by eye.

**Fix (TASK-33c9): the prompt only.**

- The server already shuffles the answer order (seeded per deck), so the position rule was never needed.
- All three prompts now say: put delta 1 on the button whose label IS the right answer, as you write it; never leave a quiz with no delta 1; Stackyard shuffles the order, so don't move answers or repeat one.

**Why the server does not repair it.** Marking "the first answer" right would be a guess at the answer key: the inventing we must not do, and the wrong-key cases above show the guess can be wrong. Dropping the card would hide the error and cost a question. On the live app, an invalid deck already gets a full retry. Tests replay each of the five exact cached cards and show that:

- it fails the quiz-answer invariant;
- the server never marks an answer right;
- with its first answer marked right, the deck is valid.

## b) The count shortfall: the story stands in for a question (25 of 55)

**The parser is right.** `parseRequestedCounts` reads quiz 5 and flash 2 from all 55 sentences (a test checks every one).

What the model wrote, before our trim:

| Quiz cards written | Decks |
|---|---|
| 3 | 3 |
| 4 | 25 |
| 5 | 20 |
| 6 | 7 (trimmed to 5) |

Flash cards: 2 in 52 decks, 4 in 2 (trimmed to 2), 1 in 1 (y5-materials-6).

**Every deck** has the story trio: a choice card whose text asks the class a question, plus 2 consequence cards.

- 20 of the 25 four-quiz decks have the same 10-card shape: 2 flash, 3 quiz, the story trio, 1 quiz, the end card.
- The story's question stands in for the fifth question.
- Two decks padded a quiz with a question about the lesson itself:
  - y3-light-3: "How many of the 5 questions in this set have you tried so far?"
  - y4-living-things-1: "How many living things groups are in this stack's main example…?"

Of the 25 valid decks off-count:

- 22 have 4 quiz cards. The other three four-quiz decks (y3-animals-2, y3-forces-magnets-3, y5-materials-6) failed validation.
- 3 have 3 quiz cards: y3-plants-3, y4-electricity-3, y4-sound-4.

The four-quiz decks:

- **Year 3:** y3-plants-1, y3-plants-2, y3-animals-1, y3-light-1, y3-light-2, y3-light-3, y3-light-5, y3-forces-magnets-1, y3-forces-magnets-2, y3-forces-magnets-4, y3-forces-magnets-5.
- **Year 4:** y4-animals-1, y4-animals-2, y4-states-of-matter-1, y4-states-of-matter-3, y4-sound-5, y4-electricity-1.
- **Year 5:** y5-materials-2, y5-materials-4, y5-earth-space-1, y5-earth-space-2, y5-earth-space-4.

The counts were stated once, at the very end of the user message ("Write exactly 5 quiz cards and exactly 2 flash cards.").

**Fix (TASK-33c10): a card plan.** The user message now opens and closes with:

> Card plan: exactly 5 quiz cards, exactly 2 flash cards, 1 story card with its 2 consequence cards, 1 end card (11 cards in all). The story cards are not quiz cards.

The system prompts gain a "Card plan" section. It says that a story card and its consequence cards never count towards the quiz cards, even when the story asks a question. All three prompts also forbid questions about the lesson itself.

## c) Lesson warnings (14 of 50 first-try decks)

Some decks had more than one kind of warning.

| Warning | Cards | Objectives |
|---|---|---|
| two-answers | 7 cards in 5 decks | y3-light-3 (3: a yes/no "Can the sun hurt your eyes…?", UV vs infrared, and the lesson-itself question), y3-light-4, y4-electricity-2, y4-sound-1, y4-sound-3 |
| restates-flash | 6 | y3-rocks-2, y3-light-4, y4-states-of-matter-3, y5-earth-space-2, y5-forces-1, y5-forces-3 |
| answer-inside-answer | 4 | y3-plants-1 ("Sunlight" / "Sunlight and air"), y3-forces-magnets-2 ("Contact force" / "Non-contact force"), y4-sound-5, y5-materials-3 ("Sieve" / "Sieve with larger holes") |

- **Two answers.** These are mostly a yes/no question or a "which of A or B" question written without an "or". y4-sound-1's two answers come from a duplicate: "A bell" was written twice, once as the key.
- **Restates a flash card.** All 6 are the first or second quiz (card 3 or 4), straight after the two flash cards at the start of the deck. They ask the term back ("What is a fossil?") or a fact from its explanation ("about 27 days").

**Fix (TASK-33c11): sharper prompt rules, and no server change.**

- A yes/no question is not a comparison: ask it with 3 or 4 answers.
- In the three cards after a flash card, no quiz may have its term as the right answer, ask "What is <term>?", or ask for a fact its explanation states.
- No answer may be another answer with words added or taken away (with the "Sieve" example).

## Next

We re-record with `npm run bench:record -- --force` and replay. The v1 table stays at the top of `RESULTS.md`, and `check:claims` checks the new `results.json`.

## v2

The coordinator re-recorded all 55 objectives with the TASK-33c9–c11 prompt fixes.

| Measure | v1 | v2 |
|---|---|---|
| Valid on the first try | 50 of 55 | 54 of 55 |
| No lesson warnings | 36 of 55 | 48 of 55 |
| Asked-for counts | 25 of 55 | 47 of 55 |

**Wrong keys: none found in the sample** (TASK-33c15). The lesson-checker persona read every quiz card in 12 v2 decks (60 cards; `LESSON_CHECKER.md`, `key-review.json`) and found:
- **0 wrong keys**, so there is nothing to list here;
- **2 ambiguous** cards:
  - y4-living-things-1 card 3, a garbled question;
  - y4-sound-2 card 4: "Which medium can sound travel through? → Air", where water and glass are also true.

This is a sample by an AI reviewer. It does not show the other 42 decks are clean.

**Could a prompt change fix the two ambiguous cards?** Plausibly, at least for the second.
- y4-sound-2 card 4 is the error the "Wrong answers" rule already forbids: a distractor that is also true. Its wording ("Never offer an option that is partly true…") is about partly true answers. A rule that names "a wrong answer that is fully true too" could catch it.
- The garbled y4-living-things-1 question is a one-off writing slip that no rule would reliably prevent.

We have not changed the prompt.

### v2 distractors and the joke-answer check (TASK-34a)

**Ground truth** (`LESSON_CHECKER.md`, "v2 distractor review"; an AI review): 96 of 541 distractors are absurd, in 34 of 54 decks.

**The check** (`jokeAnswerReason` in `src/shared/lessonCheck.ts`) is a list of 15 documented markers: glowing, magic, a colour change offered as the result, turning to ice when the question isn't about cold, an impossible shape, a silly condition, "makes … heavier", and so on.

Measured against the ground truth by `scripts/distractor-eval.ts`: **precision 1.00 (20 of 20 flags), recall 0.21 (20 of 96 absurd distractors)**.

- **This precision is in-sample.** The markers were drawn from this same data, so expect it to be lower on new decks.
- **What it misses.** About four in five absurd answers are "the wrong kind of thing" ("A chair", "A rock", "Frog" as a plant). Only a reader can see those. That is why the prompt change, not the check, carries the fix.

**Rules we built, measured and dropped:**

| Rule | Flags | True | False | Precision |
|---|---|---|---|---|
| Off-topic: none of the wrong answer's content words appear anywhere in the lesson, while the right answer's do | 227 | 57 | 170 | 0.25 |
| The same, only for phrases of 3 or more content words | 29 | 7 | 22 | 0.24 |
| Wrong sense: colour, smell or weight not mentioned in the lesson | 20 | 12 | 8 | 0.60 |

Real misconceptions are new words too ("Gold", "Steam", "Petals", "Smell" as a property), so a rule that looks for words missing from the lesson can't tell a mistake a pupil would make from a joke.

**The prompt (TASK-34a3).** All three prompts now build every wrong answer from one neutral pattern: start from the right answer and change the one part a pupil who half-remembers the lesson gets wrong. They also say "Never silly, magic or impossible options", and never a colour, smell or weight when the question isn't about one. No answer from the bench is quoted.

**Effect on the current run** (still the v2 recordings, today's checks): "passed our automatic lesson check with no warnings" falls from 48 to 38 of 55. The joke-answer warning is the only new warning.

**v3** re-records only the 34 objectives in `rerecord.txt` (`npm run bench:record -- --force --only-file bench/rerecord.txt`). After the re-record, the lesson-checker labels those decks' distractors the same way.

### v3: the 34 re-recorded decks (TASK-34a5)

Same definitions, same reviewer (the lesson-checker persona; an AI review). Full tables in `LESSON_CHECKER.md`, "v3 distractor review".

- **Joke answers:** 96 of 339 → **74 of 336** (28.3 → 22.0 per 100). Decks with at least one: 34 → 25 of 34. A fifth fewer, not none.
- **The joke-answer check, out of sample:** precision **1.00 (4 of 4)**, recall **0.05 (4 of 74)**. In-sample on v2 it was 1.00 and 0.21. The markers fit v2's phrasing and miss v3's "wrong kind of thing" jokes.
- **Keys:** **3 wrong** (y5-forces-1 card 10; y5-forces-3 cards 3 and 5) and 6 ambiguous. The wrong ones state the opposite of the physics (gears, levers, equal and opposite pulls).
- **Could a prompt change fix what remains?**
  - The remaining jokes are mostly an obvious non-member of the asked-for category ("A cloud" as a plant, "Your elbows" for talking). A rule such as "every wrong answer must belong to the category the question asks for" could plausibly reduce them.
  - The wrong keys need a different fix: a reader, or a second model pass that checks each key. We have not changed the prompt in this task.

### v4: the why-field prompt (TASK-34a9)

Same 34 objectives, re-recorded once more. Full tables in `LESSON_CHECKER.md`, "v4 (why-field prompt)".

- **Joke answers on the same 32 decks** (2 had no file): v2 27.6 → v3 21.8 → v4 22.7 per 100. The why field brought no further gain.
- **Wrong keys:** v3 3 → v4 1. The one left is y5-forces-1 card 9, the same equal-and-opposite-pull misconception as v3.
- **Two new validation failures** (y5-materials-5, y5-earth-space-3): a `"why"` key with no value (`"why","actions"`) on a Next Card or story button, which is not a quiz answer. That line is not valid JSON, so the streamed attempt stopped.
  - Likely cause: `"why"` sits in the generic button schema.
  - Two fixes would plausibly stop it: move `"why"` out of the generic schema into the quiz-answer rule only, and/or let the stream parser drop a valueless `"why"` key before JSON parsing. Neither is made in this task.
- **Time to done:** p50 9.2 s, p90 10.5 s (v3 8.3 / 9.3), from the recording. That is close to the 10.5 s TASK-34a8 estimated.

### v5: the category rule, and the end of the prompt-only work (TASK-34a12)

Same 34 objectives, re-recorded once more with the TASK-34a10/a11 prompt. Full tables in `LESSON_CHECKER.md`, "v5 (category rule, why on quiz answers only)". This was the last model-call round for distractors.

- **Joke answers on the same 32 decks** (the decks with a file in every run): v2 27.6 → v3 21.8 → v4 22.7 → v5 22.2 per 100.
- **Wrong keys:** 1, the same equal-and-opposite-pull misconception for the third run (y5-forces-1, now card 3). 5 ambiguous.
- **Validity:** both v4 breakages are fixed; 54 of 55 valid on the first try, as in v3.
- **The category rule was barely tested.** The model wrote the "why" (where the rule lives) in only 6 of 34 decks, against 34 of 34 in v4 when "why" sat in the button schema.

## Conclusion: what prompt changes achieved, and what next

Written at the end of the distractor work. Every number is from an AI review (the lesson-checker persona), not a teacher's.

**What it achieved.**
- One prompt change (TASK-34a3, "change the one part a pupil gets wrong") cut joke answers by about a fifth: 27.6 → 21.8 per 100 on the same 32 decks. Decks with at least one joke fell from 32 to 23.
- Later changes fixed real faults, not the jokes. The v4 "why" breakage is gone (54 of 55 valid). Wrong keys fell from 3 (v3) to 1 (v4, v5).

**Where it plateaus.**
- Three runs with three different prompts (v3, v4, v5) sit at 21.8, 22.7 and 22.2 per 100. That is one level plus noise. Single decks swing by up to five jokes between runs, so a gain on one deck says nothing.
- About one wrong answer in five is still a joke. In a five-question deck that is about two jokes the teacher has to spot.
- The remaining jokes are mostly a thing that is not even the right kind of thing. The rule aimed at that (v5) was mostly not followed: the model skipped the "why" that carried it in 28 of 34 decks. More prompt text competes with the rest of a long prompt and gets dropped.
- The one wrong key is a misconception the model holds (the Earth pulls harder than the object), not a slip. No wording has changed it in three runs.
- The joke-answer check (markers) does not generalise: recall 0.21 in-sample, then 0.05, 0.01 and 0.03 out of sample, with its first false alarm in v5. It is a small net, not a measure.

**The next options, with their cost.** None is built.

| Option | What it does | Model calls | Latency for the teacher | Other cost |
|---|---|---|---|---|
| A second "distractor critic" pass per deck | A separate call reads the finished deck, marks wrong answers that are not a plausible member of the category, and proposes replacements. It could check each key too. | 2 per deck instead of 1. The bench: 34 → 68 calls for the re-recorded set, 55 → 110 for all of it. | If it runs after generation, it adds one whole non-streamed call before "done" (not measured; one call is several seconds, against 8.3 s p50 done today). It could run while the teacher reads the first cards, but then cards change under her. | Twice the tokens per deck. The critic is a model too: it needs its own review against these labels before it is trusted. |
| A stronger model for generation | Today: claude-haiku-5-5, thinking off. Try thinking on, or a larger model. | Same count (1 per deck); one bench re-record (55 calls) to measure it. | Higher time to the first card (1.4 s p50 today) and to done. Not measured. | A higher price per token. It might also fix the misconception key; it might not. |
| "Swap this wrong answer" in the Maker | The teacher clicks a wrong answer and types her own, or asks for another. | None if she types it; one small call per swap if she asks for one. | Only when she asks, a short call per answer. | Her time: about two answers per five-question deck at today's rate. It fits the product's edit step, and it is the only option that puts a teacher's judgement in. |

**What the bench would need.** Whichever option is chosen, the same 32 decks and the same labelling definitions give a like-for-like number. A teacher's review of a sample would test whether the AI labels match a teacher's.
