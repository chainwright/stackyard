# Class Results (no server): Design

## Overview

Two halves meet only through a short string the pupil reads off the screen.

```
pupil laptop (class file or living file, Play)          teacher laptop (living file, Teacher tab)
  src/player/runtime.ts   records the first answer        src/living/classResults.ts  "Class results" panel
  src/player/renderer.ts  end card: code + initials  ──▶   src/shared/classResults.ts  parse, de-duplicate, tally
                     \                                     /
                      src/shared/resultsCode.ts  (encode / decode / fingerprint / check)
```

`src/shared/resultsCode.ts` is the only place the format is defined. It is in
the player bundle (so both the class file and the living file show the code)
and the living bundle (so the panel decodes with the same code). The parsing
and tallying in `src/shared/classResults.ts` and the panel go in the living
bundle only. The class file stays free of them, and of any results.

No network, no storage API, no server: the teacher's file never sees the
pupils' files. The code is the only channel, and it is typed by a person.

---

## 1. The code format

### 1.1 Alphabet: 31 characters, no look-alikes

```
23456789ABCDEFGHJKMNPQRSTUVWXYZ      (value 0 … 30, in this order)
```

- **What is left out.** The digits 2–9 and the letters A–Z, without 0, O, 1, I
  and L. These are the look-alikes a 9-year-old (or a teacher at the back of
  the room) confuses, and the ones the user story names.
- **Why 31.** There are exactly 31 such characters, and 31 is prime. A prime
  alphabet gives a simple weighted check character that provably catches
  every single substitution and every adjacent swap (§1.4). Crockford's
  32-symbol base needs a 37-symbol check alphabet; Luhn mod N misses some
  swaps.
- **The other pairs** (B/8, S/5, Z/2, U/V) stay in the alphabet. The code is
  shown in Stackyard Reading, the renamed Atkinson Hyperlegible subset, which
  was designed for low-vision readers to keep exactly these pairs apart.
- **Input.** Case-insensitive, and dashes, spaces, dots and underscores inside
  a code are ignored. A character that is not in the alphabet is reported by
  name (§3), never silently mapped. Mapping O to 0 is meaningless here,
  because neither is used.

### 1.2 Layout

```
FFF  TTT  R…R  [III]  C
 │    │    │     │    └ check character (1)
 │    │    │     └ initials (3, only when the pupil typed some)
 │    │    └ results (K characters)
 │    └ play tag (3 random characters)
 └ lesson fingerprint (3)
```

Every field has a fixed length, and the decoder knows n (its own lesson's quiz
count). So the length alone says whether initials are present: L₀ = K + 7
without, L₁ = K + 10 with. The two lengths differ by 3, so they can never be
confused.

**Results field.**
- Each quiz card in deck order has a trit tᵢ: 0 = not reached, 1 = right,
  2 = wrong.
- The number R = Σ tᵢ·3ⁱ is written in base 31, most significant digit first,
  padded to K digits.
- K is the smallest K with 31ᴷ ≥ 3ⁿ, that is K = ⌈n·log₃₁3⌉ = ⌈0.3199·n⌉.
- The arithmetic is on a little-endian digit array (multiply-add by a small
  number, divide-modulo by a small number). It is not `BigInt`: `BigInt`
  arrived in Safari 14 (2020), and the player must run in 2018 browsers.
- Decoding also rejects R ≥ 3ⁿ. That cannot happen with one typo, which the
  check catches, but it gives a second, free check.

**Lengths** (the table the user story asks for):

| Quiz cards | K | Without initials | With initials | Shown as (no initials) |
|---|---|---|---|---|
| 5 | 2 | 9 | 12 | `ABCD-EFGH-J` |
| 10 | 4 | 11 | 14 | `ABCD-EFGH-JKM` |
| 20 | 7 | 14 | 17 | `ABCD-EFGH-JKMN-PQ` |

(1 quiz card: 8. The bench default, 5 quiz cards, gives 9.)

### 1.3 Fingerprint: which lesson

- **Canonical text.** `"stackyard-results-1"`, then for each quiz card in
  deck order a line `JSON.stringify([card.id, question, answers])`.
  - The question is the first text element.
  - The answers are `quizAnswerButtons(card)` in element order, each written
    as `(right ? "+" : "-") + label`.
  - JSON, not tab-joined text, so a label that contains a tab or a newline
    cannot collide with another (spec review P2).
- **Hash.** FNV-1a (32-bit, `Math.imul`), taken mod 31³ = 29,791, written as
  three characters.
