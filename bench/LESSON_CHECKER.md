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
