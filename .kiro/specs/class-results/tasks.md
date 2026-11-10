# Class Results (no server): Tasks

Source: `../CLONES_TEARDOWN_2026-11-09.md` §4 row 5. Requirements:
`requirements.md` (REQ-CR-01 … 10). Reasoning: `design.md`. The spec was
written and reviewed before any code. Every id below is named in a test title
or a gate (`check:trace`).

---

### TASK-34b1: the results-code format  *(REQ-CR-01, 02, 03, 04; design §1)*
  - **Fix.** `src/shared/resultsCode.ts` contains:
    - the 31-character alphabet (no 0 O 1 I L);
    - `lessonFingerprint(stack)` (FNV-1a over the quiz content, mod 31³);
    - `encodeCode` / `decodeCode` with the play tag, the results trits in base
      31, optional initials (bijective base 26 in three characters) and the
      weighted mod-31 check character;
    - `formatCode` (groups of four), `codeLength(n, withInitials)` and
      `foldInitials`.
    - There is no `BigInt`.
  - **Acceptance criteria.**
    - fast-check: the encode → decode round trip is identical for any lesson
      shape, result vector, initials and tag.
    - Every single substitution and every adjacent swap is caught,
      exhaustively, on random codes.
    - A code from another lesson, or from an edited one, is rejected with
      "This code is from a different lesson, …".
    - The lengths for 5, 10 and 20 quiz cards match design §1.2.

### TASK-34b2: the player records first answers and shows the code  *(REQ-CR-02, 03, 04; design §2)*
  - **Fix.**
    - `RuntimeState.answers` records the first answer per quiz card;
      `createRuntime` and `resetRuntime` start it empty.
    - `resultsOf(stack, answers)` turns it into the per-question results.
    - The end card shows "Your results code", the grouped code (with a spelled
      twin for screen readers), and the optional initials field. The code is
      shown only when the lesson has quiz cards.
    - Play Again draws a new tag. Ink, never stamp red. The end card still
      fits 800 × 600.
    - The three samples are regenerated (`npm run samples`), and
      `check:samples` passes.
  - **Acceptance criteria.** DOM tests:
    - the code appears with quiz cards and is absent without;
    - the first answer wins on a revisit;
    - a skipped card is *not reached*;
    - initials change the code but keep its tag;
    - Play Again clears the results and draws a new tag;
    - the class export shows the code too.

### TASK-34b3: reading pasted codes  *(REQ-CR-05; design §3)*
  - **Fix.** `src/shared/classResults.ts`:
    - `readCodes` reads lines, commas, spaces between codes and codes typed
      with spaces instead of dashes, by partitioning each line into
      valid-length pieces that pass the check (design §3; spec review P0-1);
    - decoding uses the plain-language reasons, in the design §3 order;
    - de-duplication is by normalised code.
  - **Acceptance criteria.**
    - A fast-check property: random codes joined by random separators all
      come back.
    - The same code twice counts as one pupil, with "Same code as one above —
      counted once" (or "Already added — counted once" across pastes).
    - Each bad code is listed with its reason, and the good ones are counted.
    - A code matching the in-session edited lesson gets its own message
      (spec review P0-2).

### TASK-34b4: the class tally  *(REQ-CR-06; design §3)*
  - **Fix.**
    - `tally(lesson, codes)` gives the per-question right / wrong /
      not-reached counts, the per-pupil scores, the median and the revisit
      list (wrong by at least a third of those who answered).
    - `resultsText` gives the plain-text table.
  - **Acceptance criteria.**
    - fast-check aggregation property: the tally equals the counts recomputed
      from the per-pupil vectors, with duplicates mixed in.
    - The median is right for odd and even class sizes.
    - The revisit rule and its order hold.

### TASK-34b5: the "Class results" panel in the Teacher tab  *(REQ-CR-06, 07; design §4)*
  - **Fix.**
    - `src/living/classResults.ts`: a "Class Results" / "Edit Cards" toggle in
      the Teacher bar, the codes text box, Add Codes and Clear Codes;
    - the status line, the bad-code list, the median, the question table with
      "Qk missed by W of P", the revisit list and the pupil table (initials
      only when given);
    - Copy as Text and Print Results.
    - It reads against the lesson as the file opened. It is plain DOM, with
      no network and no storage API.
  - **Acceptance criteria.**
    - DOM tests for opening and closing the panel, Add Codes, the table
      numbers, the bad-code list, the initials column, copying and clearing.
    - Edits made in the card editor survive a trip to the panel.

### TASK-34b6: codes kept only in a copy the teacher saves  *(REQ-CR-08; design §5)*
  - **Fix.**
    - `withClassResults(html, codes)` writes or removes
      `<script id="class-results" type="application/json">` in `<head>`, and
      `readClassResults(html)` reads it.
    - Save a Copy keeps the codes when the quiz fingerprint is unchanged, and
      drops them otherwise, saying so.
    - Boot loads them into the panel. A file with no codes has no block.
  - **Acceptance criteria.**
    - Save → reopen gives the same table.
    - No codes → no block, and the copies are byte-identical.
    - Changed quiz content → not kept, with the message.
    - The class export carries no results block and no panel.

### TASK-34b7: the real-browser gate  *(REQ-CR-07, 10; design §7)*
  - **Fix.** `scripts/check-class-results.ts`, run by `pre-submit`.
    - Headless Chrome, network blocked, port-free (`--dump-dom`), never ports
      9222 or 9224.
    - It plays `samples/vikings-in-ireland.html` three times with different
      answers (one pupil types initials) and reads each code off the end card.
    - It opens the Teacher tab → Class Results, pastes the three codes plus a
      duplicate and a bad one, and checks every number in the table against
      the answer patterns.
    - It presses Save a Copy, reopens the copy in a fresh Chrome and checks
      that the same table is there.
    - check:a11y gains an "end card with code" page and a "Class results"
      page.
  - **Acceptance criteria.**
    - The gate exits 0 on the real build.
    - check:a11y reports 0 serious or critical violations on the new pages.

### TASK-34b8: mutants  *(REQ-CR-10)*
  - **Fix.** Five entries in `scripts/mutation-check.ts`:
    - checksum off;
    - fingerprint ignored;
    - *not reached* encoded as *wrong*;
    - duplicates counted twice;
    - the saved-codes block pattern loosened. That pattern matched inside the
      living bundle in implementation (design §5).
  - **Acceptance criteria.** `npm run check:mutants` kills all of them.

### TASK-34b9: docs  *(REQ-CR-09)*
  - **Fix.**
    - README "Class results (no server)", with the privacy statement and the
      code lengths.
    - One "What it does" line in `docs/DEVPOST_WRITEUP.md`. It carries no
      number, so `check:claims` does not check it.
    - A KIRO_LOG TASK-34b entry.
  - **Acceptance criteria.**
    - A test finds the README section with its three privacy points and the
      write-up line.
    - `check:claims` passes.