- **In it:** card ids, questions, answer labels, answer order and which answer
  is right. Any of these changing means the class's codes would tally against
  the wrong question, so a code from an edited lesson is rejected.
- **Not in it:** positions (a tile dragged 24 px), pictures, story and flash
  cards, the theme and the title. None of these changes what a result means.
  The format tag `stackyard-results-1` is part of the hash. A future format
  changes the tag, so old codes then read as "different lesson", never as
  wrong numbers.
- **Collision.** A code from another lesson with the same number of quiz cards
  (the same length) is wrongly accepted with probability 1 in 29,791 (0.003 %)
  per code. A different quiz count is caught by the length.
- **Why explicit and not folded into the check character.** Folding would save
  three characters. But a code from another lesson would then look exactly
  like a typo. The user story wants two different messages ("one letter looks
  wrong" against "from a different lesson"), and only an explicit fingerprint
  can tell them apart.

### 1.4 Check character: proof

The positions run p = 1…L, the check character included. Weights are
w_p = ((p − 1) mod 30) + 1, so every weight is in 1…30 and never 0 mod 31.
The check value c is chosen so that

    Σ w_p · v_p ≡ 0  (mod 31)

with c = −(Σ_{p<L} w_p v_p) · w_L⁻¹ mod 31. w_L is invertible because 31 is
prime.

- **Single substitution** v → v′ at position p: the sum changes by
  w_p(v′ − v). Both factors are non-zero mod 31 and 31 is prime, so the
  product is non-zero, and the sum is no longer ≡ 0. **All are caught.**
- **Adjacent transposition** of a ≠ b at positions p, p+1: the sum changes by
  (w_p − w_{p+1})(b − a). The weight difference is −1, or +29 at the step from
  weight 30 back to weight 1 (positions 30 and 31, 60 and 61, …). Neither is
  0 mod 31. **All are caught**, including a swap with the check character.
- **Two or more errors** slip through with probability about 1 in 31, and then
  they must also land on a valid fingerprint and an R < 3ⁿ. This residual risk
  is stated, not hidden.

The tests check the single-error and swap cases exhaustively: every position,
every substitute character and every neighbouring swap, on random codes, as
fast-check properties (§7).

### 1.5 Play tag: why two pupils never merge

The user story says "same code twice = one pupil". Without a tag, that is
wrong for a class. Every pupil who gets all five right, with no initials,
would produce the **identical** code, and de-duplication would count eight
pupils as one.

So each play-through draws three random characters (31³ = 29,791 values) when
the pupil reaches the end card:
- from `crypto.getRandomValues` when it exists (it does in every 2018
  browser);
- otherwise from `Math.random`. It is not a secret, only a separator.

The chance that two of k pupils with identical answers and no initials draw
the same tag is about k(k−1)/(2·29,791):

| Identical pupils | Chance of a collision |
|---|---|
| 8 | 0.09 % |
| 24 (the whole class) | 0.9 % |

Even then the collision is visible: the panel lists "Same code as one above —
counted once" and shows 23 pupils where she typed 24, and initials remove it
entirely. The tag stays fixed while the pupil types initials, and a new one is
drawn on Play Again.

### 1.6 Initials

- Optional, 1–3 letters A–Z.
- **Folding.** The input is folded with `normalize("NFD")`, so marks are
  removed and Ó becomes O. It is then upper-cased and anything else is
  dropped.
- **Encoding.** The initials go into three alphabet characters as a bijective
  base-26 number, J = 1 … 18,278 (A = 1, Z = 26, AA = 27, …, ZZZ = 18,278).
  18,278 < 31³, so three characters always suffice. J = 0, or J > 18,278, is
  rejected as a typo. Initials are not written as plain letters, because I, L
  and O, common in initials, are not in the alphabet.

---

## 2. Recording results in the player

- **Where results are kept.** `RuntimeState` gains
  `answers: Record<cardId, boolean>`, which records the **first** answer per
  quiz card. `createRuntime` and `resetRuntime` (Play Again) start it empty.
- **The play tag.** `RuntimeState` also gains `playTag`: three values drawn
  in `createRuntime` and again in `resetRuntime`, never while rendering. So a
  re-render (a resize, a rescale) never changes the code (spec review P1-6).
- **What counts as an answer.** One shared helper, `quizAnswerButtons(card)`,
  is used by the renderer's tile rule, the fingerprint and recording: a button
  on a quiz card with at least one action. *Right* means it has a `score`
  action with delta > 0.
- **Recording.** `handleButtonClick` already knows the tile is an answer
  tile and whether it is right (`hasPositiveScore`). It records the answer
  there, keyed by `state.currentCardId`, only if that card has no answer yet.
  Every tile click counts, whatever the tile's actions. Story buttons and
  Next Card are not answer tiles, so they never record.
- **The vector.** `resultsOf(stack, answers)` maps each quiz card in deck
  order to *right*, *wrong* or *not reached*. *Not reached* is "no recorded
  answer". The runtime has no other way to know that a card was skipped,
  because a quiz card cannot be left without answering it.

**Why the first answer and not the score.** A backward story branch can
revisit a quiz card, and the `score` action is additive, so `score` can count
one card twice. The first answer is the honest "did they know it". The panel's
per-pupil score is the number of first answers that were right. The end
card's "Score N of M" is unchanged; for any deck without loops the two are
equal.

**Why deck order.** "Play order" is not one order once a lesson branches. Deck
order is stable, it is the "Card N of M" order and the order of the Teacher
tab's card list, and Q4 in the table is the fourth quiz card in her list. A
skipped card is still a slot, so it reads *not reached*.

### End card

When the lesson has at least one quiz card, the end card adds a compact block
under the stamps, before Play Again:

- "Your results code" in 20 px meta text. Under it, the grouped code in
  Stackyard Reading 700, 32 px, ink on paper (never stamp red: it is not an
  earned stamp).
  - The visual code is `aria-hidden`. A visually hidden twin spells it out
    ("A B C D, E F G H, J"), so a screen reader reads letters, not a word.
  - `data-testid="results-code"`.
- A labelled text field, "Your initials (only if your teacher asks)":
  - the label and the input are 20 px, so they are at least 18 px at the
    0.9 card scale;
  - `maxlength=3`, `autocomplete=off`, `spellcheck=false`, `autocapitalize`
    set to characters, 44 px tall;
  - on `input`, the value is replaced by its folded form (so "A.B" leaves
    room for a third letter), and the code is re-encoded with the same tag;
  - the new code is announced in the page's live region, debounced by
    700 ms, so screen-reader users are not interrupted on every key;
  - typing in the field never triggers Play Again or a card change, and a
    DOM test checks it;
  - `data-testid="results-initials"`.
- The scan mode is untouched. Its choices are tiles, the flash card and
  buttons, and a text field is not one of them. Initials are optional, so a
  switch user loses nothing. The S key is already ignored while typing.
- **Space.** The 600 px card must still fit. With a code shown, the end card
  takes the class `sy-end-has-code`:
  - gap 12 px;
  - score 44 px;
  - stamp slots 48 px, so 20 questions fit in two rows; above 20 questions,
    32 px slots.

  This is checked against the 18 px floor (nothing smaller than 18 px) by the
  existing text-fit tests.

---

## 3. Reading codes (src/shared/classResults.ts)

`decodeCode(text, lesson)` returns `{ ok: true, results, initials, tag, code }`
or `{ ok: false, reason }`. The checks run in this order, so a typo is never
called "a different lesson":

1. Normalise: upper-case, and remove `- . _` and whitespace.
2. Unknown character → "This code has a letter or number codes never use
   (0, O, 1, I or L). Check it against the pupil's screen."
3. Length is neither L₀ nor L₁ → "This code is the wrong length for this
   lesson. Check it, or it may be from a different lesson."
4. Check sum ≢ 0 → "Check the code; one letter looks wrong."
5. Fingerprint ≠ this lesson's → "This code is from a different lesson, or
   from before its questions changed. Check the pupil played this file." (Or
   the edited-lesson message in §4.)
