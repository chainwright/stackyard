# Curriculum bench: results

**This measures the generator against curriculum objectives; it is not a classroom study and no teacher or pupil was involved.**

Source: [National curriculum in England: science programmes of study](https://www.gov.uk/government/publications/national-curriculum-in-england-science-programmes-of-study/national-curriculum-in-england-science-programmes-of-study), Years 3–5, every statutory "Pupils should be taught to" requirement. Open Government Licence v3.0, © Crown copyright 2015. Contains public sector information licensed under the Open Government Licence v3.0.

Sentence for every objective: "A 5-question quiz, two flash cards and a short choose-your-path story for pupils aged 8 to 10 on this objective: <outcome>."

## v1 (before the TASK-33 prompt fixes)

Kept in `bench/results-v1.json`; model: claude-haiku-5-5 (thinking off). What went wrong and why: [`DIAGNOSIS.md`](DIAGNOSIS.md).

| Measure | Result |
|---|---|
| Objectives recorded | 55 of 55 |
| Valid lesson file on the first try (no retry, no fallback) | 50 of 55 |
| Passed our automatic lesson check with no warnings | 36 of 55 |
| Asked-for counts (5 quiz, 2 flash) | 25 of 55 |
| Every card reachable | 50 of 55 |
| End score reachable, nothing stuck | 50 of 55 |
| Reading level (median Flesch-Kincaid grade) | 2.1 |
| File size | 184 KB to 188 KB |
| Time to the first card, p50 / p90 | 1.4 s / 2.0 s |
| Time to done, p50 / p90 | 8.0 s / 8.9 s |

## Current run

Written by `npm run bench` from the recorded model text in `bench/cache/`. Model: claude-haiku-5-5 (thinking off).

| Measure | Result |
|---|---|
| Objectives recorded | 55 of 55 |
| Valid lesson file on the first try (no retry, no fallback) | 54 of 55 |
| Passed our automatic lesson check with no warnings | 48 of 55 |
| Asked-for counts (5 quiz, 2 flash) | 47 of 55 |
| Every card reachable | 54 of 55 |
| End score reachable, nothing stuck | 54 of 55 |
| Reading level (median Flesch-Kincaid grade) | 1.9 |
| File size | 184 KB to 187 KB |
| Time to the first card, p50 / p90 | 1.4 s / 2.0 s |
| Time to done, p50 / p90 | 8.3 s / 9.1 s |

Times are as recorded by `bench:record` (in process, one sentence each, up to three at once); the replay itself makes no network request.

The automatic lesson check is mechanical (structure, counts, answer overlap) and does not verify facts: a wrong answer key passes it. A read-only AI review of the keys in a sample of decks is in [`LESSON_CHECKER.md`](LESSON_CHECKER.md).

| Objective | Year | Outcome | First try | Lesson check | Quiz / flash | Reachable | FK grade | Answers per quiz | Pictures | Size | First card | Done | File |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| y3-plants-1 | 3 | identify and describe the functions of different parts of flowering plants: roots, stem/trunk, leaves and flowers | yes | no warnings | 5 / 2 | yes | 0.8 | 3 3 3 3 3 | 2 | 187 KB | 1.4 s | 8.4 s | [open](files/y3-plants-1.html) |
| y3-plants-2 | 3 | explore the requirements of plants for life and growth (air, light, water, nutrients from soil, and room to grow) and how they vary from plant to plant | yes | no warnings | 5 / 2 | yes | 1 | 3 3 3 3 3 | 1 | 186 KB | 1.7 s | 7.6 s | [open](files/y3-plants-2.html) |
| y3-plants-3 | 3 | investigate the way in which water is transported within plants | yes | no warnings | 5 / 2 | yes | 1.6 | 3 3 3 3 3 | 1 | 186 KB | 2.0 s | 8.3 s | [open](files/y3-plants-3.html) |
| y3-plants-4 | 3 | explore the part that flowers play in the life cycle of flowering plants, including pollination, seed formation and seed dispersal | yes | no warnings | 5 / 2 | yes | 2.1 | 3 3 3 3 3 | 0 | 185 KB | 1.4 s | 8.3 s | [open](files/y3-plants-4.html) |
| y3-animals-1 | 3 | identify that animals, including humans, need the right types and amount of nutrition, and that they cannot make their own food; they get nutrition from what they eat | yes | no warnings | 5 / 2 | yes | 1.9 | 3 3 3 3 3 | 1 | 186 KB | 1.4 s | 8.4 s | [open](files/y3-animals-1.html) |
| y3-animals-2 | 3 | identify that humans and some other animals have skeletons and muscles for support, protection and movement | yes | no warnings | 5 / 1 | yes | 1.7 | 3 3 3 3 3 | 0 | 185 KB | 1.7 s | 7.7 s | [open](files/y3-animals-2.html) |
| y3-rocks-1 | 3 | compare and group together different kinds of rocks on the basis of their appearance and simple physical properties | yes | no warnings | 5 / 2 | yes | 1.8 | 3 3 3 3 3 | 0 | 186 KB | 1.6 s | 8.3 s | [open](files/y3-rocks-1.html) |
| y3-rocks-2 | 3 | describe in simple terms how fossils are formed when things that have lived are trapped within rock | yes | restates-flash | 5 / 2 | yes | 2.4 | 3 3 3 3 3 | 0 | 186 KB | 1.1 s | 8.6 s | [open](files/y3-rocks-2.html) |
| y3-rocks-3 | 3 | recognise that soils are made from rocks and organic matter | yes | no warnings | 5 / 2 | yes | 2.1 | 3 4 3 4 3 | 0 | 186 KB | 1.3 s | 8.7 s | [open](files/y3-rocks-3.html) |
| y3-light-1 | 3 | recognise that they need light in order to see things and that dark is the absence of light | yes | no warnings | 5 / 2 | yes | 0.8 | 3 3 3 3 3 | 1 | 186 KB | 1.6 s | 8.5 s | [open](files/y3-light-1.html) |
| y3-light-2 | 3 | notice that light is reflected from surfaces | yes | no warnings | 5 / 2 | yes | 2.2 | 3 3 3 3 3 | 0 | 185 KB | 1.4 s | 9.1 s | [open](files/y3-light-2.html) |
| y3-light-3 | 3 | recognise that light from the sun can be dangerous and that there are ways to protect their eyes | yes | no warnings | 5 / 2 | yes | 1.7 | 3 3 3 3 3 | 0 | 186 KB | 1.8 s | 8.7 s | [open](files/y3-light-3.html) |
| y3-light-4 | 3 | recognise that shadows are formed when the light from a light source is blocked by an opaque object | yes | no warnings | 5 / 1 | yes | 1.7 | 3 3 3 3 3 | 0 | 185 KB | 1.6 s | 8.2 s | [open](files/y3-light-4.html) |
| y3-light-5 | 3 | find patterns in the way that the size of shadows change | yes | no warnings | 4 / 2 | yes | 1.3 | 3 3 3 3 | 0 | 185 KB | 1.4 s | 7.6 s | [open](files/y3-light-5.html) |
| y3-forces-magnets-1 | 3 | compare how things move on different surfaces | yes | no warnings | 5 / 2 | yes | 2.3 | 3 3 3 3 3 | 0 | 185 KB | 1.3 s | 7.7 s | [open](files/y3-forces-magnets-1.html) |
| y3-forces-magnets-2 | 3 | notice that some forces need contact between 2 objects, but magnetic forces can act at a distance | yes | no warnings | 5 / 2 | yes | 1.7 | 3 3 3 3 3 | 0 | 186 KB | 2.1 s | 8.8 s | [open](files/y3-forces-magnets-2.html) |
| y3-forces-magnets-3 | 3 | observe how magnets attract or repel each other and attract some materials and not others | yes | no warnings | 5 / 2 | yes | 2.6 | 3 3 3 3 3 | 1 | 186 KB | 1.8 s | 8.1 s | [open](files/y3-forces-magnets-3.html) |
| y3-forces-magnets-4 | 3 | compare and group together a variety of everyday materials on the basis of whether they are attracted to a magnet, and identify some magnetic materials | yes | no warnings | 5 / 2 | yes | 3.7 | 4 4 4 3 4 | 1 | 187 KB | 1.4 s | 9.1 s | [open](files/y3-forces-magnets-4.html) |
| y3-forces-magnets-5 | 3 | describe magnets as having 2 poles | yes | no warnings | 5 / 2 | yes | 1.2 | 3 3 3 3 3 | 0 | 185 KB | 1.3 s | 8.0 s | [open](files/y3-forces-magnets-5.html) |
| y3-forces-magnets-6 | 3 | predict whether 2 magnets will attract or repel each other, depending on which poles are facing | yes | no warnings | 5 / 2 | yes | 1.8 | 3 3 3 3 3 | 0 | 186 KB | 1.3 s | 9.7 s | [open](files/y3-forces-magnets-6.html) |
| y4-living-things-1 | 4 | recognise that living things can be grouped in a variety of ways | yes | no warnings | 5 / 2 | yes | 1.2 | 3 3 3 3 3 | 0 | 185 KB | 1.3 s | 8.0 s | [open](files/y4-living-things-1.html) |
| y4-living-things-2 | 4 | explore and use classification keys to help group, identify and name a variety of living things in their local and wider environment | yes | no warnings | 5 / 2 | yes | 2 | 3 3 3 3 3 | 0 | 185 KB | 1.1 s | 7.9 s | [open](files/y4-living-things-2.html) |
| y4-living-things-3 | 4 | recognise that environments can change and that this can sometimes pose dangers to living things | yes | no warnings | 5 / 2 | yes | 2.8 | 3 3 3 3 3 | 0 | 186 KB | 2.0 s | 8.7 s | [open](files/y4-living-things-3.html) |
| y4-animals-1 | 4 | describe the simple functions of the basic parts of the digestive system in humans | yes | no warnings | 5 / 2 | yes | 3 | 3 3 3 3 3 | 0 | 185 KB | 1.6 s | 7.8 s | [open](files/y4-animals-1.html) |
| y4-animals-2 | 4 | identify the different types of teeth in humans and their simple functions | yes | no warnings | 5 / 2 | yes | 1.8 | 3 3 3 3 3 | 1 | 186 KB | 1.3 s | 7.5 s | [open](files/y4-animals-2.html) |
| y4-animals-3 | 4 | construct and interpret a variety of food chains, identifying producers, predators and prey | yes | restates-flash | 5 / 2 | yes | 2 | 3 3 3 3 3 | 0 | 185 KB | 1.4 s | 8.0 s | [open](files/y4-animals-3.html) |
| y4-states-of-matter-1 | 4 | compare and group materials together, according to whether they are solids, liquids or gases | yes | no warnings | 5 / 2 | yes | 1.1 | 3 3 3 3 3 | 1 | 186 KB | 1.4 s | 7.6 s | [open](files/y4-states-of-matter-1.html) |
| y4-states-of-matter-2 | 4 | observe that some materials change state when they are heated or cooled, and measure or research the temperature at which this happens in degrees Celsius (°C) | yes | no warnings | 5 / 2 | yes | 2.6 | 3 3 3 3 3 | 0 | 185 KB | 1.2 s | 7.2 s | [open](files/y4-states-of-matter-2.html) |
| y4-states-of-matter-3 | 4 | identify the part played by evaporation and condensation in the water cycle and associate the rate of evaporation with temperature | yes | restates-flash | 5 / 2 | yes | 3.9 | 3 3 3 3 3 | 0 | 186 KB | 1.3 s | 8.6 s | [open](files/y4-states-of-matter-3.html) |
| y4-sound-1 | 4 | identify how sounds are made, associating some of them with something vibrating | yes | no warnings | 5 / 2 | yes | 1.7 | 3 3 3 3 3 | 1 | 186 KB | 1.2 s | 8.0 s | [open](files/y4-sound-1.html) |
| y4-sound-2 | 4 | recognise that vibrations from sounds travel through a medium to the ear | yes | no warnings | 5 / 2 | yes | 1.6 | 3 3 3 3 3 | 0 | 185 KB | 1.3 s | 7.1 s | [open](files/y4-sound-2.html) |
| y4-sound-3 | 4 | find patterns between the pitch of a sound and features of the object that produced it | yes | no warnings | 5 / 2 | yes | 1.4 | 3 3 3 3 3 | 0 | 186 KB | 2.1 s | 8.9 s | [open](files/y4-sound-3.html) |
| y4-sound-4 | 4 | find patterns between the volume of a sound and the strength of the vibrations that produced it | yes | no warnings | 5 / 2 | yes | 2.9 | 3 3 3 3 3 | 1 | 186 KB | 1.2 s | 7.6 s | [open](files/y4-sound-4.html) |
| y4-sound-5 | 4 | recognise that sounds get fainter as the distance from the sound source increases | yes | no warnings | 5 / 2 | yes | 1.4 | 3 3 3 3 3 | 0 | 186 KB | 1.3 s | 9.4 s | [open](files/y4-sound-5.html) |
| y4-electricity-1 | 4 | identify common appliances that run on electricity | yes | restates-flash | 5 / 2 | yes | 2.9 | 3 3 3 3 3 | 1 | 186 KB | 1.2 s | 7.7 s | [open](files/y4-electricity-1.html) |
| y4-electricity-2 | 4 | construct a simple series electrical circuit, identifying and naming its basic parts, including cells, wires, bulbs, switches and buzzers | no (the streamed deck was not valid (the live app would retry or fall back)) | — | — / — | — | — | — | — | — | 1.4 s | 8.3 s | — |
| y4-electricity-3 | 4 | identify whether or not a lamp will light in a simple series circuit, based on whether or not the lamp is part of a complete loop with a battery | yes | restates-flash | 5 / 2 | yes | 1.2 | 3 3 3 3 3 | 1 | 186 KB | 1.6 s | 9.0 s | [open](files/y4-electricity-3.html) |
| y4-electricity-4 | 4 | recognise that a switch opens and closes a circuit and associate this with whether or not a lamp lights in a simple series circuit | yes | no warnings | 5 / 2 | yes | 0.9 | 3 3 3 3 3 | 0 | 186 KB | 1.5 s | 8.1 s | [open](files/y4-electricity-4.html) |
| y4-electricity-5 | 4 | recognise some common conductors and insulators, and associate metals with being good conductors | yes | no warnings | 5 / 2 | yes | 4.6 | 3 3 3 3 3 | 1 | 186 KB | 1.7 s | 7.4 s | [open](files/y4-electricity-5.html) |
| y5-living-things-1 | 5 | describe the differences in the life cycles of a mammal, an amphibian, an insect and a bird | yes | no warnings | 5 / 2 | yes | 2.3 | 3 3 3 3 3 | 0 | 186 KB | 2.0 s | 8.6 s | [open](files/y5-living-things-1.html) |
| y5-living-things-2 | 5 | describe the life process of reproduction in some plants and animals | yes | no warnings | 5 / 2 | yes | 2.2 | 3 3 3 3 3 | 1 | 186 KB | 1.3 s | 7.5 s | [open](files/y5-living-things-2.html) |
| y5-animals-1 | 5 | describe the changes as humans develop to old age | yes | no warnings | 5 / 2 | yes | 3 | 3 3 3 3 3 | 0 | 186 KB | 2.0 s | 8.5 s | [open](files/y5-animals-1.html) |
| y5-materials-1 | 5 | compare and group together everyday materials on the basis of their properties, including their hardness, solubility, transparency, conductivity (electrical and thermal), and response to magnets | yes | no warnings | 5 / 1 | yes | 5 | 3 3 3 3 3 | 0 | 185 KB | 1.6 s | 8.2 s | [open](files/y5-materials-1.html) |
| y5-materials-2 | 5 | know that some materials will dissolve in liquid to form a solution, and describe how to recover a substance from a solution | yes | no warnings | 5 / 2 | yes | 3.4 | 3 3 3 3 3 | 0 | 185 KB | 1.4 s | 8.5 s | [open](files/y5-materials-2.html) |
| y5-materials-3 | 5 | use knowledge of solids, liquids and gases to decide how mixtures might be separated, including through filtering, sieving and evaporating | yes | no warnings | 5 / 2 | yes | 3.8 | 3 3 3 3 3 | 1 | 186 KB | 1.4 s | 7.5 s | [open](files/y5-materials-3.html) |
| y5-materials-4 | 5 | give reasons, based on evidence from comparative and fair tests, for the particular uses of everyday materials, including metals, wood and plastic | yes | no warnings | 5 / 2 | yes | 2.4 | 3 3 3 3 3 | 0 | 185 KB | 1.6 s | 7.7 s | [open](files/y5-materials-4.html) |
| y5-materials-5 | 5 | demonstrate that dissolving, mixing and changes of state are reversible changes | yes | no warnings | 5 / 1 | yes | 4.4 | 3 3 3 3 3 | 0 | 185 KB | 2.0 s | 9.0 s | [open](files/y5-materials-5.html) |
| y5-materials-6 | 5 | explain that some changes result in the formation of new materials, and that this kind of change is not usually reversible, including changes associated with burning and the action of acid on bicarbonate of soda | yes | no warnings | 5 / 2 | yes | 3.9 | 3 3 3 3 3 | 0 | 186 KB | 2.6 s | 9.4 s | [open](files/y5-materials-6.html) |
| y5-earth-space-1 | 5 | describe the movement of the Earth and other planets relative to the sun in the solar system | yes | no warnings | 4 / 2 | yes | 2.2 | 3 3 3 3 | 0 | 184 KB | 1.3 s | 6.7 s | [open](files/y5-earth-space-1.html) |
| y5-earth-space-2 | 5 | describe the movement of the moon relative to the Earth | yes | no warnings | 5 / 2 | yes | 1.6 | 3 3 3 3 3 | 2 | 187 KB | 1.9 s | 9.9 s | [open](files/y5-earth-space-2.html) |
| y5-earth-space-3 | 5 | describe the sun, Earth and moon as approximately spherical bodies | yes | no warnings | 5 / 1 | yes | 0.7 | 3 3 3 3 3 | 3 | 187 KB | 1.8 s | 8.6 s | [open](files/y5-earth-space-3.html) |
| y5-earth-space-4 | 5 | use the idea of the Earth’s rotation to explain day and night and the apparent movement of the sun across the sky | yes | no warnings | 5 / 2 | yes | 0.9 | 3 3 3 3 3 | 1 | 186 KB | 1.9 s | 8.7 s | [open](files/y5-earth-space-4.html) |
| y5-forces-1 | 5 | explain that unsupported objects fall towards the Earth because of the force of gravity acting between the Earth and the falling object | yes | restates-flash | 5 / 2 | yes | 1.6 | 3 3 3 2 3 | 1 | 186 KB | 1.4 s | 8.0 s | [open](files/y5-forces-1.html) |
| y5-forces-2 | 5 | identify the effects of air resistance, water resistance and friction, that act between moving surfaces | yes | no warnings | 5 / 2 | yes | 3.1 | 3 3 3 3 3 | 1 | 186 KB | 1.8 s | 8.6 s | [open](files/y5-forces-2.html) |
| y5-forces-3 | 5 | recognise that some mechanisms including levers, pulleys and gears allow a smaller force to have a greater effect | yes | no warnings | 5 / 2 | yes | 1.6 | 3 3 3 3 3 | 1 | 186 KB | 1.9 s | 8.8 s | [open](files/y5-forces-3.html) |
