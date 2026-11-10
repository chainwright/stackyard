# Accessibility: what we checked, and what we did not

Written for TASK-33d (`.kiro/specs/maker/tasks.md`, `.kiro/specs/exporter/tasks.md`). Every number below comes from a script in this repository, and `CI=true npm run pre-submit` runs those scripts.

## What was checked

### 1. An automated audit with axe-core

[axe-core](https://github.com/dequelabs/axe-core) **4.14.0** is a pinned devDependency (exact version in `package.json` and `package-lock.json`). `scripts/check-a11y.ts` injects its source into headless Chrome through the DevTools protocol. It never adds a `<script src>`, so every page keeps its real Content Security Policy.

It runs the WCAG 2.0, 2.1 and 2.2 A and AA rules plus Deque's best-practice rules (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`) on **16 pages**:

- the Maker's Start screen and its editor with a ready-made deck, served by the real server (its strict CSP) from `dist/maker`;
- the 3 samples, served by the real server at `/samples/`, each in Play and with the Teacher tab open (6 pages);
- a class (play-only) export of the Vikings deck;
- the Vikings sample's end card with its class results code and initials field, and its Teacher tab's Class results panel holding codes, with both tables and a bad code listed (TASK-34b7);
- the first 5 files in `bench/files/`.

The result is [`axe-report.json`](axe-report.json): per page, the violations by impact with their rule ids and node counts, the passes count, the axe version and the date. The gate fails on any serious or critical violation.

**Before and after our fixes** (axe 4.14.0, the same 14 pages, 9 Nov 2026; the 2 class-results pages were added on 10 Nov with 0 violations of any impact):

| Impact | Before (first run) | After |
|---|---|---|
| Critical | 2 nodes, 1 rule (`label`: the Teacher tab's flash-card boxes had no label tied to them) | 0 |
| Serious | 5 nodes, 2 rules (`label-content-name-mismatch` on the flash card ×4; `nested-interactive` in the Maker's card list ×1) | 0 |
| Moderate | 3 rules on most pages (`landmark-one-main`, `page-has-heading-one`, `region`) | 0 |
| Minor | 0 | 0 |

What we fixed, in our code (no rule is disabled or excluded):

- **Flash card.** The card was a button whose label hid its own words. It is now named by the words it shows, and `aria-expanded` says whether the explanation is shown. Its Next Card button now sits beside it, not inside it.
- **Maker card list.** The move-up and move-down buttons were inside the card's button. They now sit beside it.
- **Teacher tab boxes.** Every box now has a `<label for>` tied to it.
- **Landmarks and headings.** The exported file's card area is a `<main>`, and every card has the deck's title as a hidden `h1`. The Teacher tab editor is a named modal dialog. The Scan control is a named region.
- **ARIA.** The end card's stamp row has `role="img"` for its label, and a label that needed a role was removed from the running score.

**Excluded rules: none.**

### 2. Screen-reader semantics in the player (exported file and Teacher tab)

Each of these is checked by DOM tests in `tests/a11y-player.dom.test.ts`. We did not listen to them in a screen reader (see "What was not checked").

- An answer tile's accessible name starts with its shape: "Triangle: Vikings", "Diamond: …", "Circle: …", "Square: …".
- The card is a named group, "Card 3 of 12: Where did the Vikings build a town in 841?". After a card change, focus moves to it, so a screen reader reads it, and Tab goes on to its first choice.
- After an answer, the page's polite live region says "Correct", or "Not quite — the right answer was Dublin."
- The flash card is a button. Its name is its words, and `aria-expanded` is `false` on the front and `true` on the back.
- The end card is named by its heading and the score ("You finished the Vikings quiz. Score 5 of 6"). The live region reads the same.
- The CORRECT ✓ and ✗ stamps, the "✓ Right answer" tag, the rings and the end-card stamp slots are `aria-hidden`. The stamp row as a whole is one image named "5 of 6 stamps earned".

### 3. Keyboard only

`scripts/check-a11y.ts` uses real key events sent through the DevTools protocol (`Input.dispatchKeyEvent`): no mouse and no `element.click()`.

- **Play-through.** `samples/vikings-in-ireland.html` is played to its end score with Tab, Enter and Space only (10 cards, "Score 6 of 6").
  - On every card, Tab reaches the card's choices before the Teacher tab.
  - Every control it lands on has the 3px solid ink focus ring.
- **Teacher tab.** Then, still by keyboard:
  1. Tab to the Teacher tab, press Enter.
  2. Tab to the question in the preview, press Enter. The cursor moves into its text box.
  3. Type, then Shift+Tab to Save a Copy and press Enter. The copy carries the new text.
  4. Escape returns to Play.
- **Escape** also leaves Try It (in the Maker and in the Teacher tab) and closes the Maker's "Before you share" dialog (nothing is exported).
- **Harness shortcut.** The native `confirm()` dialogs are browser UI that a keyboard can already answer; the harness answers them itself so the run never blocks.

### 4. One-switch scanning

Every exported and living file has a small **Scan** control (bottom left) and the **S** key. Scanning is off by default.

- When it is on, the highlight (which is the keyboard focus, with a heavy ink ring) moves across the current card's choices every 1.5 s.
- A speed box beside the control sets 1 to 4 s.
- Space or Enter picks the highlighted choice. Nothing else is needed to finish a lesson.
- The setting lasts for the browser session only (`sessionStorage`).

Fake-timer tests in `tests/a11y-player.dom.test.ts` cover the step, the speed limits, the toggle and the session setting. `scripts/check-a11y.ts` finishes `samples/vikings-in-ireland.html` in a real browser with the **Space key only**, after S turns scanning on: 12 presses, "Score 6 of 6".

### 5. Contrast

`scripts/check-contrast.ts` reads each colour out of the source (`src/player/renderer.ts`, `src/editor/styles.css`, `src/living/styles.ts`) and computes the WCAG 2 ratio. It fails under **4.5:1 for body text** and **3:1 for large text and UI** (focus rings). It also fails if this table is out of date.

<!-- contrast:start (written by scripts/check-contrast.ts) -->
| Where | Text / ring | Background | Kind | Ratio | Needs | Result |
|---|---|---|---|---|---|---|
| Player: card text, question, meta, score | `#1E2A47` | `#FBF8F1` | body | 13.40:1 | 4.5:1 | pass |
| Player: tile A label (coral) | `#1E2A47` | `#F2735F` | body | 5.00:1 | 4.5:1 | pass |
| Player: tile B label (sun) | `#1E2A47` | `#F6C744` | body | 8.92:1 | 4.5:1 | pass |
| Player: tile C label (teal) | `#1E2A47` | `#26A69A` | body | 4.74:1 | 4.5:1 | pass |
| Player: tile D label (navy) | `#FFFFFF` | `#1E2A47` | body | 14.21:1 | 4.5:1 | pass |
| Player: CORRECT ✓ / ✗ stamps over the paper | `#CE3926` | `#FBF8F1` | large (24px bold) | 4.67:1 | 3:1 | pass |
| Player: flash hint (muted) | `#4A5878` | `#FBF8F1` | body | 6.69:1 | 4.5:1 | pass |
| Player: "✓ Right answer" tag | `#FFFFFF` | `#1E2A47` | body | 14.21:1 | 4.5:1 | pass |
| Player: focus ring (ink) on paper | `#1E2A47` | `#FBF8F1` | ui | 13.40:1 | 3:1 | pass |
| Player: Scan control | `#FBF8F1` | `#1E2A47` | body | 13.40:1 | 4.5:1 | pass |
| Living file: Teacher tab (ink at 85 % over the paper page) | `#FBF8F1` | `#3F4961` | body | 8.47:1 | 4.5:1 | pass |
| Teacher tab editor: bar title and Play | `#FBF8F1` | `#1E2A47` | body | 13.40:1 | 4.5:1 | pass |
| Teacher tab editor: Save a Copy | `#FFF` | `#CE3926` | body | 4.96:1 | 4.5:1 | pass |
| Teacher tab editor: text on the desk | `#1E2A47` | `#D4C9B0` | body | 8.65:1 | 4.5:1 | pass |
| Teacher tab editor: hints (muted) | `#4A5878` | `#FBF8F1` | body | 6.69:1 | 4.5:1 | pass |
| Maker: body text on paper | `#1E2A47` | `#FBF8F1` | body | 13.40:1 | 4.5:1 | pass |
| Maker: hints and the ready-made lede (muted) on paper | `#4A5878` | `#FBF8F1` | body | 6.69:1 | 4.5:1 | pass |
| Maker: muted text on white | `#4A5878` | `#FFFFFF` | body | 7.10:1 | 4.5:1 | pass |
| Maker: top bar subline | `#E0E6F0` | `#1E2A47` | body | 11.34:1 | 4.5:1 | pass |
| Maker: wordmark on the top bar | `#FBF8F1` | `#1E2A47` | large | 13.40:1 | 3:1 | pass |
| Maker: Export File button | `#FFFFFF` | `#CE3926` | body | 4.96:1 | 4.5:1 | pass |
| Maker: Export File hover | `#FFFFFF` | `#B8321F` | body | 5.98:1 | 4.5:1 | pass |
| Maker: "Card N of M" and text on the desk | `#1E2A47` | `#C9A47C` | body | 6.15:1 | 4.5:1 | pass |
| Maker: focus ring (ink) on the desk | `#1E2A47` | `#C9A47C` | ui | 6.15:1 | 3:1 | pass |
| Maker: the right-answer tag | `#FFFFFF` | `#1E2A47` | body | 14.21:1 | 4.5:1 | pass |
<!-- contrast:end -->

## What was NOT checked

- **No screen-reader user test.** No blind or partially sighted person has used Stackyard.
- **No VoiceOver, NVDA, JAWS or TalkBack recording.** The screen-reader semantics above are checked in the DOM, not heard.
- **No testing with disabled pupils**, and no classroom testing of any kind. One-switch scanning was tested with a simulated Space key, not with a real switch.
- **Only Chrome (headless).** Firefox and Safari were not audited.
- **The Maker's editing was not checked by keyboard alone.** Only the Teacher tab's editing was. Drag to move has no keyboard equivalent in either.
- **axe finds only part of what matters.** Automated rules catch roughly a third to a half of WCAG problems. A clean report is not a claim of WCAG conformance.