6. R ≥ 3ⁿ, or initials out of range → "Check the code; one letter looks
   wrong."

The messages follow `audience.md`: say what happened, say what to do next,
and no codes or jargon.

### Pasting many: `readCodes(text, lesson)`

(Revised after the spec review, P0-1. The first draft cut runs of four-letter
groups by length rules, and that mis-split mixed lengths: for example a
12-character code, then a 9, then a 12, with spaces.)

- **Lines.** Newlines, commas and semicolons always separate codes.
- **Within a line, the line is read by length and check, not by guessing at
  spaces.** Let S be the line with every separator (spaces, `- . _`)
  removed.
  - A dynamic programme finds the partition of S into pieces of length L₀ or
    L₁ with the **most pieces that decode**. Any partition with every piece
    decoding is taken.
  - Two all-good partitions of one line would need two independent check and
    fingerprint matches. The first one found is kept.
  - This reads one code, several codes separated by spaces, a code typed with
    spaces instead of dashes, `ABCD-EFGH J`, and any mix of them.
- **Fallback.** If no partition decodes completely, the line is read token by
  token as typed:
  - whitespace splits tokens;
  - a run of tokens each shorter than L₀ is joined, because it is one code
    with a typo in it;
  - each result is reported on its own, so a good code next to a bad one
    still counts.
