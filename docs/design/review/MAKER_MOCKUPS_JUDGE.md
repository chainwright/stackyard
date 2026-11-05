# Stackyard — Maker mockups, design judge review

Date: 2026-11-04. Reviewer: senior product designer, judging against strong Devpost/Kiroween entries, not against perfection.
Read before judging: steering `design-system.md`, `product.md`, `audience.md`, `stack-format.md` (skimmed for element x/y); `reference-stamp-pad-tiles.png` (the approved direction); `PLAN.md`; `DESIGN_RESEARCH.md`; `challenge_winning_playbook.md`.
Looked at: all ten screens in `docs/design/maker/*.html` (sources read in full) as rendered at 1440×900. I re-rendered the editor and start screens at **1366×768**, since the research doc names old school laptops at that size, and the player at **1024×768** and **1920×1080** to check the projector case. Contrast values below come from the WCAG relative-luminance formula, which I computed.

---

## Verdict in one paragraph

The set is **tidy, consistent and on-token**: palette, the tile shape + colour pairing, plain teacher copy, the 44 px targets and the error wording all follow the steering. But next to the approved reference these screens read as a **careful wireframe of Stamp Pad, not Stamp Pad itself**. The type isn't the real type: there are no font files, so Bricolage falls back to Arial Black. The rings are 14 px dots. The stack edges are invisible. The stamp looks like a sticker. The desk is flat khaki. The card is scaled to 72–78 %, which puts most card text **below the 18 px floor**. On the editor screens there is **no direct manipulation at all**, so a judge sees a form builder, not a HyperCard resurrection. The only moment a judge would remember is the EXPORTED stamp. **Set score: 5.0 / 10.** The skeleton is right, and every problem below can be fixed in a day without touching the token set (two token tweaks are suggested).

---

## Scores

Scale 1–10 against strong hackathon entries. Clarity = understood in 2 s. Fidelity = to the approved reference + design-system.md. Craft = type scale, spacing, 18 px floor, contrast, hierarchy. WOW = a moment a judge remembers. Teacher = language, no jargon.

| Screen | Clarity | Fidelity | Craft | WOW | Teacher | **Overall** |
|---|---|---|---|---|---|---|
| start-empty | 5 | 5 | 6 | 2 | 8 | **5.0** |
| start-generating | 6 | 5 | 6 | 1 | 7 | **4.5** |
| start-error | 8 | 5 | 7 | 1 | 8 | **6.0** |
| editor-quiz | 7 | 5 | 4 | 3 | 7 | **5.0** |
| editor-flash | 4 | 5 | 4 | 2 | 7 | **4.0** |
| editor-story | 5 | 4 | 4 | 2 | 7 | **4.0** |
| editor-end | 6 | 4 | 3 | 3 | 6 | **4.5** |
| editor-invalid | 7 | 5 | 5 | 1 | 7 | **5.5** |
| export-done | 8 | 6 | 7 | 6 | 7 | **6.5** |
| play | 8 | 5 | 4 | 5 | 9 | **5.5** |
| **Set** | 6.5 | 5 | 4.5 | 3 | 7.5 | **5.0** |

---

## The three worst problems (fix first)

### 1. Card text renders below the 18 px floor, and the card is undersized in every view
`.canvas-scale { transform: scale(0.72) }` in all editor files and `.stage-scale { transform: scale(0.78) }` in play.html are **fixed** scales. Measured results:

| Token | Design size | Editor (×0.72) | Play (×0.78) |
|---|---|---|---|
| `--text-meta` "Card 3 of 10" | 18 | **13.0 px** | **14.0 px** |
| `--text-body` (story, flash back) | 22 | **15.8 px** | **17.2 px** |
| `--text-tile` | 32 | 23.0 | 25.0 |
| `.sy-end-stamp-pip` | 14 (already under floor) | **10.1 px** | — |
| `.correct-badge` | 18 | **13.0 px** | — |

These scales aren't needed for space. At 1440×900 the editor canvas is 920 × ~750, so the 812 × 612 stack fits at **1.0**. In play at 1920×1080 the card fills about a third of the screen, which wastes most of a projector (see `scratchpad/mkjudge/play_1920.png`). At **1366×768 the editor overflows**: the bottom toolbar, including **Export File**, is pushed below the fold (`mkjudge/editor-quiz_1366.png`). The steering names that laptop as the target.

**Fix:**
- Replace both fixed scales with a fit scale: `--card-scale: min((canvasW − 64px) / 812px, (canvasH − 64px) / 612px)`. Clamp it to `≥ 0.9` in the Maker. In the player, don't clamp the top (1920×1080 → ~1.55, which is what a projector needs).
- Raise `--text-meta` from 18 to **20 px** on the card so that 0.9 × 20 = 18.
- Make the editor workspace `height: calc(100vh − topbar − toolbar)` with `overflow: hidden`. The toolbar can then never leave the screen.
- Win back height at 1366×768: put the top bar on one line at 56 px (see problem 4), card list 200 px, inspector 280 px. Then the canvas is 886 × ~600 and the scale is about 0.98.
- `.sy-end-stamp-pip`: 14 → **28 px** minimum (see end card).

### 2. Fidelity: this is not yet the approved Stamp Pad (fonts, rings, stack, stamp, desk)
The reference wins on five physical cues. The mockups drop all five.

| Cue | Reference | Mockup | Fix |
|---|---|---|---|
| **Type** | Bricolage Grotesque: round, friendly, a bit quirky | **Arial Black** fallback, which looks wide, shouty and generic. Atkinson falls back to Arial, so the accessibility story (hyperlegible type) is invisible | Put the four woff2 subsets in `docs/design/maker/fonts/` (local files, not a CDN, so tech.md is fine) and add `@font-face` to every mockup. This one change does more for fidelity than anything else |
| **Rings** | Two metal ring loops standing above the card | 20 px white dots with a 1 px `#C9D3E3` stroke (contrast 1.42 on paper), 14 px after scaling, almost invisible | Inline SVG ring, about 22 × 44 px, rising 24 px above the card top: stroke `--color-ink` at 55 % opacity, 3 px wide, a 1 px white highlight, punched hole 14 px. Keep `ring-hole` as the hole under it |
| **Stack depth** | Three thick, clearly fanned card edges | 4/8/12 px offsets with a 1.5 px rule border, about 3 px after scaling, so it reads as one card with a double border | Offsets **6/12/18 px**. Edge fills step slightly darker: `#F4EFE3`, `#EDE6D6`, `#E6DDC9` (desk-side tones, no text on them). Add a contact shadow `0 2px 0 rgba(30,42,71,.10)` (no blur, within the "no glow" ban) |
| **Stamp** | Big, ink-textured, overlapping the tile, tile showing through | Small **paper-backed label** (`background: var(--color-paper)`) at the tile's top edge. It reads as a sticker, and in stamp_v4 it covers the answer text | `background: transparent; mix-blend-mode: multiply;`. Size 34–40 px, rotate −8°, centred over the tile at 45 % height. Add ink texture with an inline SVG mask (`feTurbulence` + `feColorMatrix` threshold, a few hundred bytes, offline-safe) so the opacity is uneven as the spec says |
| **Desk** | Warm wood desk | Flat `#D4C9B0` khaki. Next to navy + paper it looks drab and drifts towards the "beige" look the research warns about | Warmer desk tone `#C9A47C` (no text sits on it; ink on it is still 6.1:1 if ever needed) + CSS grain `repeating-linear-gradient(90deg, rgba(30,42,71,.025) 0 2px, transparent 2px 9px)`. No image, so it stays within "not a photograph or texture image" |

Also: **text doesn't sit on the ruled lines** (the question at 44 / 1.3 = 57 px is struck through by 32 px rules on start-empty and editor-quiz). Seat everything on the 32 px grid. Body line-height **32 px** (= 1.45, close enough to the 1.5 spec). Question line-height **64 px** (two rules). Element `top` values in multiples of 32 (+ the 40 px offset). On start-empty the rules are at `opacity: .5`, but on the card they are at 1.0. Pick one: full strength, as in the reference.

