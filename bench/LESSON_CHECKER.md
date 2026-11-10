# Lesson-checker reviews of bench decks

Two reviews: v1 (five decks, a full content review, just below) and v2 (a key-accuracy sample of 12 decks, [at the end](#v2-key-accuracy-sample-12-decks)).

9 November 2026: run inside Kiro by the lesson-checker persona; read-only.

The reviewer is `.kiro/agents/lesson-checker.md`, a primary-school teacher and curriculum reviewer for 8–10-year-olds. It read the `#stack-data` JSON of each file named below and changed nothing. These are the v1 recordings (`claude-haiku-5-5`, thinking off, before the TASK-33 prompt fixes).

This is a content review of five generated decks. It is not a classroom study, and no teacher or pupil was involved. Card numbers are play order in the file.

## y3-light-3

`bench/files/y3-light-3.html`, "Staying safe in the sun" (objective: recognise that light from the sun can be dangerous and that there are ways to protect their eyes).

**Verdict:** not ready for a class. Card 9 is not a question about the topic, and three of the four quizzes are 50/50 guesses.

**Facts.**
- [card 4] "What type of light from the sun can damage your eyes? → Ultraviolet light" (vs "Infrared light"). This is not safely one-sided. UV harms the front of the eye, but staring at the sun burns the retina mostly with visible light, and infrared adds heat damage. A bright pupil who has heard "the sun's heat" could argue for infrared. → Ask "What should you never do on a sunny day?" with "Look straight at the sun" as the key.
- [card 1] The flash card is accurate ("you cannot see" UV; it harms skin and eyes).
- [cards 6–8] The story is accurate and sensible.

**Ambiguity.**
- [card 9] "How many of the 5 questions in this set have you tried so far? Pick the answer that is true for you. → Five | Two" asks about the lesson, not the sun. "Five" is marked right, but the deck has only four quizzes, so "Five" is false. Remove it.
- [card 3] "Can the sun hurt your eyes even on a cloudy day? → Yes / No" is a coin toss. Rewrite with three answers, e.g. "When can the sun hurt your eyes?" → "On sunny and cloudy days" / "Only at night" / "Only in winter".
- [card 5] "Stare at the sun to check it is there" and "Sit in the dark all day" are joke distractors. Use "Wear a sun hat but look at the sun" and "Wear any dark glasses, even toy ones".

**Reading level.** Fine for 8–10: short sentences, everyday words. "Ultraviolet (UV)" is explained on card 1.

**Suggested fix.** Replace card 9 with a real fifth question, e.g. "Which of these protects your eyes best?" → "Sunglasses marked UV 400" / "Squinting" / "Toy sunglasses".

## y3-rocks-2

`bench/files/y3-rocks-2.html`, "How fossils are formed" (objective: describe in simple terms how fossils are formed when things that have lived are trapped within rock).

**Verdict:** not ready. One answer key is wrong, and a pupil who learnt the topic would be marked wrong.

**Facts.**
- [card 4] "Where does sediment usually settle to form layers?" has the key on "Deep inside volcanoes". That is false. The right answer is "At the bottom of rivers, lakes and seas", which the deck's own flash card 2 says. In the raw model text the right answer was written first with delta 0, and the delta 1 sat on "Deep inside volcanoes" (see `DIAGNOSIS.md` a).
- [cards 1, 6, 8, 10] These are accurate.
- [card 1] The picture is a light bulb on the "Fossil" card, which is confusing. Use the fish or leaf pictogram, or none.

**Ambiguity.**
- [card 9] "Which is bigger: a fossil of a dinosaur, or the rock it is trapped in? → The rock" has no single answer: an exposed fossil can be bigger than the rock fragment around it. It also teaches nothing about how fossils form.
- [card 3] "What is a fossil?" straight after the "Fossil" flash card just asks the definition back.
- [card 5] The story choice "It floats away on the wind" is silly for a fish at the bottom of a lake. Use "It is eaten by other animals", which also explains why most remains never become fossils.

**Reading level.** Mostly fine. "Sedimentary rock" (card 8) is beyond Year 3 unless taught: say "rock made of layers of mud and sand".

**Suggested fix.** Mark "At the bottom of rivers, lakes and seas" right on card 4. Replace card 9 with "What turns the mud around a buried animal into rock?" → "Being pressed for a very long time" / "Rain washing it" / "Sunlight drying it".

## y4-states-of-matter-3

`bench/files/y4-states-of-matter-3.html`, "The water cycle: evaporation and condensation" (objective: identify the part played by evaporation and condensation in the water cycle and associate the rate of evaporation with temperature).

**Verdict:** usable with two small edits. The facts are right.

**Facts.** All keys are correct:
- [card 3] the sun heats water so it evaporates;
- [card 4] condensation;
- [card 5] fastest on a warm, sunny day;
- [card 9] faster in summer.

The flash cards are accurate. [card 8] "Water does not soak into a table" is too absolute for a wooden table, but harmless.

**Ambiguity.**
- [card 4] "Which process turns water vapour back into liquid droplets to form clouds?" repeats the "Condensation" flash card two cards earlier almost word for word, so pupils match words rather than think.
- [card 9] "Which is bigger, the rate of evaporation in summer or in winter?" is clumsy ("bigger rate"). Use "When does a puddle dry up faster: in summer or in winter?"
- [card 3] "Makes rain fall from clouds" is partly defensible, because the sun drives the whole cycle. Swap it for "Makes the sea salty".

**Reading level.**
- "Rate of evaporation" (card 9) and "gave the water enough energy to become vapour" (card 7) are on the edge for 4th class. Keep the latter; reword the former as above.
- Otherwise short and clear. The river picture on the windowsill story does not match: use a sun or none.

**Suggested fix.** Replace card 4 with an application question: "Your cold glass of juice gets wet on the outside. What is happening?" → "Water vapour in the air is condensing" / "The juice is leaking through the glass" / "The ice is melting outwards".

## y4-electricity-2

`bench/files/y4-electricity-2.html`, "Simple series circuits: parts and building" (objective: construct a simple series electrical circuit, identifying and naming its basic parts, including cells, wires, bulbs, switches and buzzers).

**Verdict:** the quizzes are good. The story teaches a misconception.

**Facts.**
- [cards 3–7] The keys are correct (cell, switch opens and closes, buzzer, complete loop, cell symbol).
- [cards 8–10] The story implies a bulb needs a switch to light: "Join the wires straight to the cell" leads to "nothing lights". A bulb in a complete loop lights with or without a switch. Joining a wire straight from one end of a cell to the other, with no bulb, is a short circuit: unsafe, and it flattens the cell. The consequence card states neither.

**Ambiguity.**
- [card 7] "Which symbol means a cell in a circuit diagram?" has only two answers ("A long line and a short line" / "A circle with a cross inside"), so it is a 50/50. Add "A zigzag line" and "A circle with an M inside".
- [card 1] "pushes electricity around a circuit" is fine for this age.

**Reading level.** Good: short sentences, the parts are named in everyday words, and "series circuit" is explained on card 2.

**Suggested fix.** Rewrite the story choice as "Your bulb does not light. Do you check the loop for a gap, or add a second cell?" Each consequence then teaches something true: a gap breaks the loop; a second cell does not help if the loop is broken.

## y5-earth-space-4

`bench/files/y5-earth-space-4.html`, "Day and night: Earth's rotation" (objective: use the idea of the Earth's rotation to explain day and night and the apparent movement of the sun across the sky).

**Verdict:** clean enough for a class. The facts are right, and only the story's picture-in-the-head is muddled.

**Facts.** All keys are correct:
- [card 3] Earth spinning on its axis;
- [card 4] about 24 hours;
- [card 5] the side facing the sun;
- [card 9] Earth turns from west to east.

The flash cards are accurate.

**Ambiguity.**
- [card 6] "Aoife is on a spinning roundabout… She sees the sun slide across the sky" mixes two motions: on a roundabout the sun whirls past every few seconds, which is the point of the analogy but not what "slide across the sky" suggests. Say "As the roundabout turns, the sun seems to move past her, even though it stays still."
- [card 5] "Which part of the Earth is in daylight at the same moment?" reads oddly. Use "Which part of the Earth has daytime?"

**Reading level.** "Axis" is used in cards 3 and 8 but the flash card only says "an imaginary line": add "called its axis" to card 1. Everything else suits 9–10-year-olds.

**Suggested fix.** On card 1, write "Earth spins around an imaginary line called its axis, through the North and South Poles." That way "axis" in card 3 is a word the class has met.

## Summary

| Deck | Wrong key | Not a real question | Two-answer guess | Ready for class |
|---|---|---|---|---|
| y3-light-3 | 1 (card 9: "Five") | 1 | 3 | no |
| y3-rocks-2 | 1 (card 4) | 0 | 1 (card 9) | no |
| y4-states-of-matter-3 | 0 | 0 | 1 (a fair comparison) | with two edits |
| y4-electricity-2 | 0 (the story misleads) | 0 | 1 | after the story fix |
| y5-earth-space-4 | 0 | 0 | 0 | yes |

The two wrong keys (y3-light-3 card 9, y3-rocks-2 card 4) passed every mechanical check, including "valid on the first try" and the lesson check. That is the case for keeping a reader in the loop.

## v2 key-accuracy sample (12 decks)

9 November 2026: run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's.

The recording is v2: `claude-haiku-5-5`, thinking off, after the TASK-33c9–c11 prompt fixes. The reviewer read the `#stack-data` JSON of each file and changed nothing. The machine-readable verdicts are in [`key-review.json`](key-review.json).

This review asks one question per quiz card: is the marked answer the one defensibly right answer? It is not a full content review, and it is not a classroom study.

**Sample rule** (`keyReviewSample` in `scripts/bench-lib.ts`; deterministic):
- every 5th objective in `objectives.json` order, starting at the 1st (positions 1, 6, 11, … 51);
- if that objective has no first-try file, the next one in order that has one (`y4-electricity-2` failed on v2, so `y4-electricity-3` stands in);
- plus `y3-rocks-2`, because v1 had a wrong key there.

**Verdicts:**
- **correct:** the marked answer is the one defensibly right answer;
- **wrong:** the marked answer is false, or another answer is the right one;
- **ambiguous:** more than one answer is defensible, or the question can't be answered as written.

| Deck | Quiz cards | Correct | Wrong | Ambiguous | Not correct (card: reason) |
|---|---|---|---|---|---|
| y3-plants-1 | 5 | 5 | 0 | 0 | — |
| y3-animals-2 | 5 | 5 | 0 | 0 | — |
| y3-light-2 | 5 | 5 | 0 | 0 | — |
| y3-forces-magnets-2 | 5 | 5 | 0 | 0 | — |
| y4-living-things-1 | 5 | 4 | 0 | 1 | card 3: "…grouped by what they look like and how they do what? → Live" is garbled and can't be answered as written; "Sleep" is defensible |
| y4-animals-3 | 5 | 5 | 0 | 0 | — |
| y4-sound-2 | 5 | 4 | 0 | 1 | card 4: "Which medium can sound travel through? → Air", but sound also travels through water and glass, the two "wrong" answers |
| y4-electricity-3 | 5 | 5 | 0 | 0 | — |
| y5-living-things-2 | 5 | 5 | 0 | 0 | — |
| y5-materials-4 | 5 | 5 | 0 | 0 | — |
| y5-earth-space-3 | 5 | 5 | 0 | 0 | — |
| y3-rocks-2 | 5 | 5 | 0 | 0 | — |
| **Total** | **60** | **58** | **0** | **2** | |

**Totals:** 60 quiz cards reviewed from 12 decks: 0 wrong keys, 2 ambiguous.

**What this does and doesn't show.**
- No wrong key in 60 cards. In v1 we found at least 5 wrong keys across the 50 valid decks (`DIAGNOSIS.md` a).
- This is a sample of 12 of the 54 v2 decks, read by an AI. It does not prove the other 42 are clean.
- y3-rocks-2, the v1 deck with "Deep inside volcanoes", now keys "In layers of sediment at the bottom of water".

**Other notes (keys counted correct, but worth an edit):**
- y3-animals-2 card 3: "Which body part does a muscle join to a bone?" reads backwards. Better: "What joins a muscle to a bone?"
- y3-animals-2 card 9: "Bones and joints" is near-circular, and "Clouds and wind" / "Leaves and roots" are joke distractors.
- y4-electricity-3 card 3: "Where does the current start?" Current flows round the loop. The KS2 model "the battery pushes it" makes the key fine, but "What pushes the current round a circuit?" is better.
- y5-materials-4 card 10: "Ice" is a joke distractor. The story's consequence card 6 says metal "gets very cold in the sun", which is false: metal in the sun gets hot. That card is not a quiz, so it is not counted.
- y3-light-2 cards 3 and 9 ask nearly the same question.
- y4-electricity-3 card 10 asks the term from flash card 9 straight back ("Open"). The automatic check missed it: its flash-restatement match did not trigger.

## v2 distractor review

9 November 2026: run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's (TASK-34a1).

The reviewer read the `#stack-data` of every v2 bench file (54 decks) and labelled every wrong answer on every quiz card. This is the ground truth for the joke-answer check and for what v3 re-records. Every distractor is in [`distractor-review.json`](distractor-review.json); the judgement itself (the absurd ones, with reasons) is in [`distractor-labels.json`](distractor-labels.json).

**Labels:**
- **absurd:** off-topic, physically silly, or no 8–10-year-old would believe it;
- **plausible:** a mistake a pupil who hasn't learnt it yet might really make. A plausible option can still be weak or easy.

**Totals.**
- 268 quiz cards and 541 distractors reviewed.
- **96 absurd** (18 %); the other 445 are plausible.
- **34 of 54 decks** have at least one absurd distractor. Those 34 are the objectives in [`rerecord.txt`](rerecord.txt).
- How many absurd distractors a deck has:

  | Absurd distractors | Decks |
  |---|---|
  | 0 | 20 |
  | 1 | 10 |
  | 2 | 10 |
  | 3 | 5 |
  | 4 | 3 |
  | 5 | 1 |
  | 6 | 2 |
  | 7 | 2 |
  | 8 | 1 |

  The worst are y4-sound-2 (8 of 10), y4-living-things-3 and y5-earth-space-3 (7 each), and y3-animals-2 and y4-electricity-1 (6 each).

**What the absurd ones look like:**
- **Another sense or property offered as the answer.** Colours and smells in a sound lesson ("It changes colour", "Smells"); weight in a magnets or circuits lesson ("The switch makes the lamp heavier").
- **Not even the right kind of thing.** Objects that obviously can't be the answer: "A chair" as a light source, "A rock" as an animal, "A wooden spoon" as an electrical appliance, "Frog" as a plant.
- **Physically silly results.** "It turns to ice", "It floats up into the air", "Height keeps doubling", "It makes the body glow in the dark".
- **Silly conditions.** "Only if the ball is wet", "Only when the ball is hot".

Three key notes turned up as well (not distractor labels):
- y3-light-3 card 5 has a **wrong key**: "What should you never do?" marks the safe "Look at the sun through a solar viewer" right.
- y4-sound-2 card 4 is ambiguous (already in the key review).
- y5-living-things-1 card 7 is ambiguous: "from the day they hatch" keys "A cow".

## v3 distractor review (34 re-recorded decks)

9 November 2026: run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's (TASK-34a5).

The coordinator re-recorded exactly the 34 objectives in [`rerecord.txt`](rerecord.txt) with the TASK-34a prompt (34 model calls). The reviewer read each re-recorded file's `#stack-data` and labelled every wrong answer on every quiz card, using the same definitions as the v2 review. It also judged every answer key, because a prompt change can break keys. Every verdict is in [`distractor-review-v3.json`](distractor-review-v3.json); the judgement itself is in [`distractor-labels-v3.json`](distractor-labels-v3.json).

**The same 34 decks, before and after:**

| | v2 (before) | v3 (after) |
|---|---|---|
| Quiz cards | 169 | 169 |
| Wrong answers | 339 | 336 |
| Absurd wrong answers | 96 | 74 |
| Absurd per 100 wrong answers | 28.3 | 22.0 |
| Decks with at least one absurd wrong answer | 34 of 34 | 25 of 34 |
| Wrong keys | not reviewed on these decks (v2 key review: a 12-deck sample, `key-review.json`) | 3 |
| Ambiguous keys | — | 6 |

**What this shows.**
- The prompt change helped, but less than hoped: joke answers fell by about a fifth, not to zero.
- 9 decks are now clean, including y3-animals-2 (was 6), y3-rocks-3 (4) and y5-materials-6 (3).
- 10 decks got worse, for example y3-light-1 (3 → 5) and y4-sound-1 (3 → 5).
- The kind of joke that remains is mostly "not even the right kind of thing": a chair or a book as a light source, a cloud or a rock as a plant, elbows and knees for talking. The prompt's pattern ("change the one part a pupil gets wrong") does not stop the model reaching for an obvious non-member of the category.

**Per deck** (absurd of wrong answers):

| Deck | v2 | v3 |
|---|---|---|
| y3-animals-1 | 1 of 10 | 3 of 8 |
| y3-animals-2 | 6 of 10 | 0 of 10 |
| y3-forces-magnets-2 | 2 of 10 | 0 of 10 |
| y3-forces-magnets-6 | 2 of 10 | 0 of 10 |
| y3-light-1 | 3 of 10 | 5 of 10 |
| y3-light-2 | 2 of 10 | 2 of 10 |
| y3-light-3 | 4 of 10 | 3 of 10 |
| y3-light-4 | 2 of 10 | 2 of 10 |
| y3-light-5 | 1 of 8 | 0 of 10 |
| y3-plants-4 | 1 of 10 | 1 of 10 |
| y3-rocks-2 | 2 of 10 | 1 of 10 |
| y3-rocks-3 | 4 of 12 | 0 of 10 |
| y4-animals-1 | 1 of 10 | 0 of 10 |
| y4-animals-3 | 1 of 10 | 2 of 10 |
| y4-electricity-1 | 6 of 10 | 5 of 10 |
| y4-electricity-4 | 1 of 10 | 1 of 10 |
| y4-electricity-5 | 2 of 10 | 3 of 10 |
| y4-living-things-1 | 3 of 10 | 4 of 10 |
| y4-living-things-2 | 4 of 10 | 4 of 10 |
| y4-living-things-3 | 7 of 10 | 6 of 10 |
| y4-sound-1 | 3 of 10 | 5 of 9 |
| y4-sound-2 | 8 of 10 | 5 of 10 |
| y4-states-of-matter-3 | 2 of 10 | 2 of 10 |
| y5-animals-1 | 2 of 10 | 3 of 10 |
| y5-earth-space-2 | 1 of 10 | 0 of 10 |
| y5-earth-space-3 | 7 of 10 | 4 of 10 |
| y5-forces-1 | 3 of 9 | 2 of 10 |
| y5-forces-3 | 1 of 10 | 2 of 10 |
| y5-living-things-2 | 2 of 10 | 3 of 10 |
| y5-materials-2 | 2 of 10 | 0 of 9 |
| y5-materials-3 | 1 of 10 | 1 of 10 |
| y5-materials-4 | 5 of 10 | 4 of 10 |
| y5-materials-5 | 1 of 10 | 1 of 10 |
| y5-materials-6 | 3 of 10 | 0 of 10 |

**The joke-answer check, out of sample.** Its markers were chosen from the v2 labels, so v3 is the honest test (`scripts/distractor-eval.ts bench/distractor-review-v3.json`):

| | Precision | Recall |
|---|---|---|
| v2 (in-sample, the data it was tuned on) | 1.00 (20 of 20) | 0.21 (20 of 96) |
| v3 (out-of-sample) | 1.00 (4 of 4) | 0.05 (4 of 74) |

It still raised no false alarm, but it caught only 4 of the 74 jokes. Its markers match v2's phrasing, and v3's jokes are mostly a wrong kind of thing, which no marker names. The check is a small safety net, not the fix.

**Keys** (all 169 v3 quiz cards). The prompt change did break keys:

- **Wrong (3):**
  - y5-forces-1 card 10: "Which pulls harder, the Earth or the object?" keys "The Earth pulls harder". They pull equally hard.
  - y5-forces-3 card 3: the see-saw pivot is keyed "Far from the heavy friend, near your end". It should be close to the heavy friend.
  - y5-forces-3 card 5: a small gear turning a big gear keys the big gear's turning force as "smaller". It gets bigger.
- **Ambiguous (6):**
  - y4-animals-3 card 9: "the chain fox to rabbit" reads, by the deck's own arrow rule, as the rabbit eating the fox.
  - y4-living-things-1 card 10 and y4-living-things-3 card 8 ask about the lesson itself, not the topic.
  - y4-living-things-2 card 1: is a fallen leaf "Living" or "Neither, it is a plant part"?
  - y5-materials-5 card 4: water turning into ice is reversed by warming, not cooling.
  - y5-materials-5 card 8: cocoa partly dissolves in milk.

All three wrong keys are in two forces decks, and all three state the opposite of the physics. No mechanical check catches them.

## v4 (why-field prompt)

10 November 2026: run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's (TASK-34a9).

The coordinator re-recorded the same 34 objectives once more, with the TASK-34a7 prompt (every quiz answer carries a "why" that the server strips). The reviewer labelled every wrong answer and judged every key on the quiz cards of the re-recorded decks, with the same definitions as v2 and v3. Results: [`distractor-review-v4.json`](distractor-review-v4.json); judgement: [`distractor-labels-v4.json`](distractor-labels-v4.json).

**Two of the 34 have no lesson file in v4:** y5-materials-5 and y5-earth-space-3 failed validation, so 32 decks were reviewed. To compare like with like, the table counts the same 32 decks in all three runs.

| The same 32 decks | v2 | v3 | v4 |
|---|---|---|---|
| Absurd wrong answers | 88 of 319 | 69 of 316 | 72 of 317 |
| Absurd per 100 wrong answers | 27.6 | 21.8 | 22.7 |
| Decks with at least one absurd wrong answer | 32 of 32 | 23 of 32 | 26 of 32 |
| Wrong keys | not reviewed | 3 | 1 |
| Ambiguous keys | not reviewed | 4 | 5 |

(On all 34 decks, v3 was 74 of 336 absurd, 25 decks, 3 wrong and 6 ambiguous keys.)

**What this shows.**
- **Joke answers: no further gain.** v4 is level with v3, within noise: 22.7 against 21.8 per 100. The why field did not stop the model offering obvious non-members ("A cup" and "A stone" as light sources, "A football" and "Sand" for electricity, "Teeth and nails" to bend an arm). It wrote a "why" for them anyway. y3-light-3 (3 → 8) and y4-electricity-1 (5 → 8) got worse; y4-living-things-2 (4 → 1), y4-states-of-matter-3 (2 → 0) and y5-forces-1 (2 → 0) got better.
- **Keys: better.** 3 wrong → 1. Both v3 errors in y5-forces-3 (the see-saw pivot, the gear force) are gone. The one left is the same misconception as v3's y5-forces-1 card 10, in a new question: y5-forces-1 card 9 keys the Earth's pull on a ball as "Bigger" than the ball's pull on the Earth; the two are equal.
- **Ambiguous (5):**
  - y3-light-3 card 10: the skin also feels bright sunlight.
  - y3-light-4 card 3: "biggest shadow" depends on size, not material.
  - y4-living-things-1 card 4: the question gives its own answer away.
  - y5-living-things-2 card 10: pollen is a plant's male cell too.
  - y5-materials-3 card 3: evaporating also leaves the sand.

**The joke-answer check on v4** (out of sample): precision 1.00 (1 of 1), recall 0.01 (1 of 72). It caught one colour-change answer and nothing else.

**Why the 2 newly invalid decks failed** (read offline from `bench/cache/`).
- Both streams contain a malformed JSON line: `"label":"Next Card","why","actions":…` in y5-materials-5 card 2 (a flash card's Next Card), and `"label":"Pick it up","why","actions":…` in y5-earth-space-3 card 6 (a story choice). That is a `why` key with no value, on a button that is not a quiz answer.
- The stream parser rejects that line, the attempt stops, and the recording ends there. The live app would retry or fall back; the bench counts it as not a first try.
- **Likely cause.** The prompt put `"why"` in the generic button schema (marked "quiz answers only"), so the model also started writing it on Next Card and story buttons, sometimes as an empty `"why":""` and twice with no value at all.
- The third invalid deck, y4-electricity-2, was not re-recorded. It has been invalid since v2 (a quiz with no right answer).

**Per deck** (absurd of wrong answers):

| Deck | v2 | v3 | v4 |
|---|---|---|---|
| y3-animals-1 | 1 of 10 | 3 of 8 | 3 of 10 |
| y3-animals-2 | 6 of 10 | 0 of 10 | 4 of 10 |
| y3-forces-magnets-2 | 2 of 10 | 0 of 10 | 1 of 10 |
| y3-forces-magnets-6 | 2 of 10 | 0 of 10 | 0 of 9 |
| y3-light-1 | 3 of 10 | 5 of 10 | 4 of 10 |
| y3-light-2 | 2 of 10 | 2 of 10 | 1 of 10 |
| y3-light-3 | 4 of 10 | 3 of 10 | 8 of 10 |
| y3-light-4 | 2 of 10 | 2 of 10 | 2 of 10 |
| y3-light-5 | 1 of 8 | 0 of 10 | 1 of 10 |
| y3-plants-4 | 1 of 10 | 1 of 10 | 0 of 10 |
| y3-rocks-2 | 2 of 10 | 1 of 10 | 3 of 10 |
| y3-rocks-3 | 4 of 12 | 0 of 10 | 2 of 10 |
| y4-animals-1 | 1 of 10 | 0 of 10 | 1 of 10 |
| y4-animals-3 | 1 of 10 | 2 of 10 | 1 of 10 |
| y4-electricity-1 | 6 of 10 | 5 of 10 | 8 of 10 |
| y4-electricity-4 | 1 of 10 | 1 of 10 | 1 of 10 |
| y4-electricity-5 | 2 of 10 | 3 of 10 | 1 of 10 |
| y4-living-things-1 | 3 of 10 | 4 of 10 | 2 of 10 |
| y4-living-things-2 | 4 of 10 | 4 of 10 | 1 of 10 |
| y4-living-things-3 | 7 of 10 | 6 of 10 | 5 of 10 |
| y4-sound-1 | 3 of 10 | 5 of 9 | 3 of 10 |
| y4-sound-2 | 8 of 10 | 5 of 10 | 4 of 10 |
| y4-states-of-matter-3 | 2 of 10 | 2 of 10 | 0 of 9 |
| y5-animals-1 | 2 of 10 | 3 of 10 | 2 of 10 |
| y5-earth-space-2 | 1 of 10 | 0 of 10 | 2 of 10 |
| y5-earth-space-3 | 7 of 10 | 4 of 10 | no file (failed validation) |
| y5-forces-1 | 3 of 9 | 2 of 10 | 0 of 9 |
| y5-forces-3 | 1 of 10 | 2 of 10 | 3 of 10 |
| y5-living-things-2 | 2 of 10 | 3 of 10 | 2 of 10 |
| y5-materials-2 | 2 of 10 | 0 of 9 | 0 of 10 |
| y5-materials-3 | 1 of 10 | 1 of 10 | 0 of 10 |
| y5-materials-4 | 5 of 10 | 4 of 10 | 5 of 10 |
| y5-materials-5 | 1 of 10 | 1 of 10 | no file (failed validation) |
| y5-materials-6 | 3 of 10 | 0 of 10 | 2 of 10 |

## v5 (category rule, why on quiz answers only)

10 November 2026: run inside Kiro by the lesson-checker persona; read-only; an AI review, not a teacher's (TASK-34a12).

The coordinator re-recorded the same 34 objectives once more, with the TASK-34a10/a11 prompt: "why" only on quiz answer buttons, and every wrong answer must be a member of the category the question asks for. The reviewer labelled every wrong answer and judged every key on the quiz cards, with the same definitions as v2, v3 and v4 ("absurd" = off-topic, physically silly, or no 8–10-year-old would believe it). Results: [`distractor-review-v5.json`](distractor-review-v5.json); judgement: [`distractor-labels-v5.json`](distractor-labels-v5.json). This was the last model-call round for distractors.

**All 34 decks have a lesson file in v5.** v4 had none for y5-materials-5 and y5-earth-space-3, so the table counts the 32 decks that have a file in every run (v2, v3, v4 and v5).

| The same 32 decks | v2 | v3 | v4 | v5 |
|---|---|---|---|---|
| Absurd wrong answers | 88 of 319 | 69 of 316 | 72 of 317 | 71 of 320 |
| Absurd per 100 wrong answers | 27.6 | 21.8 | 22.7 | 22.2 |
| Decks with at least one absurd wrong answer | 32 of 32 | 23 of 32 | 26 of 32 | 25 of 32 |
| Wrong keys | not reviewed | 3 | 1 | 1 |
| Ambiguous keys | not reviewed | 4 | 5 | 5 |

(On all 34 decks, v5 is 77 of 340 absurd, 27 decks with at least one, 1 wrong and 5 ambiguous keys.)

**What this shows.**
- **Joke answers: flat for the third run.** 21.8, 22.7, 22.2 per 100 is noise around one level.
- **The category rule was mostly not followed, so it was barely tested.** It lives in the right answer's "why". Once "why" left the generic button schema (TASK-34a10), the model wrote it in only 6 of the 34 recorded decks (v4: 34 of 34; read offline from `bench/cache/`, which holds the text before the server strips it). Only those 6 name a category. They have 11 absurd of 60 (18 per 100), the other 28 decks 66 of 280 (24 per 100). Six decks are too few to call that a gain.
- **Decks move, the total does not.** y3-rocks-3 (2 → 6), y4-living-things-2 (1 → 6) and y4-states-of-matter-3 (0 → 3) got worse; y3-light-3 (8 → 4), y4-sound-2 (4 → 2), y3-animals-2 (4 → 0) and y3-rocks-2 (3 → 0) got better. y4-electricity-1 is 8 of 10 again.
- **Keys: level with v4.** One wrong key, and it is the same misconception for the third run in a row.
- **The two v4 breakages are fixed.** Both decks are valid in v5 (the "why" no longer appears on Next Card or story buttons).

**Keys** (all 169 v5 quiz cards):

- **Wrong (1):** y5-forces-1 card 3 keys "Earth pulls harder". The Earth and the object pull on each other equally hard. v3 (card 10) and v4 (card 9) made the same error.
- **Ambiguous (5):**
  - y3-light-2 card 10: a rough brick and a still pond are both offered, and the pond also reflects.
  - y3-light-5 card 10: moving the object away from the torch also makes the shadow shorter.
  - y3-plants-4 card 9: the question gives its own answer away.
  - y4-living-things-1 card 3: a fish is also an animal without legs.
  - y5-earth-space-2 card 10: the question is garbled.

**The joke-answer check on v5** (out of sample; `scripts/distractor-eval.ts bench/distractor-review-v5.json`):

| | Precision | Recall |
|---|---|---|
| v2 (in-sample) | 1.00 (20 of 20) | 0.21 (20 of 96) |
| v3 | 1.00 (4 of 4) | 0.05 (4 of 74) |
| v4 | 1.00 (1 of 1) | 0.01 (1 of 72) |
| v5 | 0.67 (2 of 3) | 0.03 (2 of 77) |

Its first false alarm: y4-states-of-matter-3 card 3, "It turns into solid ice" for "What happens to water during evaporation?". The "turns to ice" marker fires because the question has no cold word, but this is a real (wrong) state change a pupil might pick. The markers are tuned to v2's phrasing; out of sample they catch almost nothing.

**Why "no lesson warnings" fell from 48 (v4) to 43 (v5).** Compared deck by deck (`results-v4.json` against `results.json`):

- **6 decks clean in v4 now have a warning:**
  - "restates a flash card" on y3-plants-4, y3-rocks-3, y4-animals-1, y4-electricity-1 and y5-animals-1;
  - "one answer inside another" on y4-electricity-4 ("Open" and "Half open").
- **1 deck newly clean:** y5-materials-5 (no file in v4).
- **1 deck newly valid but warned:** y5-earth-space-3 (a joke-answer warning).
- Net: 48 − 6 + 1 = 43.
- Warnings in total: v4 had restates-flash 5 and joke-answer 1; v5 has restates-flash 8, joke-answer 3, two-answers 1 (y3-light-3) and answer-inside-answer 1.

So the drop is mostly quiz questions that repeat a flash card's wording. That is a mild warning (the lesson still works), not a broken deck. The only invalid deck is y4-electricity-2, invalid since v2 and not re-recorded.

**Per deck** (absurd of wrong answers):

| Deck | v2 | v3 | v4 | v5 |
|---|---|---|---|---|
| y3-animals-1 | 1 of 10 | 3 of 8 | 3 of 10 | 1 of 10 |
| y3-animals-2 | 6 of 10 | 0 of 10 | 4 of 10 | 0 of 10 |
| y3-forces-magnets-2 | 2 of 10 | 0 of 10 | 1 of 10 | 0 of 10 |
| y3-forces-magnets-6 | 2 of 10 | 0 of 10 | 0 of 9 | 0 of 10 |
| y3-light-1 | 3 of 10 | 5 of 10 | 4 of 10 | 4 of 10 |
| y3-light-2 | 2 of 10 | 2 of 10 | 1 of 10 | 2 of 10 |
| y3-light-3 | 4 of 10 | 3 of 10 | 8 of 10 | 4 of 9 |
| y3-light-4 | 2 of 10 | 2 of 10 | 2 of 10 | 1 of 10 |
| y3-light-5 | 1 of 8 | 0 of 10 | 1 of 10 | 0 of 10 |
| y3-plants-4 | 1 of 10 | 1 of 10 | 0 of 10 | 1 of 10 |
| y3-rocks-2 | 2 of 10 | 1 of 10 | 3 of 10 | 0 of 10 |
| y3-rocks-3 | 4 of 12 | 0 of 10 | 2 of 10 | 6 of 10 |
| y4-animals-1 | 1 of 10 | 0 of 10 | 1 of 10 | 1 of 10 |
| y4-animals-3 | 1 of 10 | 2 of 10 | 1 of 10 | 2 of 10 |
| y4-electricity-1 | 6 of 10 | 5 of 10 | 8 of 10 | 8 of 10 |
| y4-electricity-4 | 1 of 10 | 1 of 10 | 1 of 10 | 1 of 10 |
| y4-electricity-5 | 2 of 10 | 3 of 10 | 1 of 10 | 1 of 10 |
| y4-living-things-1 | 3 of 10 | 4 of 10 | 2 of 10 | 4 of 10 |
| y4-living-things-2 | 4 of 10 | 4 of 10 | 1 of 10 | 6 of 10 |
| y4-living-things-3 | 7 of 10 | 6 of 10 | 5 of 10 | 6 of 10 |
| y4-sound-1 | 3 of 10 | 5 of 9 | 3 of 10 | 4 of 10 |
| y4-sound-2 | 8 of 10 | 5 of 10 | 4 of 10 | 2 of 10 |
| y4-states-of-matter-3 | 2 of 10 | 2 of 10 | 0 of 9 | 3 of 10 |
| y5-animals-1 | 2 of 10 | 3 of 10 | 2 of 10 | 3 of 10 |
| y5-earth-space-2 | 1 of 10 | 0 of 10 | 2 of 10 | 2 of 10 |
| y5-earth-space-3 | 7 of 10 | 4 of 10 | no file (failed validation) | 5 of 10 |
| y5-forces-1 | 3 of 9 | 2 of 10 | 0 of 9 | 1 of 10 |
| y5-forces-3 | 1 of 10 | 2 of 10 | 3 of 10 | 1 of 8 |
| y5-living-things-2 | 2 of 10 | 3 of 10 | 2 of 10 | 1 of 10 |
| y5-materials-2 | 2 of 10 | 0 of 9 | 0 of 10 | 2 of 13 |
| y5-materials-3 | 1 of 10 | 1 of 10 | 0 of 10 | 0 of 10 |
| y5-materials-4 | 5 of 10 | 4 of 10 | 5 of 10 | 4 of 10 |
| y5-materials-5 | 1 of 10 | 1 of 10 | no file (failed validation) | 1 of 10 |
| y5-materials-6 | 3 of 10 | 0 of 10 | 2 of 10 | 0 of 10 |