- A fast-check property joins random valid codes, of mixed initials and
  lengths, with random separators. Every code comes back.

### Number words (audience.md)

- Counts in **sentences** spell out one to ten ("Two codes need checking.",
  "Clear all three codes?", "Saved a copy with four results codes").
- Counts in **table cells, Q labels and "missed by W of P"** are data and stay
  digits. "Q4 missed by 9 of 24" is the user story's own wording.
- A helper `countWords(n)` does this. A test checks every sentence the panel
  builds.

### De-duplication and tally: `tally(lesson, codes)`

- **De-duplication.** By normalised code, the first one kept. Same code =
  same pupil; the play tag (§1.5) makes that true. A repeat is not counted,
  and is listed as:
  - "Same code as one above — counted once." (repeated within one paste);
  - "Already added — counted once." (added in an earlier paste).
- **Per question.** right, wrong and not-reached counts, which add up to P,
  the number of pupils counted.
- **Per pupil.** Their results, initials (when given) and score (the number
  right).
- **Median.** The median of the P scores, the mean of the middle two for an
  even P (so it can be 3.5). It is shown as "Middle score (median)", because
  "median" alone is jargon for a teacher. P = 0 shows "No codes yet" and no
  median.
- **Revisit.** Every question with answered = right + wrong > 0 and
  3 · wrong ≥ answered: a third or more of those who answered got it wrong.
  They are sorted by wrong / answered, highest first, compared by
  cross-multiplication so ties are exact, then by Q order.
  - **Why a third.** It is a simple, explainable line, and with 24 pupils it
    flags a question 8 got wrong. It counts only those who answered, so a
    question most pupils never reached is not flagged on two wrong answers.
- **Plain text.** `resultsText(tally, title)` gives the copyable version: a
  title line, "P pupils · middle score (median) M of n", one line per
  question, "Revisit: …", and the pupil lines. A pupil is named by initials
  when the code carries them, else "Pupil N" in the order added. The pupil's
  code is never printed: it is a key, not a name, but nothing needs it.

The tally is a pure function, so the aggregation property (§7) can recompute
it from the per-pupil vectors.

---

## 4. The "Class results" panel (src/living/classResults.ts)

- **How it opens.** A new top-bar button, **"Class Results"**, in the Teacher
  overlay, between Play and Save a Copy.
  - It hides the card editor (`display: none`, so edits and undo history are
    kept) and shows the panel.
  - The button becomes **"Edit Cards"** to go back.
  - Escape still returns to Play, as today.
- **Plain DOM**, like the rest of the living chrome.

```
h2  Class results
p   Type or paste the codes from your pupils' last card: one per line, or with
    spaces between them. Nothing leaves this laptop.
label "Results codes" + textarea                [Add Codes] [Clear Codes]
p (role=status)  "24 pupils counted. 2 codes need checking."
ul  bad codes: "ABCD-EFGH-K — Check the code; one letter looks wrong."
p   "Median score 3.5 of 5"
table (caption "Each question") Question | Right | Wrong | Did not reach
p   "Q4 missed by 9 of 24" … one per question with any wrong answer
h3  Questions to revisit   → ol, or "No question was missed by a third or more of the pupils who answered it."
table (caption "Each pupil") Pupil | Score | Q1 … Qn (✓ / ✗ / –, with sr-only words)
[Copy as Text] [Print Results]
```

- **Add Codes.** It parses and decodes, and adds the good codes to the list.
  It leaves only the bad lines in the text box, so she can fix and add them
  again.
- **Clear Codes.** It asks "Clear all N codes?" (`confirm`), then empties the
  list.
- **Copy as Text.**
  - It tries `navigator.clipboard.writeText`. `file:` counts as a secure
    context in Chrome, Edge and Firefox.
  - Otherwise it selects a hidden read-only text area and calls
    `document.execCommand("copy")`.
  - If both fail, a toast says to select the text and copy it, and the text
    area is shown.
- **Print Results.** `window.print()`, with an `@media print` block that hides
  everything except the panel.