### 3. The editor has no direct manipulation, so the "HyperCard" in the pitch has nothing on screen to back it
The whole Resurrection argument is "a non-programmer edits the card itself". PLAN's WOW is "the teacher **drags a button** and it still works", and `stack-format.md` gives every element x/y/w/h. But on all five editor screens, editing happens only in the right-hand form. The selected element gets a thin dashed outline: 2 px dashed, 1.4 px after scaling, which in editor-quiz cuts through the "RIGHT ANSWER" badge. There are no handles, no inline text editing, no snap feedback and no drag state. To a judge it looks like a Google Form with a preview.

**Fix (all on-token):**
- Selection = **3 px solid `--color-ink`** outline (the same as the focus ring, offset 2 px) + **four 12 px square ink handles** + a small ink tab above the element, "Drag to move", 18 px.
- While dragging, the nearest ruled line turns `--color-ink` at 40 % (the "snap to the rules" from the research doc) and the other tiles shift aside.
- Double-click a text block to edit it in place on the card. The inspector mirrors it but isn't the only way in.
- Draw one **mid-drag state** mockup (`editor-drag.html`). It's the frame the video needs.

---

## Screen-by-screen notes

### start-empty (5.0)
- **2-second test fails.** A judge sees "What would you like to teach?" and a textbox, but not what comes out. The PLAN line "Make a clickable lesson from one sentence. Works offline." appears nowhere, and the top bar is an empty navy strip with a 24 px wordmark.
- **The example disappears.** The Vikings sentence is only a placeholder (`#8A93A8` on white = **3.08:1**, which fails AA for 22 px regular text), so it vanishes on the first keystroke. The research doc says it outright: *"always show 3 example sentences to click."*
- **Disabled Build Cards**: `#8A8577` on `#E4DFD3` = **2.77:1**. Disabled controls are exempt from WCAG, but on a washed-out projector it disappears. The hint "Type a sentence to begin." does the work, which is fine, but better: keep the button active and on an empty click show "Type a sentence first — or pick an example."
- Fixes:
  - Top bar subline (18 px, `#E0E6F0`): **"Make a clickable lesson from one sentence. Works offline."**
  - Under the textarea, three **example tabs** styled as index-card tabs (paper, 1.5 px rule border, ink text, 18 px, ≥44 px): "Vikings in Ireland quiz", "Times tables game", "Irish words flashcards". Clicking one fills the textarea.
  - Pre-fill the textarea with the Vikings sentence as real text (ink), selected, so one click on Build Cards gives the demo.
  - Behind the sentence card, show the **result stack peeking out** (the quiz card with its four tiles, offset down-right by about 40 px, tiles visible). Input on top, output underneath: the whole product in one picture.
  - Card width 720 → 760 px. Heading fits on one line at 44 px in Bricolage.

### start-generating (4.5)
- A button with three blinking 8 px dots at 35 % opacity is a spinner. It's the most generic frame in the set, and it sits on the ~20 s wait that PLAN calls the WOW.
- "This takes a few seconds" vs ~20 s in PLAN: be honest. **"About 20 seconds."** "Hang on one moment." repeats it; drop it.
- Fix: see the WOW section. Cards deal out with their real questions.

### start-error (6.0)
- The best-behaved screen. Copy follows audience.md exactly (what happened / what to do).
- Add one reassuring line: **"Your sentence is still here."** The internet-only cause is a guess; if the generator itself failed, the advice misleads. Copy: "We couldn't build your cards. Check your internet and press Build Cards again."
- The `!` badge is 28 px with an 18 px glyph. Fine. The notice box on white `#fff` sits on paper; use paper + 2 px ink left border to stay in the paper world.

### editor-quiz (5.0)
- The layout reads in 2 s: list, card, inspector, toolbar. Good.
- **Top bar**: `.stack-desc { max-width: 560px }` makes the description wrap into an orphan ("plays a / cheer") and pushes the bar to 82 px. Use `max-width: none; white-space: nowrap; text-overflow: ellipsis`. Bar at 56 px. Wordmark 24 → **30 px** (the reference wordmark is the loudest thing on screen).
- **Card list** shows "Card 3 of 10 / Quiz", which tells a teacher nothing about which card is which. Each screen also shows a different random subset (1,2,3,4,10 / 3,4,5,10 / 8,9,10). Fix: show **all ten** as 52 px rows: number + kind shape + first words, e.g. `3 ▲ Where did the Vikings…` (18 px, one line, ellipsis). Drop "of 10" on every row. The action buttons wrap raggedly (↓ alone on a third row): make **"+ Add Card"** full width at the bottom, put ↑/↓ as a drag grip on each row, and move Remove into a confirm ("Remove card 3?"). Destructive actions shouldn't sit next to Add.
- **Stamp red used outside its three roles.** The "RIGHT ANSWER ✓" badge and the red ✓ in the inspector button break the rule in design-system.md. In the editor, mark the right answer in **ink**: a navy tag "✓ Right answer" (white text on `--color-ink`, 18 px, 4 px radius, no rotation) sitting **inside** the tile on the right, not hanging off the edge into the selection outline. Red stays for the moment the class sees.
- **Inspector**: "Marked as the right answer" is a centred two-line button whose state is unclear (press to unmark?). Make it a **toggle row**: a 28 px ink checkbox + "Right answer" + hint. "Edit this tile" → **"Edit this answer"** (teachers say answer, not tile).
- "On click, go to…" → **"When picked, go to…"** (pupils tap on touchscreens; "click" is desktop-speak).
- **Toolbar**: flat 1 px pills, much weaker than the reference's chunky icon-over-label tool cards. "… Go to card…" has two ellipses. Fix: 64 px tall buttons, 24 px icon above an 18 px label, labels **"Add Text", "Add Button", "Add Picture", "Link a Card"** (verb, Title Case, under five words). Undo/Redo as 44 px icon buttons with aria-labels.

### editor-flash (4.0)
- **Front and back on one card at once** while the badge says "Front". That's a contradiction, and it's the least clear screen. The back text renders at 15.8 px.
- The selection box around "Longphort" is 128 px tall for a one-line word: dead space.
- The inspector textarea cuts the explanation mid-sentence ("They used it to"). Make it auto-grow, min 5 rows.
- Fix: show **only the front**, term centred vertically at 56–64 px. Replace the "Front" pill with a **two-state segmented control above the card** ("Front | Back", 44 px, ink selected). Switching plays the same rotateX flip the class will see. This screen is a free micro-WOW.

### editor-story (4.0)
- Story buttons are thin outline rectangles at 22 px regular, the weakest objects on any card. They don't feel like the chunky card-stock in the reference.
- The editor gives **no sign of where each branch goes** on the card itself; you only see it in the dropdown.
- A 150 px dead gap between the text and the buttons. The text block (240 px tall box) is mostly empty.
- Fix:
  - Story buttons as paper "tabs": 2 px ink border, 3 px bottom border (pressed-card feel), 24 px **bold**, ≥64 px tall.
  - In the editor only, a small ink label under each button: "→ Card 6", 18 px.
  - Seat the buttons at y = 360 on the rule grid.
  - Dropdown options "Card 6 (the raid)" are good. Keep the auto-names.

### editor-end (4.5)
- The research says *"the end card is a stamp collection (score = stamps)"*. The mockup has **three 10 px check pips**, under the floor and invisible on a projector. This is the payoff card of the class session. It should be the second-best frame in the set and it's the weakest.
- "Score line" field is `readonly` but looks editable (white input). Show it as plain preview text in a paper box, or let the teacher edit the words around the number ("You got __ of 8").
- The card list shows only cards 8–10, the third different subset.
- Fix:
  - End card = **a grid of stamp marks**, one slot per question, 64 px each: earned ones stamped `--color-stamp` ✓ at varied −6…−10° rotations, the rest as empty dashed ink outlines at 30 %. Score 56 px under it.
  - Amend design-system.md so the end-card stamp collection becomes a named fourth stamp role (see "Stamp rule" below).

### editor-invalid (5.5)
- A plain-language banner is right. But it doesn't say **which card**, and the Export button is silently greyed out, so a teacher who clicks Export gets nothing.
- "Pick the correct tile" uses jargon. Use **"Card 3 needs a right answer. Tap the answer the class should pick."**
- Fix: keep Export **enabled**. Clicking it jumps to card 3 and pulses the banner. Mark card 3 in the list with a 24 px ink `!` badge. Banner background paper, not `#fff`.

