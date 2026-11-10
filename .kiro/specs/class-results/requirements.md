# Class Results (no server): Requirements

## Feature summary

Twenty-four pupils play the same lesson file on class laptops, with no network
and no accounts. At the end, each pupil's last card shows a short **results
code**. The teacher types or pastes the codes into the Teacher tab of **her**
copy of the same file. A "Class results" panel then shows, per question, how
many pupils got it right ("Q4 missed by 9 of 24"), the class median score and
which questions to revisit. Nothing leaves the laptop, and no names are
collected.

Source: `../CLONES_TEARDOWN_2026-11-09.md` §4 row 5 ("Class results without a
server", which closes GhostDeck's debrief gap and moves "What's next" into the
product). Notation: EARS (Ubiquitous / When / While / If … then / Where).

Terms:
- **Lesson**: one stack, as exported into a class file and a living file.
- **Quiz card**: a card with `kind === "quiz"`. Quiz cards are numbered Q1…Qn
  in deck order (`stack.cards` order), the order of "Card N of M".
- **Result**: for one quiz card in one play-through, one of *right*, *wrong*
  or *not reached*.
- **Living file**: the teacher's file, with a Teacher tab. **Class file**: the
  "Export for class" file, which can only be played.

---

## REQ-CR-01 — The code identifies the lesson

The system shall put a fingerprint of the lesson's quiz content in every
results code: each quiz card's id, question and answers, and which answer is
right, in deck order.

**Acceptance criteria**
- WHEN a code made by lesson A is read by lesson B, and the two differ in any
  quiz card's id, question, answer label, answer order or right answer, THEN
  the code shall be rejected with "This code is from a different lesson, or
  from before its questions changed."
- WHEN only non-quiz content changes (a story card, a flash card, a picture,
  element positions or the theme), THEN the fingerprint shall stay the same.
- The fingerprint shall be computed by one shared function, so the player and
  the Teacher tab can never disagree.

## REQ-CR-02 — The code carries one result per quiz card

The system shall encode, for every quiz card in deck order, whether the pupil
got it right, got it wrong or did not reach it. *Not reached* is distinct from
*wrong*.

**Acceptance criteria**
- WHEN a pupil answers a quiz card, THEN the **first** answer given on that
  card in this play-through is its result. Coming back to the card later does
  not change it.
- WHEN a pupil reaches the end card without answering a quiz card (a story
  branch skipped it), THEN that card's result is *not reached*.
- WHEN the pupil presses Play Again, THEN every result is cleared, and the
  next end card shows a new code.
- Round trip: for any lesson shape and any result vector, decoding the encoded
  code shall return exactly the same results, initials and tag.

## REQ-CR-03 — Short and typeable

The code shall be easy to read off the screen and type: by a pupil, by the
teacher or by a classroom assistant.

**Acceptance criteria**
- The alphabet shall not contain the look-alikes 0, O, 1, I or L. Input shall
  be case-insensitive, and dashes, spaces and dots inside a code shall be
  ignored.
- The code shall be shown in groups of four characters joined by dashes
  (`ABCD-EFGH-J`).
- The code shall end in a check character. IF any single character is changed
  to another character of the alphabet, or any two neighbouring different
  characters are swapped, THEN decoding shall fail with "Check the code; one
  letter looks wrong."
- IF a code contains a character that codes never use, THEN it shall be
  rejected with a message that names those characters.
- The design shall state the code length for lessons with 5, 10 and 20 quiz
  cards.
- WHILE a lesson has no quiz card, the end card shall show no code.

## REQ-CR-04 — Optional pupil initials

Where the pupil types initials on the end card, the code shall carry them.

**Acceptance criteria**
- The end card shall offer one optional field for initials, at most three
  letters A–Z. Accents are folded (Á becomes A) and anything else is dropped.
- WHEN the field is empty, THEN the code shall carry no initials, and its
  length is the shorter one.
- The Teacher tab shall show initials only for codes that carry them. No full
  names are asked for or stored anywhere.

## REQ-CR-05 — Pasting many codes

**Acceptance criteria**
- WHEN the teacher pastes several codes, one per line, separated by spaces or
  commas, or with spaces instead of dashes inside a code, THEN each code shall
  be read.
- WHEN the same code appears twice (in one paste or across pastes), THEN it
  shall count as one pupil. The repeat is listed as "Same code as one above —
  counted once." (repeated within one paste) or "Already added — counted
  once." (added in an earlier paste).
- IF a code is bad, THEN it shall be listed with the reason, the good ones
  shall be counted, and only the bad codes shall stay in the text box so she
  can fix them.
- Two pupils with the same answers and no initials shall still get different
  codes (with high probability, stated in the design), so de-duplication never
  merges two pupils silently.

## REQ-CR-06 — The class table

**Acceptance criteria**
- For each quiz card Q1…Qn, the panel shall show its question and how many
  pupils got it right, got it wrong and did not reach it. The three counts
  add up to the number of pupils counted.
- The panel shall show "Qk missed by W of P", where W is the number who got
  it wrong and P the number of pupils counted.
- The panel shall show the class median score, labelled "Middle score
  (median)" (each pupil's score is the number of first answers that were
  right), out of n.
- The panel shall list the questions to revisit: those that at least a third
  of the pupils who answered got wrong. They are ordered by the share wrong,
  then by question number.
- Aggregation property: the table's counts shall equal the counts recomputed
  from the per-pupil decoded results, for any set of pupils.

## REQ-CR-07 — Where the panel lives, offline

**Acceptance criteria**
- The "Class results" panel shall exist only in the living file's Teacher
  tab. The class file shows the code, but has no Teacher tab and no panel.
- The panel shall work with no network. It shall make no request, use no
  storage API and run under the samples' strict CSP.
- The panel shall offer "Copy as Text" (a plain-text table) and "Print
  Results" (prints only the panel).
- The panel's controls shall be labelled and usable by keyboard alone, with
  the design-system focus ring. check:a11y shall report 0 serious or critical
  violations on it and on an end card that shows a code.

## REQ-CR-08 — What is stored, and where

**Acceptance criteria**
- WHILE the teacher has not pressed Save a Copy, the codes shall exist only in
  the open page.
- WHEN she presses Save a Copy with codes added, and the quiz content is
  unchanged since the file opened, THEN the copy shall keep the accepted codes
  (codes only, nothing decoded) in its own data block, and reopening the copy
  shall show the same table.
- IF the quiz content has changed since the file opened, THEN the copy shall
  not keep the codes, and the message shall say so.
- A file saved with no codes shall have no results block, so three saves in a
  row stay byte-identical (TASK-26a).
- The class file ("Export for class") shall never carry results.

## REQ-CR-09 — Privacy, said plainly

**Acceptance criteria**
- The README shall have a "Class results (no server)" section. It says that
  no personal data is collected (at most three optional initials), that no
  network is used, and that results exist only where the teacher types them
  (and in a copy she chooses to save).
- The write-up's "What it does" shall have one line about class results.

## REQ-CR-10 — Proof

**Acceptance criteria**
- A fast-check round trip. The checksum caught every single-character
  substitution and every adjacent transposition, tested exhaustively on random
  codes. A code from another lesson was rejected. Aggregation property.
- DOM tests for the end-card code and the Teacher-tab panel.
- A real-browser gate in `pre-submit`: play a sample offline three times with
  different answers, read the three codes off the end card, open the Teacher
  tab, paste them, and assert the table's numbers.
- Mutants, each killed: checksum off, fingerprint ignored, *not reached*
  treated as *wrong*, duplicate codes double-counted.