- **Which lesson the panel reads against:** the stack the file **opened**
  with, not the in-session edits. The class played the file as it was handed
  out, and Q4 must be the Q4 they saw.
  - (Revised after the spec review, P0-2.) The one case this misses: she
    edits the questions here and then lets pupils play this same open page.
    Their codes then match the *edited* lesson. Such a code is not tallied
    against the old questions. It is rejected with its own message: "This
    code matches the questions as you've changed them. Save a Copy, open the
    copy and add the code there."
  - Mixing the two lessons in one table would put two different questions in
    one row, so the panel never does it.
- **Focus.**
  - Opening the panel moves focus to its heading (`tabindex=-1`).
  - Edit Cards moves focus back to the toggle.
  - Add Codes moves focus to the status line, so the result is read out.
- **The pupil table** sits in a wrapper with `overflow-x: auto`,
  `tabindex="0"`, `role="region"` and `aria-label="Each pupil"`. A wide
  20-question table can then scroll by keyboard without tripping axe's
  `scrollable-region-focusable`.
- **Design system.**
  - Ink on paper, and every text 18 px or larger.
  - The buttons are `sy-living-btn` (44 px). No stamp red: results are not
    earned stamps.
  - The tables use real `<th scope>`, ✓/✗/– are `aria-hidden` with
    visually hidden words, and the focus ring is the design-system ink ring.

---

## 5. What is stored, and where (decision)

**The decision.**
- **In the page only, until she saves.** Codes live in the living app's
  memory: they survive switching between Edit Cards, Class Results and Play
  in one sitting, but not closing the file.
- **Save a Copy keeps them.** The accepted, normalised codes (strings only,
  nothing decoded) go into the copy in
  `<script id="class-results" type="application/json">["…","…"]</script>`
  inside `<head>`. On opening, the panel reads that block and decodes it
  again against the copy's own lesson.
- **No codes, no block.** A file with no codes never gets the block, so
  existing files, the "three saves are byte-identical" gate (TASK-26a) and
  the floppy budget are unchanged.
- **The block pattern is strict** (found in implementation by
  check:living-file). The living bundle contains the opening tag as text
  (the code that writes it). A loose `<script id="class-results" …>…</script>`
  pattern therefore matched *inside the runtime* and cut it out of every
  saved copy. The pattern now only matches a JSON array with no `<`, which
  the runtime's own text never is.
  - A test runs on the real bundle.
  - A fifth mutant puts the loose pattern back.
  - check-class-results saves and reopens a copy in Chrome.
- **The fingerprint guard.** If the quiz content now differs from the file as
  it opened, the copy is saved without the codes, because they would all read
  as "from a different lesson". The message names the count: "Saved a copy:
  … The questions changed, so the 24 class results codes were not kept in
  it." The codes stay in the open page, so nothing typed is lost; she can
  copy the table as text first.
- **The class file never carries results.** `exportStack` builds it from the
  stack only, on the server. It has no living runtime and no block.

**Why keep them at all.** The user story wants her to "come back to it". She
types 24 codes once; losing them because the laptop slept is a real cost. A
copy she chooses to save is the only storage that needs no account, no server
and no browser storage. Browser storage is unreliable for `file:` pages and
would hide data outside the file she can see and delete.

**The risk, and why it is acceptable.**
- If she hands that saved copy to the class, it carries the codes. A pupil
  who opens Teacher (behind the "Are you the teacher?" guard, which is not
  security) could see letters, right/wrong marks and initials.
- The data is small by design: no names, at most three optional initials.
- The toast says "Saved a copy with 24 results codes". The README says to use
  "Export for class" for the pupils' file, which never has results, and that
  Clear Codes before saving removes them.

**Why the codes are not inside the stack JSON.** The stack is the single
source of truth for cards (stack-format.md). Results are not card content, and
putting them in the stack would make every Maker export and validator
invariant aware of them.

---

## 6. Privacy statement (README)

- No personal data: no names, no accounts. At most three optional initials,
  which the pupil chooses to type.
- No network: the code is read by a person and typed by a person.
- The results exist only on the pupil's screen until the lesson closes, then
  in the teacher's open file and, if she saves a copy, in that copy. Nowhere
  else.
- It is not analytics or tracking (product.md rules those out). Nothing is
  collected automatically; the teacher types what the class shows her.

---

## 7. Testing strategy