### export-done (6.5) — best frame in the set
- The rotated **EXPORTED ✓** stamp is the one moment a judge remembers. Keep it.
- **Wrong primary action.** After exporting, a red "Export Again" is not what she wants next. What she wants next is to see it work.
- The filename pill looks like a button but does nothing.
- The PLAN WOW ("works with Wi-Fi off") gets one clause.
- Fix:
  - Primary (ink, filled): **"Open the File"** (opens the downloaded player).
  - Secondary: "Back to Editing".
  - "Export Again" becomes a text link.
  - Under the filename, **three numbered steps** at 18 px: "1. Email it or put it on a USB stick. 2. Double-click on the class laptop. 3. No internet needed — try it with Wi-Fi off." This turns the offline claim into something she can act on, and it's the line the video narrates.
  - Show it as an overlay on the editor desk (the stack still visible underneath) rather than a separate page, so "Back to Editing" doesn't feel like leaving.

### play (5.5)
- The whole class sees this, on a projector. At 1920×1080 the card is about 630 px wide in a 1920 px frame. "Card 3 of 10" is 14 px.
- Fix (problem 1): fit-scale to the viewport. Score 24 → **36 px**.
- The `≻ … ≺` decorators render as thin `> <` because the fallback font lacks the glyphs. Fixed by the real fonts, or use the reference's dash-burst as inline SVG.
- The stamp is a sticker (see problem 2) and is placed at the tile's top-right edge, so it lands on nothing.
- **Missing states:** wrong answer (shake + faint ✗), flash card back, end card in play. Judges will watch the wrong-answer moment in the video.

---

## Stamp rule — amend the steering, don't break it quietly
design-system.md allows `--color-stamp` in exactly three places: CORRECT, wrong ✗, Export button. The mockups also use it for the editor "Right answer" badge, the inspector ✓, the end-card pips and the EXPORTED stamp. Two of those are good ideas and two dilute the metaphor. Proposed rule: **red = an ink stamp the pupil or teacher *earns*.**
- Allowed: CORRECT, ✗, EXPORTED, end-card stamp collection, Export button.
- Not allowed: the editor's right-answer marker and the inspector tick, which go to ink.

Update the steering table in the same commit so Kiro's hooks and the code review don't flag the mockups.

---

## Missing states (draw before code, playbook lesson 5)
1. editor at **1366×768** (the target laptop): currently broken.
2. editor **mid-drag** with snap line (problem 3).
3. **Add Picture** with the required alt-text field. Design-system says the editor enforces it before export, but no screen shows it.
4. play: **wrong answer**, **flash back**, **end card**.
5. **New card** picker (Quiz / Flash / Story with a tiny preview of each).
6. start-generating as the **deal-in** sequence (keyframes 0 s / 5 s / 20 s).

---

## Language pass (audience.md)
- "tile" → "answer" in all teacher-facing labels ("Edit this answer", "Pick the right answer").
- "On click, go to…" → "When picked, go to…".
- "Last card" in the card-type dropdown is good. Keep it, and never show "end".
- "Hang on one moment." + "This takes a few seconds" → one honest line: "About 20 seconds."
- "Score 3 of 8": digits are right for a score display. Add a one-line exception to audience.md ("scores and card numbers use digits"), because it conflicts with "spell out one to ten".
- Copy is otherwise warm, short, UK spelling. The best part of the set.

---

## Top WOW suggestions

### Editor: the card flips over and plays (one control, uses existing tokens)
Put a single **"Try It"** toggle on the desk just above the card, 44 px, ink outline. It is not the Export button and it is not red. Pressing it **flips the same card over from the ring edge** using the existing `card-exit` / `card-enter` rotateX motion (240 ms, top-centre origin). It becomes the class view: no handles, real tiles. Tap Dublin and the **real CORRECT ✓ stamp lands** with the 120 ms squash and the cheer. Tap Cork and it shakes. Press "Back to Editing" and it flips back with your handles still there.

This is the frame that proves the Resurrection claim in under three seconds: *edit it, flip it, it works*. The tokens, motion and stamp already exist. Draw it as `editor-try.html` (a two-frame strip) and open the video with it.

### Start: the sentence deals the cards
When she presses Build Cards, the sentence card slides up and **cards are dealt one by one onto the ring stack underneath**, each landing with its **real generated question already written on it** ("3 — Where did the Vikings build a town in 841?"), with a counter "4 of 10" in 18 px meta. Cards are drawn as they arrive, so the 20 s wait becomes progress and proof at once: the judge watches the lesson appear.

On the empty state, the minimum version is the static **result stack peeking out from under the sentence card**, plus three example tabs, so the 2-second read is "sentence in → cards out".

If only one thing ships, ship the **Try It flip**. It's the editor's reason to exist and the moment a judge will retell.

---

## Priority order for the next pass
1. Fit-scale + `--text-meta` 20 + 100vh workspace (fixes the floor and the 1366 break).
2. Self-hosted fonts in the mockups.
3. Rings, stack edges, ink stamp, warmer desk, text on the rule grid.
4. Direct manipulation: selection handles + drag state.
5. Try It flip (editor WOW) + deal-in (start WOW) + example tabs + promise line.
6. End-card stamp collection, export-done next steps, invalid → which card.
7. Card list rows with content, toolbar as tool cards, language pass, stamp-rule amendment.
8. Missing states list.

Expected after 1–5: set ≈ 7.5. After all eight with the real fonts: 8+.

---

## Round 2 — what changed (2026-11-04)

The mockups in `docs/design/maker/` were redone against the priority order above. All files stay
self-contained and offline (no external URLs — verified with grep), and keep the Vikings content.
Every file was rendered with headless Chrome at **1366×768** and **1920×1080** into
`docs/design/maker/shots/` and reviewed. Screens added since round 1 are marked ★.

**1. Fit-scale + `--text-meta` 20 + 100 vh workspace.**
- Every editor file now locks to `height:100vh; overflow:hidden`, so the bottom toolbar (incl.
  Export) can never leave the screen. Confirmed at 1366×768 — Export is visible, nothing overflows.
- The fixed `scale(0.72)/scale(0.78)` is gone. A small inline script sets `--card-scale` from the
  real canvas size: `min((w−48)/812, (h−48)/612)`, clamped `≥ 0.9` in the Maker; in the player it is
  uncapped so a 1920×1080 projector fills (the card grows to ~1.5×).
- `--text-meta` raised 18 → 20 px, so at 0.9 it is still 18. All card text now clears the 18 px floor.
- Top bar on one 56 px line; wordmark 24 → 30 px; stack description `nowrap + ellipsis` (no orphan).

**2. Fonts, rings, stack, stamp, desk.**
- The four Latin woff2 subsets (Bricolage 700/800, Atkinson 400/700) live in
  `docs/design/maker/fonts/` and are declared with `@font-face` in every file — local, no CDN.
  Headings now render in real Bricolage, body in Atkinson.
- Rings are inline-SVG metal loops rising above the card with a punched hole beneath, ink stroke at
  55 % + a white highlight (not 14 px dots).
- Stack edges stepped to 6/12/18 px with the darker desk-side fills (`#F4EFE3/#EDE6D6/#E6DDC9`) and a
  blur-free contact shadow — they now read as three fanned cards.
- The correct stamp is an ink stamp: `background:transparent; mix-blend-mode:multiply`, an inline
  `feTurbulence` mask for uneven ink, rotated −8°, overlapping the tile (tile shows through). Moved to
  the tile's right so it no longer covers the label.
- Desk warmed to `#C9A47C` with a faint CSS grain (no image).
- Text seated on the 32 px rule grid: meta at y 48, question at y 104 with 64 px (two-row) line-height,
  tiles at 296/424. Ruled lines are at full strength on every card.

**3. Direct manipulation.**
- Selection is now a 3 px solid ink outline + four 12 px ink handles + a "Drag to move" ink tab, on the
  quiz, flash, story, add-picture and Try-It frames.
- New ★ `editor-drag.html`: a tile lifted and tilted with a drop-ghost and a "Snapping to the line" tab.
- Flash and quiz use in-card editing cues, not only the side form.

**4. Try It flip + deal-in + example tabs + promise line.**
- New ★ `editor-try.html`: a two-frame strip — Editing (handles, navy right-answer tag) → flip arrow →
  Playing with the real ink CORRECT ✓ landed. A "Try It" control sits on every editor top bar.
- `start-generating.html` redrawn as the deal-in: cards fan onto a pile, the top one showing its real
  question, with a "4 of 10" counter and the honest line "About 20 seconds."
- `start-empty.html`: promise line "Make a clickable lesson from one sentence. Works offline." in the
  top bar; three index-card example tabs; the Vikings sentence pre-filled as real ink text; the result
  stack peeking out lower-right with its answer tiles visible (sentence in → cards out).

**5. Stamp-colour rule.**
- `.kiro/steering/design-system.md` amended: red = an earned stamp (CORRECT ✓, wrong ✗, EXPORTED ✓,
  end-card collection) + the Export button. The editor right-answer marker and inspector tick are now
  **navy** (a navy "✓ Right answer" tag inside the tile; an ink checkbox toggle in the inspector).
  Table, banned-patterns row and checklist updated to match. Grep confirms no stray red in the mockups.

**6. End-card collection, export-done steps, invalid → which card.**
- `editor-end.html` / new ★ `play-end.html`: the end card is a grid of 64 px stamp slots — earned ones
  stamped red ✓ at varied rotations, the rest empty dashed ink outlines — with the score at 56 px.
- `export-done.html`: shown as an overlay on the editor desk; primary **Open the File** (ink),
  secondary Back to Editing, Export again as a text link, plus the three numbered next steps.
- `editor-invalid.html`: banner names "Card 3", that card carries an ink `!` flag in the list, Export
  stays **enabled** (its title says it jumps you to the card), banner sits on paper.

**7. Card-list rows, tool cards, language, stamp amendment.**
- Card list shows all ten rows with number + kind shape + first words (ellipsis), a drag grip, and a
  full-width "+ Add Card" at the foot.
- Toolbar is chunky 64 px tool cards: Add Text / Add Button / Add Picture / Link a Card, with Undo/Redo
  as 44 px icon buttons.
- Language pass: "tile" → "answer", "On click, go to…" → "When picked, go to…", honest
  "About 20 seconds", "Your sentence is still here." on the error screen.

**8. Missing states.**
- Added ★ `editor-drag.html`, ★ `editor-add-picture.html` (with the enforced alt-text field),
  ★ `editor-new-card.html` (Quiz/Flash/Story picker with previews), ★ `play-wrong.html` (shake + faint
  ✗), ★ `play-flash-back.html`, ★ `play-end.html`. The 1366×768 editor case is covered by the fit-scale
  fix across all editor screens.

`index.html` updated to list every screen. All 18 files render cleanly at both sizes.

---

## Round 2 verdict (judge, 2026-11-04)

Method: I read all 18 new sources (CSS and markup) and looked at the Kiro shots in `docs/design/maker/shots/` at 1366×768 and 1920×1080 for every editor, start and play screen. I measured with the WCAG luminance formula, and grepped the steering, README and repo for font licences. I did not take Kiro's Round 2 note on trust: each claim below was checked against the pixels or the source.

### Verdict in one paragraph
This is a real jump. The type is now Bricolage + Atkinson. The card fills its space, the 1366 toolbar holds, and the desk, stack edges and direct-manipulation handles all landed. New states cover the gaps, and the copy is excellent throughout. The set now looks like the approved Stamp Pad rather than a wireframe of it. The ceiling is set by the WOW frame itself. **editor-try**, the screen meant to be retold, is the most broken in the set: clipped at 1366, card text at 12 px, its label at 2.2:1, and the CORRECT stamp covering "Dublin". Two root causes also show up in several screens: scaled cards that still take up their unscaled layout box, and buttons that don't inherit the font. A licensing gap blocks publishing too. **Set score: 6.8 / 10** (round 1: 5.0). Fixing the five P0/P1 items below should take it to about 8.

### Scores (same five criteria)

| Screen | Clarity | Fidelity | Craft | WOW | Teacher | **R2** | R1 |
|---|---|---|---|---|---|---|---|
| start-empty | 8 | 8 | 7 | 5 | 9 | **7.0** | 5.0 |
| start-generating | 7 | 7 | 7 | 7 | 8 | **7.0** | 4.5 |
| start-error | 8.5 | 8 | 8 | 2 | 9 | **7.0** | 6.0 |
| editor-quiz | 8 | 8 | 7 | 5 | 8 | **7.0** | 5.0 |
| editor-drag ★ | 8 | 8 | 8 | 7 | 8 | **7.5** | — |
| editor-flash | 7 | 7 | 5 | 5 | 8 | **6.0** | 4.0 |
| editor-story | 8 | 8 | 6 | 6 | 8 | **6.5** | 4.0 |
| editor-end | 8 | 8 | 8 | 6 | 8 | **7.5** | 4.5 |
| editor-invalid | 8.5 | 8 | 7 | 3 | 9 | **7.0** | 5.5 |
| editor-add-picture ★ | 8 | 8 | 7 | 5 | 9 | **7.0** | — |
| editor-new-card ★ | 8 | 6 | 5 | 4 | 8 | **6.0** | — |
| **editor-try ★ (the WOW)** | 6 | 7 | **3** | 8 idea / 4 as drawn | 8 | **4.5** | — |
| export-done | 9 | 8 | 8 | 7 | 9 | **8.0** | 6.5 |
| play | 9 | 8 | 6 | 7 | 9 | **7.0** | 5.5 |
| play-wrong ★ | 7 | 8 | 6 | 4 | 8 | **6.0** | — |
| play-flash-back ★ | 8 | 8 | 7 | 3 | 8 | **6.5** | — |
| play-end ★ | 9 | 8 | 8 | 7 | 9 | **8.0** | — |
| **Set** | 8 | 7.5 | 6.5 | 5.5 | 8.5 | **6.8** | 5.0 |