| What | How | File |
|---|---|---|
| Round trip | fast-check: a random lesson shape (1–40 quiz cards among other cards), any result vector, optional initials, any tag → `encode` → `decode` gives the same thing | `tests/results-code.property.test.ts` |
| Check character | For random codes: every position × all 30 other characters → "one letter looks wrong" (or the length/unknown-character message, never ok). Every adjacent pair of different characters swapped → not ok. "Exhaustive" means every position and every substitute, on sampled codes | same |
| Check-character wrap | Codes of 1–40 quiz cards are at most 23 characters, so the weight wrap (30 → 1) is never reached. A unit test runs every substitution and swap on raw strings of 62 and more characters, through the pure `checkChar` and `checkOk` | same |
| No `BigInt` | A source test: `resultsCode.ts` contains no `BigInt` and no `n` literal suffix (the 2018-browser rule) | same |
| Fingerprint | A random edit to any quiz card's id / question / label / right answer → "different lesson"; a moved element or an edited story card → same fingerprint | same |
| Lengths | The 5 / 10 / 20 table above equals `codeLength(n, initials)` | same |
| Parse | One per line, space-separated, spaces inside codes, mixed; duplicates counted once; bad codes kept with reasons | `tests/class-results.test.ts` |
| Aggregation | fast-check: random pupils → codes (plus random duplicates) → `tally` equals counts recomputed from the vectors; median; revisit rule | same |
| End card (DOM) | Code shown only with quiz cards; first answer wins; not reached on a skipped card; initials change the code but not the tag; Play Again clears and draws a new tag; labels and testids | `tests/results-endcard.dom.test.ts` |
| Panel (DOM) | Class Results opens and closes; Add Codes; the table numbers; bad codes listed; Copy as Text; Clear; initials column only when given | `tests/class-results-panel.dom.test.ts` |
| Storage | Save a Copy keeps codes in `#class-results`; reopening reads them; no codes → no block; changed quiz → not kept; class export has none | same |
| Real browser | `scripts/check-class-results.ts` (in `pre-submit`). The same mechanism as check:living-file: a plain-JS **driver script is injected** into a copy of the committed Vikings sample, and Chrome runs it headless with `--dump-dom` and a virtual-time budget, the network blocked, with no debugging port. The driver clicks, types and writes a verdict into the DOM, and Node reads it. Three pupil runs (all right / all wrong / alternate, the last with initials) each read their code off the end card. A fourth, teacher run pastes the three codes plus a duplicate and a bad one, and reads the table. Node checks every number against the answer patterns and against its own decode of the codes | gate |
| Accessibility | check:a11y adds "Sample vikings: end card with code" and "Sample vikings: Class results" (with codes) pages | `scripts/check-a11y.ts` |

**Mutants** (`scripts/mutation-check.ts`), each must be killed:
1. The check character is ignored when decoding (checksum off).
2. The fingerprint is not compared (fingerprint ignored).
3. *Not reached* is encoded as *wrong*.
4. Duplicate codes are counted twice.

---

## 9. Spec review (before code)

A read-only review of this spec ran before any code was written. What changed
because of it:
- **P0-1.** The space-splitting heuristic mis-split mixed lengths. It is
  replaced by the length-and-check partition (§3).
- **P0-2.** Codes from the lesson as edited in this session now get their own
  message (§4).
- **P1.**
  - One answer-button helper (§2).
  - The play tag is held in the runtime (§2).
  - A weight-wrap test (§7).
  - Only bad tokens stay in the box, and repeats from an earlier paste get
    their own message (§3).
  - Number words (§3).
  - "Middle score (median)" (§3).
  - A focusable scroll region for the pupil table (§4).
  - The gate mechanism is named (§7).
  - Sample regeneration is in the tasks.
  - Initials field details: size, folding and a debounced announcement (§2).
- **P2.**
  - JSON canonical text (§1.3).
  - Message wording (§3).
  - "Pupil N" (§3).
  - The P = 0 state, exact ties and the count in the save message (§5).
  - The not-analytics note (§6).
  - A no-`BigInt` test (§7).
  - The above-20 stamp size (§2).

## 8. Size and budgets

- **Player bundle.** About +2 KB raw (well under +1 KB gzipped), against a
  13.6 KB gzipped bundle and a 50 KB budget. The README figure is refreshed
  by `check:claims:fix`.
- **Living bundle.** The panel and the tally, about +6 KB raw. The water-cycle
  living export stayed inside the floppy budget of the time (208,237 B;
  TASK-35b later moved the claim to six with a margin), and the size test
  proves it.
- **The three samples** are regenerated (`npm run samples`), because the
  player and the living bundle change.