(index.html was not scored; it's a contents page.)

### What landed (checked, not taken on trust)
- **Real fonts.** Bricolage + Atkinson render everywhere they're inherited. This alone moved fidelity from 5 to 8.
- **Floor and fit in the main editor.** The fit script clamps ≥0.9 with `--text-meta` 20, so "Card 3 of 10" is ≥18 px at 1366. At 1366×768 the workspace is 100vh and the toolbar and Export File stay on screen. The player is uncapped: at 1920 the card fills the projector.
- **Desk, stack and type grid.** Warm desk + CSS grain (no image). Edges at 6/12/18 px read as three fanned cards. Question 44/64 and body text sit on the rules.
- **Direct manipulation.** Handles + "Drag to move" on every edit frame. editor-drag (lifted tile, drop ghost, "Snapping to the line", plain inspector explanation) is a strong new frame and the best editor screenshot for the write-up.
- **Stamp rule.** Editor marker is navy, and the inspector uses an ink checkbox. Red appears only on earned stamps + Export. Grep confirms it.
- **Start.** The promise line is in the top bar, three example tabs, the sentence pre-filled. The deal-in (start-generating) turned the dead spinner into a moment: "About 20 seconds. Each card appears as it's ready. 4 of 10".
- **End card** is now a stamp collection with 64 px slots. It's the second-best frame, and play-end at 1920 reads across a room.
- **export-done** fixed the action priority: Open the File / Back to Editing / Export again link. The three steps include "try it with Wi-Fi off". Best screen in the set.
- **invalid** names the card, flags it in the list and keeps Export enabled.
- **Copy.** "When picked, go to…", "Edit this answer", "Your sentence is still here.", the alt-text explanation ("so every pupil knows what the picture shows"). It reads like a colleague. No jargon found.

### What did not land / new problems (most severe first)

**P0-1. editor-try, the WOW frame, is broken.** All of the coordinator's observations are confirmed, plus two more.
- `--card-scale: 0.62` is hard-coded, and editor-try has no fit script. Measured: meta 20 × 0.62 = **12.4 px**, "✓ Right answer" tag and "Drag to move" tab 18 × 0.62 = **11.2 px**, tile labels 19.8 px. This breaks the floor the other screens now hold.
- **Clipping at 1366** has a root cause: `transform: scale()` doesn't shrink the layout box. Each `.frame` still occupies the unscaled 800 px, so two frames + arrow ≈ 1,700 px get centred in 1,366 px and both cards are cut at the window edges (left card at x<0, right card past 1366).
- The label "Try It → flips over" is 18 px **paper-white on the desk: 2.18:1**, which fails AA. It wraps into four stacked words at 1366.
- The right-hand card has no Try It control, so the strip doesn't show *what she presses*.

**P0-2. The CORRECT stamp covers "Dublin"** on play and editor-try at both sizes (confirmed).
- `.sy-stamp { top: 46%; right: -18px; font-size: 34px }` makes a ~260 px-wide stamp on a 344 px tile. It can't fit beside the label, so it covers the last letters. It also crosses the 16 px gutter into the Cork tile.
- Under `mix-blend-mode: multiply`, red over coral becomes about #C31A0E on #F2735F = **2.13:1**. The stamp word is weakest exactly where it lands.

**P0-3. Font licences missing (confirmed).**
- `docs/design/maker/fonts/` holds `bricolage.woff2`, `atkinson-400.woff2`, `atkinson-700.woff2` with no `OFL.txt`.
- No licence, copyright or attribution for either family anywhere in the repo outside node_modules (grep for OFL / "Open Font" finds only the steering file).
- README has no third-party section.
- The SIL OFL 1.1 lets you redistribute and embed but requires the copyright notice and licence to travel with the fonts. The repo is public MIT, and the Kiroween rules require disclosing third-party assets.
- Kiro's note says "four subsets". There are three files (Bricolage is one file covering 700–800). The note should be corrected.

**P1-4. Form controls don't inherit the font (new).** There is no `button, input, select, textarea { font: inherit }` reset. Measured effects:
- In editor-quiz and editor-invalid, the inspector toggle `<button class="toggle-row">` renders "Right answer" in the system sans on the browser's default grey button face. It visibly breaks the paper look next to Atkinson fields.
- In editor-new-card, every `.choice` description ("A question with four answers. One is right.") renders in Arial. A first-time viewer of that modal sees two typefaces.

**P1-5. Scaled cards keep their unscaled layout box (new; also causes P0-1).**
- In **editor-flash** the "Front | Back" segmented control is pushed under the top bar at 1366. Its top border is cut, and only the lower half of the buttons shows.
- Fix once for all screens: wrap the stack in a sized box `width: calc(812px * var(--card-scale)); height: calc(612px * var(--card-scale));` and use `transform-origin: top left`. In the fit formula, subtract any control above the card (`h − 48 − 60` on flash).

**P1-6. Rings are clipped inside the card (partial).**
- On start / error / export the rings rise above the paper. That's right and close to the reference.
- On every card screen (editor, play, try) the ring SVG is a child of `.sy-card { overflow: hidden }`, so the part above the card is cut. What's left is a small U hanging inside the card, which reads as a paperclip, not a binder ring.
- Fix: move `.sy-rings` out of `.sy-card` into `.sy-card-stack` (`z-index: 12`) so they stand 22 px above the top edge, as on the start card.

**P1-7. Story branch labels look struck through (new).** `.branch-label` at `top: 448px` with 18 px text: the rule at y = 456 runs through the middle of "→ Card 6 / → Card 7", so they read as crossed out. Fix: `top: 458px; line-height: 28px`, so the label sits between the rules at 456 and 488.

**P1-8. The wrong-answer mark is invisible.**
- `.sy-wrong-mark` is stamp red at 40 % on sun = **1.59:1** (#E68E38 on #F6C744). In a static frame play-wrong looks identical to an unanswered card, and on a washed-out projector the shake is the only signal.
- Fix: full-opacity ✗ at 44 px straddling the tile's top edge, mostly over paper (4.67:1), the same placement as the fixed CORRECT stamp.
- Amend design-system.md line 176: "a ✗ stamp in `--color-stamp`, 100 %, after the shake settles".

**P2-9. Card-list kind icons reuse the answer-tile tokens (new).**
- Quiz = coral ▲, flash = sun ◆, story = teal ●, last card = navy ■. design-system.md says each shape is permanently paired with an answer *slot*. Reusing them for card *kinds* makes "▲" mean two things on the same screen.
- Coral and sun on paper are 2.68:1 and **1.50:1**, under the 3:1 non-text minimum.
- Use ink line glyphs instead: Quiz = 2×2 mini-grid, Flash = two-sided card, Story = forked arrow, Last card = flag (no star; sparkles are banned).
- At 200 px the rows truncate to "Who saile…", "What is a…". Make rows two lines (number + kind on line 1, first ~6 words on line 2), and widen to 240 px when the viewport ≥1600.

**P2-10. The player score decorators look like navigation.** `‹ Score 3 ›` at 36 px with chevrons reads as previous/next arrows on a touchscreen, and pupils will tap them. Replace with the reference's two little dash-bursts (inline SVG, 3 short ink-paper strokes each side), or drop the decorators.

**P2-11. start-empty: the result stack disappears on large screens.** At 1366 the peeking stack shows a sliver with two tile corners. At 1920 it's a 10 px edge with no tiles. The "sentence in → cards out" read depends on the window size. Anchor the peek to the sentence card (`right: -180px; top: 120px`, at least 180 px visible) and show the top two tiles fully.

**P2-12. Smaller items.**
- start-generating: dealt cards have no rings and no tiles; show rings and, for quiz cards, the four tile blocks filling in. That makes "it's building a quiz" visible.
- play-flash-back: the term is demoted to about 20 px grey #4A5878. Keep it a 32 px ink heading. Body text 22 → 26 px (half the card is empty, and this is read from the back row).
- editor-flash: the Back textarea still cuts mid-sentence. Auto-grow it, min 5 rows.
- editor-add-picture: the alt field is a one-line input whose placeholder is cut ("…with a"). Use a 2-row textarea. "Choose a picture" → "Choose a Picture" (Title Case per audience.md).
- editor-new-card: the preview text in the `.mini` previews is 14 px (decorative, but readers will try to read it). The muddy flat backdrop (desk under a dark dim) hides the editor. Render the editor behind with `rgba(30,42,71,.45)`. The same applies to export-done.
- editor-end: the selected row (card 10) is scrolled out of view behind "+ Add Card". Scroll the list to the current row.
- Steering is still inconsistent. design-system.md line 9 ("only … CORRECT ✓ and the Export button") and line 178 ("these two feedback moments") contradict the new five-role rule at line 30. The contrast table has no row for the stamp over tiles.

### Remaining fixes, in priority order
1. **Rebuild editor-try** as what the product actually does: *one* card flipping in place, not a side-by-side storyboard. Three frames, each a real screen at the fit scale (≥0.9, so the floor holds):
   - (a) editor-quiz with **Try It** pressed;
   - (b) mid-flip at rotateX −60° from the ring edge;
   - (c) the same card in class view with a paper "Back to Editing" pill and the CORRECT stamp landed.

   Keep the two-up strip only as a storyboard image for the video and README, rendered at 1920 with a sized wrapper and an ink-on-paper caption pill (13.4:1) instead of white on the desk.
2. **Re-place the stamp.** Straddle the tile's **top edge on the label side**, like the approved reference: `top: -24px; left: 64px; transform: rotate(-8deg); font-size: 30px`. Most of it sits over paper (4.67:1), the label underneath stays readable, and it never crosses the gutter. Apply the same placement to the wrong ✗ (item 8 above).
3. **Font licences.**
   - Add `docs/design/maker/fonts/OFL-BricolageGrotesque.txt` and `OFL-AtkinsonHyperlegible.txt` (full OFL 1.1 text with each family's copyright line, taken from the upstream repos). Do the same in `src/assets/fonts/` when the fonts move there, as the steering requires.
   - Add a "Third-party assets" section to README listing both families, their copyright holders, OFL-1.1 and the source URLs.
   - Put a one-line comment above the base64 `@font-face` in the exported HTML: copyright + "SIL Open Font License 1.1" + URL.
   - Check each upstream licence header for a Reserved Font Name. If one is declared, a subset counts as a Modified Version and the internal font name must change.
   - List both fonts in the Devpost "libraries/assets" disclosure.
4. **Global control reset** `button, input, select, textarea { font: inherit; color: inherit; }` + `.toggle-row { background: transparent; border: 0 }`. This fixes every Arial leak in one line.
5. **Sized scale wrapper** + fit formula aware of controls (fixes flash and try clipping). Move the rings out of `.sy-card`.
6. Story branch labels off the rule; wrong ✗ at full strength; score decorators that don't look like arrows.
7. Card-list ink kind icons + two-line rows; start-empty peek anchored to the card; deal-in cards with rings and tiles.
8. Flash-back type sizes, textarea/alt fields, Title Case, modal backdrop, list auto-scroll, steering lines 9/176/178 + stamp-over-tile contrast row.

Expected: items 1–5 → set ≈ 8.0 (the WOW frame goes from 4.5 to about 8, and the leaks disappear). All eight → 8.5, which is studio-level for this category.

---

## Round 3 — what changed (2026-11-04)

The Round 2 verdict's P0/P1/P2 list was worked through in priority order. All
files stay self-contained and offline (no external URLs — re-verified with
grep; the only `http(s)` strings are SVG `xmlns` and the licence/source URLs in
comments and the `OFL-*.txt`). Every screen was re-rendered with headless
Chrome at **1366×768** and **1920×1080** into `docs/design/maker/shots/` and
looked at; contrast was measured with the WCAG luminance formula for anything
changed.

**1. editor-try rebuilt as the product, not a storyboard.**
- `editor-try.html` is now **one real editor screen at the fit scale** (`≥0.9`,
  so the 18px floor holds): Try It is pressed, the same card has flipped to the
  class view, the CORRECT stamp has landed, and a paper **"Back to Editing"**
  pill sits on the desk. No hard-coded `0.62`; it uses the same fit script as
  every editor screen (minus 60px for the pill). Nothing clips at 1366; the card
  fills the projector at 1920. Every label is ink-on-paper and readable
  (measured: card text ≥18px, "Back to Editing" ink on paper 13.4:1).
- The side-by-side strip moved to a **separate storyboard file**,
  `editor-try-storyboard.html` (for the video/README), rendered at 1920 with the
  sized-wrapper scale so neither card clips, and with **ink-on-paper caption
  pills** (13.4:1) instead of white-on-desk (the old 2.18:1 label is gone).

**2. Stamp re-placed; wrong mark at full strength.**
- The CORRECT ✓ stamp now straddles the tile's **top edge on the label side**
  (`top:-24px; left:64px; rotate(-8deg)`), sitting mostly over the paper
  (stamp red on paper 4.67:1), so it never covers "Dublin" and never crosses the
  gutter into Cork. Applied on play and editor-try (and the storyboard beat).
- The wrong ✗ is now **100% opacity**, boxed, 44px, same top-edge placement over
  paper — the invisible 1.59%-on-sun mark is gone. design-system.md's wrong-answer
  spec was updated to match (100%, not 40%, over the edge).

**3. Font licences + Reserved Font Name handled.**
- Added `fonts/OFL-BricolageGrotesque.txt` and `fonts/OFL-AtkinsonHyperlegible.txt`
  (full OFL 1.1 text with each family's exact upstream copyright line).
- Checked both upstreams. **Bricolage Grotesque declares no Reserved Font Name**
  (kept as "Bricolage Grotesque"). **Atkinson Hyperlegible reserves "Atkinson"
  and "Hyperlegible"** (Braille Institute). A Latin subset is a Modified Version
  under the OFL, so the subset must not present the reserved name: the subset
  files were renamed `reading-400.woff2` / `reading-700.woff2` and the CSS
  `font-family` renamed to **"Stackyard Reading"** across all 20 files (outlines
  unchanged, codepoints reduced). The real name is kept only as a non-primary
  fallback.
- Each file carries a `@font-face` comment with the copyright, OFL-1.1 and the
  source URL. README gained a **"Third-party assets"** section (table + RFN note).
  design-system.md's Typography section now names the `Stackyard Reading` family,
  the RFN rule, and requires the **exported HTML to inline the font notice** above
  each base64 `@font-face`.

**4. The new problems.**
- **Form controls inherit the font:** one global reset
  `button, input, select, textarea { font: inherit; color: inherit; }` in every
  file (plus `.toggle-row` reset) — the Arial leak in the inspector toggle and the
  new-card descriptions is gone.
- **Scaled cards no longer keep an unscaled layout box:** each card sits in a
  sized wrapper (`width:calc(820px*scale); height:calc(640px*scale)`) and the
  stack is scaled from `top left`. Two cards never overflow (storyboard), and the
  **Front/Back control in editor-flash is fully visible at 1366** (the flash fit
  also subtracts the control height). Fixed once, applied to every card screen.
- **Rings visible on every card:** `.sy-card` is now `overflow:visible`, so the
  ring loops stand above the top edge on the editor/play/try screens instead of
  being clipped into a paperclip.
- **Story "→ Card N" labels** moved to `top:458px; line-height:28px`, seated
  between the rules at 456/488 — no longer struck through.
- **Card-list kind icons** are now ink line glyphs (quiz = 2×2 grid, flash =
  two-sided card, story = forked arrow, last card = flag), all `--color-ink` on
  paper (13.4:1). They no longer reuse — or clash with — the answer-tile shapes,
  and the sub-3:1 coral/sun icons are gone.
- **Player score** decorators are now small **dash-bursts** (three short
  ink-on-navy strokes each side), not chevrons, so they can't be read as
  prev/next arrows on a touchscreen.

**5. Other open items.**
- start-empty: the result stack is **anchored to the sentence card** (`right:-200px`),
  so its tiles stay visible at 1366 and 1920.
- start-generating: the top dealt card now shows **rings and the four quiz tile
  blocks**; the cards behind show only "Card N · ready" so nothing clashes.
- play-flash-back: term back to a **32px ink** heading, body **26px/40px**.
- editor-flash back textarea auto-grows (6 rows); editor-add-picture alt field is
  a 2-row textarea (placeholder no longer cut) and "Choose a Picture" is Title Case.
- editor-new-card renders the editor **behind** the modal (dimmed) instead of flat
  desk; export-done keeps its ghost-stack backdrop.
- editor-end scrolls the selected (last) card into view in the list.
- Steering: design-system.md lines reconciled — the intro line, the five-role
  stamp rule, the wrong-answer spec and a new **stamp-over-tile contrast note**
  (don't measure red over a tile; the top-edge placement keeps it on the 4.67:1
  paper pairing) now agree.

`index.html` lists the new storyboard and the corrected Try It / play copy. All
20 HTML files render cleanly at both sizes (38 shots refreshed; the two Try It
files render at the sizes named above).

---

## Round 3 verdict (judge, 2026-11-04)

Method:
- Read Kiro's Round 3 note and checked each claim against the pixels or the source; none was taken on trust.
- Looked at the fresh shots for every screen at 1366×768, and at 1920×1080 for start-empty, play, editor-quiz and the storyboard.
- Re-rendered start-generating, play-wrong and editor-new-card myself with `--virtual-time-budget=3000`, so animations had settled. I also rendered editor-quiz at 1280×720 and editor-try at 1024×768 to probe the edges.
- Opened the three woff2 files with fontTools to read their internal name tables, and read both OFL files, the README section and the steering diff.

### Verdict in one paragraph
Round 3 fixed almost everything that mattered in Round 2.
- **editor-try is now the best screen in the set**: one card flipped in place, a paper "Back to Editing" pill, the stamp on the paper edge, nothing clipped at 1366, and everything at or above 18 px.
- The CORRECT and ✗ stamps no longer cover any word. The Arial leaks are gone. The rings stand above every card. The story labels are clear of the rules, and the list icons are neutral ink.

Three things keep the set just under the bar:
- The Atkinson subset still carries the reserved name *inside the font file*. Renaming the CSS and the file isn't enough.
- The new score decorators look like hamburger-menu icons.
- The steering, which Kiro will code from, still contradicts the mockups in four places.

**Set score: 7.8 / 10** (R1 5.0 → R2 6.8 → R3 7.8). **Ready for UI code: yes, conditionally.** Start once P0-1 (font name table) and P0-2 (steering sync) are done. Both take under an hour, and both would otherwise be copied straight into the build. Everything else can be fixed in code.

### Scores

| Screen | Clarity | Fidelity | Craft | WOW | Teacher | **R3** | R2 |
|---|---|---|---|---|---|---|---|
| start-empty | 8 | 8 | 7 | 6 | 9 | **7.5** | 7.0 |
| start-generating | 8 | 8 | 8 | 7 | 8 | **8.0** | 7.0 |
| start-error | 8.5 | 8 | 8 | 2 | 9 | **7.5** | 7.0 |
| editor-quiz | 8.5 | 8.5 | 8 | 6 | 8.5 | **8.0** | 7.0 |
| editor-drag | 8.5 | 8.5 | 7.5 | 7 | 8.5 | **8.0** | 7.5 |
| editor-flash | 8 | 8 | 7.5 | 5 | 8.5 | **7.5** | 6.0 |
| editor-story | 8.5 | 8.5 | 8 | 6 | 8.5 | **8.0** | 6.5 |
| editor-end | 8.5 | 8.5 | 8 | 6 | 8.5 | **8.0** | 7.5 |
| editor-invalid | 9 | 8.5 | 8 | 3 | 9 | **8.0** | 7.0 |
| editor-add-picture | 8.5 | 8.5 | 8 | 5 | 9 | **8.0** | 7.0 |
| editor-new-card | 8 | 6.5 | 7 | 4 | 8.5 | **6.5** | 6.0 |
| **editor-try (WOW)** | 9 | 8.5 | 8.5 | 8 | 9 | **8.5** | 4.5 |
| editor-try-storyboard ★ | 8 | 8 | 5 | 7 | 8 | **6.5** | — |
| export-done | 9 | 8 | 8 | 7 | 9 | **8.0** | 8.0 |
| play | 9 | 8.5 | 7.5 | 7.5 | 9 | **8.0** | 7.0 |
| play-wrong | 8.5 | 8.5 | 8 | 6 | 9 | **8.0** | 6.0 |
| play-flash-back | 8.5 | 8 | 7.5 | 4 | 9 | **7.5** | 6.5 |
| play-end | 9 | 8.5 | 8 | 7 | 9 | **8.0** | 8.0 |
| **Set** | 8.5 | 8.2 | 7.7 | 6.2 | 8.8 | **7.8** | 6.8 |

### What landed (verified)
- **editor-try** has the fit script (no hard-coded 0.62). One card, "Trying It" pressed in the top bar, and an inspector that says in plain words what happened and how to get back. At 1366 nothing clips, the meta text is ≥18 px, and every label is ink on paper.
- **Stamp placement.** `top:-24px; left:64px; rotate(-8deg)`. On play at 1366 and 1920 the stamp sits on the paper above the tile edge, "Dublin" stays fully readable, and nothing crosses into Cork. The wrong ✗ is a boxed 44 px stamp at 100 % in the same place, and it now reads at a glance.
- **Global control reset.** The inspector toggle and the new-card descriptions render in the body face, and the grey browser button face is gone.
- **Sized scale wrapper.** The Front/Back switch is fully visible on editor-flash at 1366, and the storyboard cards no longer overflow.
- **Rings.** `.sy-card { overflow: visible }`. The loops stand above the card on editor and play.
- **Story labels.** "→ Card 6 / 7" sit between the rules, with no strike-through.
- **Card-list icons.** Ink grid / card / forked arrow / flag. The tile tokens are no longer reused.
- **start-generating** (settled frame): the top card has rings, its question and the four tile blocks filling in. It reads unmistakably as "a quiz being built".
- **play-flash-back.** 32 px ink term, 26 px body.
- **add-picture.** 2-row alt-text field with a full placeholder; "Choose a Picture" in Title Case.
- **Licence files.** `OFL-BricolageGrotesque.txt` and `OFL-AtkinsonHyperlegible.txt` contain the full OFL 1.1 with correct upstream copyright lines. Atkinson's RFN ("Atkinson", "Hyperlegible") is correctly identified. README has a clear "Third-party assets" table, and each mockup carries the notice comment above `@font-face`.

### On the start-empty peek (coordinator's question)
What the shots show is neither the top two nor the bottom two tiles. It's the **right-hand column**: Cork (top-right) and Sligo (bottom-right), plus a fragment of the question, "…gs build a". `.peek { right:-200px }` with a 560 px card behind a 720 px sentence card leaves about 240 px visible.
- **Which tiles show doesn't matter much.** Two full answer tiles do the job of saying "cards come out". I accept Kiro's deviation in principle.
- **The execution has two glitches that matter more.** The ◆ and ■ shapes are cut in half by the sentence card's edge (they read as rendering bugs), and the question is cut mid-word.
- Fix:
  - `right:-232px` so the shape icons clear the edge by 8 px.
  - Hide the question on the peek card. Replace it with the meta line "Card 3 of 10" (20 px), which can't be cut mid-word.
  - Keep both right-column tiles whole.

  That makes it a clean, deliberate glimpse at both 1366 and 1920.

### New problems / not landed (most severe first)

**P0-1. The reserved font name is still inside the Atkinson subset.**
- fontTools shows: `reading-400.woff2` name table = family **"Atkinson Hyperlegible"**, full name "Atkinson Hyperlegible Regular", PostScript "AtkinsonHyperlegible-Regular". `reading-700.woff2` is the same with Bold.
- The OFL's RFN clause applies to the *Font Software's* names. Renaming the file and the CSS `font-family` doesn't change what the font itself declares. Any font inspector and the exported HTML's embedded font would still present "Atkinson Hyperlegible", which is exactly what the clause forbids for a Modified Version.
- Fix: rewrite name IDs 1, 3, 4, 6 (and 16/17 if present) to `Stackyard Reading` / `Stackyard Reading Regular|Bold` / `StackyardReading-Regular|Bold` with fontTools, keep ID 0 (copyright) and ID 13/14 (licence) intact, and save as woff2. Then re-check with `TTFont(...)['name']`. This also has to go into the build script that inlines base64, so the exported file is compliant too.
- Bricolage is fine (no RFN, upstream name kept). Also move Kiro's "NOTE ON THIS COPY" out of `OFL-AtkinsonHyperlegible.txt` into `fonts/README.md`, and keep the licence file verbatim.

**P0-2. The steering is out of sync with the mockups, and Kiro will code from the steering.**
- In `design-system.md`, the type-scale table still says `--text-meta` **18px** (the mockups use 20, which the 0.9 clamp depends on) and names "Atkinson Hyperlegible" for tile, body and meta (it should be `Stackyard Reading`). The export-button and top-bar specs (lines ~220, ~237) also still name Atkinson.
- Four rules exist only in the mockups and need adding to the steering:
  - the fit-scale formula + `≥0.9` Maker clamp + uncapped player;
  - the sized-wrapper rule (layout box = 820×640 × scale, origin top-left);
  - the global `button, input, select, textarea { font: inherit; color: inherit }` reset;
  - rings outside the card's clip (`overflow: visible`).

  Without them the first UI pass will reproduce the Round 1/2 bugs.

**P1-3. The score decorators read as menu icons (new).**
- The "dash-bursts" in play/play-wrong/play-flash-back/play-end are three *parallel horizontal* strokes, which is the universal hamburger icon. Next to "Score 3" on a touchscreen it says "tap for menu", and the player has no menu.
- Fix: make the strokes **radiate**, as in the approved reference: three 10 px strokes at −35°, 0°, +35° fanning outward from the word (mirrored on the right), 3 px, paper colour. Or drop the decorators. Either way there should be no parallel lines.

**P2-4. Storyboard text is too small for its job (it exists for the video).**
- At 1920 each card renders at about 0.6, so "Card 3 of 10" is ~12 px and the "Drag to move" tab and "✓ Right answer" tag are ~11 px. The cards also use only the middle third of the frame.
- Use the free vertical space: scale to `min((1920 − 3×48 − 300)/2/820, (1080 − 56 − 200)/640)` ≈ 0.9, captions above.
- On frame 2 the stamp's lower border still touches the top of "Dublin" at this scale. Nudge it to `top:-30px` for the storyboard.

**P2-5. editor-new-card: the "editor behind the modal" claim isn't true in the pixels.**
- The `.ghost-stack` (620×466) is smaller than the picker (760×~520) and sits exactly behind it, so the backdrop is still a flat muddy brown (#7D6F66 after the 45 % ink scrim on the desk).
- Render the real editor (card list, desk with card 3, toolbar) behind the scrim, and anchor the picker near "+ Add Card" or centre it over the desk. Then the "after card 3" context is visible.

**P2-6. Card-list rows still truncate to about two words** ("Who saile…", "Last car…"). The two-line rows / 240 px widening from Round 2 were not done. A teacher can't tell cards 1, 2, 6, 7 and 8 apart. Two-line rows: number + icon on line 1, the first six words on line 2.

**P2-7. Small edges.**
- **Narrow screens:** at 1024×768 (common on older school laptops and projectors) the editor's 0.9 clamp makes the card overflow the canvas and get cut on both sides. The stated target is 1366, so this isn't a blocker. Below 1200 px wide, collapse the card list into a drawer and the inspector into a bottom sheet.
- **editor-try:** the toolbar (Add Text / Button / Picture / Link) stays fully active while trying. Dim it to 40 % with `aria-disabled` during Try It, so it's clear that editing is paused.
- **editor-drag:** the "Snapping to the line" tab overlaps the descenders of "841?". Lift the tab 8 px or show it below the tile while dragging.
- **play-flash-back:** body at 26/40 drifts off the 32 px rules. Use a line-height of 32 or 64 px, or accept the drift and remove the rules under the body.
- **Shot hygiene:** the committed `start-generating` shot was captured mid-animation (a translucent double card). Shoot with `--virtual-time-budget=3000` or reduced motion, so the README and Devpost images don't show a glitch.

### Ready for UI code?
**Yes, after P0-1 and P0-2.**
- The design language, every state and the WOW moment are now decided and drawn to a standard that holds up against strong entries.
- What's left is either a compliance fix that must land before anything ships (P0-1), a spec sync that keeps the code from regressing (P0-2), or polish that belongs in the components (P1–P2).

Remaining fixes, in order:
1. Rewrite the Atkinson subset name tables to "Stackyard Reading" (and in the export build). Keep the OFL file verbatim and move the notes to `fonts/README.md`.
2. Sync design-system.md: meta 20, Stackyard Reading in all type rows, fit-scale + sized wrapper + control reset + ring overflow rules.
3. Radiating score decorators (no parallel lines).
4. start-empty peek `right:-232px`, question replaced by a meta line.
5. Storyboard at about 0.9 scale with the stamp nudged; re-shoot all with animations settled.
6. Two-line card-list rows; real editor behind the new-card modal.
7. Try It toolbar disabled state; drag tab offset; flash-back line rhythm; drawer layout under 1200 px.

With 1–3 done the set is at **8.0** and passes the bar. With all seven, about 8.4.

---

## Round 4 — what changed (2026-11-04)

The two blockers from the Round 3 verdict (P0-1 font name table, P0-2 steering
sync) plus the open polish items were worked through. Fonts were inspected with
fontTools; every changed screen was re-rendered with headless Chrome at
**1366×768** and **1920×1080** into `docs/design/maker/shots/` (with
`--virtual-time-budget=3000` so animations settle) and looked at. The repo
stays self-contained and offline (grep confirms no external resource URLs in
the changed mockups — only SVG `xmlns`).

**1. Reserved Font Name is now gone from inside the font files (P0-1).**
- `scripts/rename-reading-font.py` rewrites the Atkinson subset name table to
  **Stackyard Reading** on every platform/encoding: family (ID 1), unique ID
  (3), full name (4), PostScript name (6), and typographic names (16/17) where
  present; the version string (5) is scrubbed of the reserved tokens. The
  copyright (ID 0) and licence records (13/14) are preserved verbatim, as the
  OFL requires. It verifies by reading the table back, and also accepts explicit
  paths so the **export build cleans whatever font it inlines** (wired as
  `npm run fonts:rename` / `fonts:check`).
  - Needs `pip install --user fonttools brotli` (fonttools reads/writes the name
    table; brotli lets it de/recompress woff2). Both were installed in this env.
  - Ran it on `reading-400.woff2` and `reading-700.woff2`. Read back with
    fontTools: family/full/PostScript/unique all now read `Stackyard Reading …`;
    copyright still `Braille Institute`. `--check` reports both clean.
- New test `tests/font-name.test.ts` parses the woff2 `name` table straight out
  of the binaries (pure Node, built-in brotli — no new dependency) and asserts
  **no user-facing name record contains "Atkinson"/"Hyperlegible"**, that the
  family is `Stackyard Reading`, and that the OFL copyright line survives. Part
  of `npm test`; 6/6 green, full suite still 317/317.
- The Stackyard "NOTE ON THIS COPY" was moved out of
  `OFL-AtkinsonHyperlegible.txt` (now kept **verbatim**) into a new
  `docs/design/maker/fonts/README.md`, which states the subset is a **Modified
  Version under the OFL** and documents the rename of both the CSS family and
  the name table.

**2. Steering synced to the mockups (P0-2).**
- `design-system.md` type scale: `--text-meta` **18 → 20**; the tile/body/meta
  rows now name **Stackyard Reading** (not Atkinson), with a note to use that CSS
  family name only. The Export-button and top-bar specs were corrected the same
  way.
- A new **Card scaling & layout** section adds the four rules that lived only in
  the mockups: the fit-scale formula (+ `≥0.9` Maker clamp, uncapped player), the
  sized-wrapper rule (layout box = 820×640 × scale, origin top-left), the global
  `button, input, select, textarea { font: inherit; color: inherit }` reset, and
  rings outside the card's clip (`overflow: visible`). The Card anatomy ring note
  points at the overflow rule.

**3. Player score decorators no longer read as menu/arrow icons (P1-3).**
- The three parallel strokes (hamburger) are replaced on play / play-wrong /
  play-flash-back / play-end with an **outward-fanning burst**: three short
  ink-on-navy strokes spread at roughly −35° / 0° / +35°, mirrored each side of
  "Score N". They do not share a vertex, so they read as a small dash-burst, not
  a chevron. Checked at 1920 and 1366.

**4. start-empty peek (P2 / coordinator item).**
- The peek card shifted right (`right:-200 → -232`) so both right-column tiles
  (◆ Cork, ■ Sligo) show **whole**, with their shapes clear of the sentence
  card's edge — no half-cut shapes at 1366 or 1920. The cut question is replaced
  by a meta line ("Card 3 of 10") that can't be cut mid-word.

**5. The other open items.**
- **New-card picker (P2-5):** the real editor now renders **behind the scrim** —
  card list (card 3 selected), the desk, and the bottom toolbar incl. a red
  Export File — so the "after card 3" context is visible instead of flat brown.
- **Card-list rows (P2-6):** every editor screen now uses **two-line rows** —
  number + ink kind icon + drag grip on line 1, the card's first words on line 2
  (clamped to two lines). The two baked-in-ellipsis labels were expanded to full
  phrases. Cards 1–10 are now tellable apart.
- **Storyboard text (P2-4):** `editor-try-storyboard.html` now scales both beats
  to **0.9** (meta 20 × 0.9 = 18 px, the floor) inside the sized wrappers, so
  "Card 3 of 10", the "Drag to move" tab and the "✓ Right answer" tag are all
  readable in a video frame; both cards fit side by side at 1920 without
  clipping, captions as ink-on-paper pills. The beat-2 CORRECT stamp is nudged to
  `top:-30px` so it clears the Dublin label at this larger scale.
- **Shot hygiene:** `start-generating` was re-shot settled (virtual-time budget) —
  the top card shows rings, its real question and the four quiz tiles with
  "4 of 10"; no mid-animation double card.

All changed screens render cleanly at both sizes; the shots in
`docs/design/maker/shots/` were refreshed. Not addressed this round (left for the
component pass, as the verdict allowed): the editor-try Try-It toolbar
disabled state, the editor-drag snap-tab descender overlap, play-flash-back line
rhythm, and the <1200 px drawer layout.
