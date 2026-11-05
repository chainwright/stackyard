# Stackyard — Design System

## Concept: Stamp Pad

The UI looks like a physical notepad on a wooden desk.
Cards are white paper with faint ruled lines and two metal ring holes at the top.
Three offset card edges peek out behind the current card, giving depth.
Answer tiles are chunky, flat-colour rectangles — like coloured card stock.
The only red is the rubber stamp — an ink stamp the pupil or teacher *earns*. It appears in exactly five places: the "CORRECT ✓" overlay, the wrong-answer "✗" stamp, the "EXPORTED ✓" stamp, the end-card stamp collection, and the Export button. (See the five-role list under Colour usage rules.) Everything else uses the ink-on-paper palette.

---

## Colour tokens

| Token              | Hex       | Usage                                                                 |
|--------------------|-----------|-----------------------------------------------------------------------|
| `--color-paper`    | `#FBF8F1` | Card background, app shell background                                 |
| `--color-ink`      | `#1E2A47` | All body text, headings, icons, borders, focus rings                  |
| `--color-rule`     | `#C9D3E3` | Ruled lines on cards (1px horizontal, every 32px)                     |
| `--color-stamp`    | `#CE3926` | Earned stamps (CORRECT ✓, wrong ✗, EXPORTED ✓, end-card collection) + Export button only |
| `--color-tile-a`   | `#F2735F` | Answer tile A — coral                                                 |
| `--color-tile-b`   | `#F6C744` | Answer tile B — sun yellow                                            |
| `--color-tile-c`   | `#26A69A` | Answer tile C — teal                                                  |
| `--color-tile-d`   | `#1E2A47` | Answer tile D — navy (same as ink)                                    |
| `--color-white`    | `#FFFFFF` | Text on tile D (navy) only; ring hole fill; card surface highlights   |

### Colour usage rules

- `--color-stamp` is reserved for an ink stamp the pupil or teacher *earns*, plus the Export button. It appears in exactly these five places and nowhere else:
  1. the rubber-stamp "CORRECT ✓" overlay (the class earns it),
  2. the wrong-answer "✗" stamp,
  3. the "EXPORTED ✓" stamp on the export-done screen,
  4. the end-card stamp collection (one earned stamp per correct answer),
  5. the Export button.
- Not allowed in stamp red: the editor's right-answer marker and the inspector's "right answer" tick. These are an editing state, not something earned, so they use `--color-ink` (navy). Mark the right answer in the editor with a navy tag ("✓ Right answer", white text on `--color-ink`), never red.
- Tile text colour: white (`#FFFFFF`) on tile D (navy); ink (`#1E2A47`) on tiles A, B, C.
- Never use `--color-stamp` as a general accent, link colour, or hover state.
- Background of the app shell (behind the card stack) is `--color-paper` with a subtle warm shadow, not a photograph or texture image.

### Contrast

All text/background pairs must pass WCAG AA (4.5:1 for normal text), checked with the WCAG relative-luminance formula. Re-test mockups on a real projector before shipping.

| Foreground           | Background        | Measured ratio | Result      |
|----------------------|-------------------|----------------|-------------|
| ink on paper         | #1E2A47 / #FBF8F1 | 13.40          | ✓ passes AA |
| ink on tile A        | #1E2A47 / #F2735F | 5.00           | ✓ passes AA |
| ink on tile B        | #1E2A47 / #F6C744 | 8.92           | ✓ passes AA |
| ink on tile C        | #1E2A47 / #26A69A | 4.74           | ✓ passes AA |
| white on tile D      | #FFFFFF / #1E2A47 | 14.21          | ✓ passes AA |
| stamp red on paper   | #CE3926 / #FBF8F1 | 4.67           | ✓ passes AA |
| white on stamp red   | #FFFFFF / #CE3926 | 4.96           | ✓ passes AA |

The CORRECT ✓ and wrong ✗ stamps sit **over the paper**, straddling the chosen
tile's top edge on the label side — never over the answer word and never over
another tile. That keeps the stamp on the 4.67:1 paper pairing above and leaves
the tile label readable. Do not measure stamp red over a tile colour (e.g. red
over coral under `mix-blend-mode: multiply` is ~2.1:1 and fails); the placement
rule exists precisely to avoid that.

---

## Shape tokens (answer tiles)

Shape icons are inline SVG, not emoji or icon fonts.
Each shape is paired permanently with its tile colour — never swap them.

| Tile | Colour  | Shape   | SVG description                              |
|------|---------|---------|----------------------------------------------|
| A    | coral   | ▲       | Equilateral triangle, pointing up            |
| B    | sun     | ◆       | Rotated square (diamond), 45°                |
| C    | teal    | ●       | Circle                                       |
| D    | navy    | ■       | Square (unrotated)                           |

Shape size on a tile: 28px × 28px. Rendered at 2× for retina.
Shape always appears to the left of the label text, with 12px gap.
Shape colour matches tile text colour (ink on A/B/C; white on D).

---

## Typography

### Fonts

Both fonts are under the SIL Open Font License 1.1 and must be self-hosted as woff2 subsets.
No CDN links anywhere — not in the Maker app, not in the exported file.
Include Latin subset only (U+0020–U+007E, U+00A0–U+00FF) to keep file size small.

| Role     | Family (CSS `font-family`) | Subset of           | Weights loaded |
|----------|----------------------------|---------------------|----------------|
| Headings | `Bricolage Grotesque`      | Bricolage Grotesque | 700, 800       |
| Body     | `Stackyard Reading`        | Atkinson Hyperlegible | 400, 700     |

Download sources:
- Bricolage Grotesque: https://fonts.google.com/specimen/Bricolage+Grotesque
- Atkinson Hyperlegible: https://fonts.google.com/specimen/Atkinson+Hyperlegible

**Reserved Font Name.** Atkinson Hyperlegible reserves the names "Atkinson" and
"Hyperlegible". A Latin subset is a Modified Version under the OFL and may not
present a Reserved Font Name, so the body subset is referenced under the
non-reserved family name `Stackyard Reading` (outlines unchanged, codepoints
reduced). Bricolage Grotesque declares no Reserved Font Name and keeps its name.

Font files live at `src/assets/fonts/` in the Maker app, each beside its
`OFL-*.txt` (full licence text with the copyright line).

**The exported HTML must carry the font notice.** When the player runtime
inlines the two subsets as base64 data URIs inside the exported `<style>`
block, it must also inline, as a CSS comment immediately above each
`@font-face`, the font's copyright line, "SIL Open Font License 1.1", and the
upstream source URL — so the notice travels with the font in every
self-contained file, as the OFL requires. The same `OFL-*.txt` files ship with
the repo (see README "Third-party assets").

### Type scale (800 × 600 card canvas)

| Token              | Size  | Family              | Weight | Usage                              |
|--------------------|-------|---------------------|--------|------------------------------------|
| `--text-question`  | 44px  | Bricolage Grotesque | 800    | Quiz/flash question text           |
| `--text-tile`      | 32px  | Atkinson Hyperlegible | 700  | Answer tile labels                 |
| `--text-body`      | 22px  | Atkinson Hyperlegible | 400  | Story card body, flash card back   |
| `--text-meta`      | 18px  | Atkinson Hyperlegible | 400  | "Card 3 of 10", score display      |

**Hard floor:** no rendered text on any card may be smaller than 18px.
Line height: 1.3 for headings, 1.5 for body.
Letter spacing: 0 (do not fake tracking on Bricolage).

### App shell typography (Maker and Player chrome)

The shell (toolbar, score header, title bar) uses the same fonts scaled down proportionally.
Minimum size in the shell is also 18px.

---

## Spacing & sizing

| Token              | Value  | Usage                                      |
|--------------------|--------|--------------------------------------------|
| `--radius-card`    | 10px   | Card paper corners                         |
| `--radius-tile`    | 12px   | Answer tile corners                        |
| `--radius-button`  | 10px   | All other buttons (toolbar, nav)           |
| `--tile-min-height`| 56px   | Answer tiles must be at least this tall    |
| `--rule-gap`       | 32px   | Spacing between ruled lines on card        |
| `--ring-offset`    | 4px    | Step between stacked card-edge layers      |
| `--card-shadow-offset` | 4px per layer | Three shadow cards behind active card |

Tile grid: two columns, two rows, with 16px gap between tiles.
Tiles fill available width within the card canvas (each ~50% minus gap).

---

## Card anatomy

```
┌──────────────────────────────────────┐  ← card radius 10px
│  ○                    ○              │  ← two metal ring holes, centred top
│  ─────────────────────────────────── │  ← rule line (#C9D3E3, 1px)
│  Card 3 of 10                        │  ← --text-meta
│  ─────────────────────────────────── │
│  Where did the Vikings build         │
│  a town in 841?                      │  ← --text-question, Bricolage 800
│  ─────────────────────────────────── │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ ▲  Dublin    │  │ ◆  Cork      │  │  ← tiles, --radius-tile
│  └──────────────┘  └──────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  │
│  │ ●  Galway    │  │ ■  Sligo     │  │
│  └──────────────┘  └──────────────┘  │
└──────────────────────────────────────┘
   ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ← card edge layer 1 (+4px)
    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ← card edge layer 2 (+8px)
     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    ← card edge layer 3 (+12px)
```

Ring holes: 20px diameter circles, `--color-white` fill, 1px `--color-rule` stroke.
Rule lines: 1px horizontal lines at every 32px interval, `--color-rule`, full card width.
Card edges: three `<div>` layers behind the card, each `--color-paper` with slightly darker
border, offset by `--ring-offset` steps downward and to the right.

---

## Rubber stamp feedback

Triggered on answer selection; renders as an SVG overlay on the chosen tile.

**Correct answer:**
- Text: `CORRECT ✓`
- Colour: `--color-stamp` (#CE3926)
- Font: Bricolage Grotesque 800, ~28px, all caps
- Transform: `rotate(-8deg)`
- Border: 3px solid `--color-stamp`, border-radius 4px, padding 4px 8px
- Appearance: stamped-ink look — slightly uneven opacity (0.92), no drop shadow
- Placement: straddles the tile's **top edge on the label side**, mostly over the
  paper above the tile (`top: -24px; left: 64px`). Never over the answer word,
  never crossing the gutter into the next tile.

**Wrong answer:**
- The tile shakes first (see Motion).
- After the shake settles, a ✗ stamp in `--color-stamp` at **100% opacity**
  (not 40% — a faint mark fails AA over a tile colour and is invisible on a
  washed-out projector), ~44px, boxed like the CORRECT stamp, straddling the
  tile's **top edge** over the paper — the same placement as CORRECT, so it
  reads on the 4.67:1 paper pairing.

Stamp (red) is never used outside the five earned-stamp roles (CORRECT ✓, wrong ✗,
EXPORTED ✓, end-card stamp collection) and the Export button.

---

## Export button

The single place `--color-stamp` appears in the Maker toolbar.

```
background:  --color-stamp  (#CE3926)
color:       --color-white  (#FFFFFF)
border:      none
border-radius: --radius-button (10px)
padding:     12px 24px
font:        Atkinson Hyperlegible 700, 18px
icon:        download arrow SVG (white), inline, 20px × 20px
label:       "Export File"
```

Hover state: darken by 8% (`#B8321F`). No glow, no shadow bloom.
Focus state: 3px solid `--color-ink` offset 2px (standard focus ring, see Accessibility).

---

## Maker app shell

The Maker app wraps the card canvas with a minimal chrome:

**Top bar:**
- Background: `--color-ink` (#1E2A47)
- Logo text: "Stackyard", Bricolage Grotesque 800, `--color-paper`, ~24px
- Stack description text: Atkinson Hyperlegible 400, `#E0E6F0`, 18px (contrast 11.34 on navy — passes AA)

**Bottom toolbar:**
- Background: `--color-paper`
- Border-top: 1px `--color-rule`
- Tool buttons (Text, Button, Picture, Go to card…): ink text, `--color-paper` background,
  `--radius-button`, minimum 44px hit target
- Export button: rightmost, `--color-stamp` (see above)

**Card canvas area:**
- Background: warm mid-tone (suggest `#D4C9B0` — a desk-surface tone, not in the token set,
  used only as the canvas backdrop, never on cards or UI chrome)
- Card stack centred in this area

---

## Player shell (exported file)

**Top bar:**
- Background: `--color-ink`
- "Stackyard" wordmark: Bricolage Grotesque 800, `--color-paper`
- Score: `≻ Score 3 ≺` style, same font, right-aligned
  - The `≻` / `≺` decorators are plain text characters, not icons
- No editing controls; no menus; no buttons except those on the card itself

**No bottom toolbar.**

---

## Motion

All transitions respect `prefers-reduced-motion: reduce`.
When reduced motion is active, replace all animations with an instant opacity cross-fade (100ms).

### Card advance — flip up from ring edge

```css
/* Exiting card */
@keyframes card-exit {
  from { transform: rotateX(0deg);   opacity: 1; }
  to   { transform: rotateX(-90deg); opacity: 0; }
}

/* Entering card */
@keyframes card-enter {
  from { transform: rotateX(90deg);  opacity: 0; }
  to   { transform: rotateX(0deg);   opacity: 1; }
}
```

- Duration: 240ms
- Easing: ease-out
- Perspective on parent: 1200px
- Transform origin: top centre (the ring edge)

### Correct-answer stamp land

```css
@keyframes stamp-land {
  0%   { transform: rotate(-8deg) scale(1.4); opacity: 0; }
  60%  { transform: rotate(-8deg) scale(0.92); opacity: 1; }
  80%  { transform: rotate(-8deg) scale(1.04); }
  100% { transform: rotate(-8deg) scale(1.0);  opacity: 1; }
}
```

- Duration: 120ms
- Easing: ease-out
- Sound cue: `"cheer"` action fires simultaneously

### Wrong-answer tile shake

```css
@keyframes tile-shake {
  0%   { transform: translateX(0); }
  20%  { transform: translateX(-6px); }
  40%  { transform: translateX(6px); }
  60%  { transform: translateX(-6px); }
  80%  { transform: translateX(6px); }
  100% { transform: translateX(0); }
}
```

- Duration: 180ms
- Easing: ease-in-out
- Iteration count: 1 (two full 6px oscillations)
- Sound cue: `"buzz"` action fires simultaneously

### Reduced motion fallback

```css
@media (prefers-reduced-motion: reduce) {
  .card-exit, .card-enter { animation: none; opacity: 1; transition: opacity 100ms; }
  .stamp-land             { animation: none; }
  .tile-shake             { animation: none; }
}
```

---

## Accessibility

- **Focus ring:** 3px solid `--color-ink` (#1E2A47), offset 2px. Applied to every interactive
  element (tiles, buttons, toolbar items). No custom outline suppression without replacement.
- **Shape + colour:** Every answer tile always shows both its shape icon and its colour.
  Neither alone conveys the answer identity.
- **Minimum touch/click target:** 44px × 44px on all interactive elements. Tiles are at minimum
  56px tall and stretch to full column width — always exceed this.
- **Alt text:** Every `ImageElement` must have a non-empty `alt` string. The editor enforces
  this before export.
- **Stamp text:** The "CORRECT ✓" stamp overlay must also be conveyed via `aria-live="polite"`
  on a visually hidden region, not only as a visual SVG.
- **Colour contrast:** See verified pairs in the Colour tokens section. Re-verify any
  new combination before shipping.
- **Font size floor:** 18px minimum everywhere, supporting low-vision pupils on old projectors.

---

## Banned patterns

The following are explicitly forbidden. If a code review or design review spots any of these,
reject the change.

| Banned                                      | Reason                                      |
|---------------------------------------------|---------------------------------------------|
| Beige + editorial serif (e.g., Playfair)    | "Content site" look, not classroom energy   |
| Dark background + gold accent               | Luxury SaaS look                            |
| Purple gradients                            | Generic AI-product aesthetic                |
| Glassmorphism (backdrop-filter: blur)       | Performance, distracting, off-brand         |
| Glowing orbs / radial gradient blobs        | AI default look                             |
| Inter, Roboto, Poppins                      | Default system-font feel, not distinctive   |
| Sparkle / star / magic-wand icons (✨ 🪄)   | AI-product cliché                           |
| Chicago bitmap font or striped title bars   | Classic Mac pastiche — wrong era, wrong feel|
| Hand/pointer cursor used decoratively       | Classic Mac pastiche                        |
| `--color-stamp` used outside its five earned-stamp + Export roles | Dilutes the stamp metaphor        |
| External font CDN links in any output file  | Breaks offline use; violates tech.md        |
| `box-shadow` glow (blur > 4px, spread > 0) | Glassmorphism-adjacent                      |

---

## Implementation checklist (for every new UI surface)

- [ ] Fonts loaded from `src/assets/fonts/`, not CDN
- [ ] All text ≥ 18px
- [ ] Answer tiles ≥ 56px tall, shape icon present alongside colour
- [ ] `--color-stamp` appears only on earned stamps (CORRECT ✓, wrong ✗, EXPORTED ✓, end-card stamp collection) and the Export button; editor right-answer markers use `--color-ink`
- [ ] Focus ring: 3px solid `--color-ink`, offset 2px
- [ ] Motion animations wrapped in `prefers-reduced-motion` media query
- [ ] Contrast checked with WCAG relative-luminance formula for every new colour pair
- [ ] No banned fonts, no banned patterns
- [ ] Exported file: fonts inlined as base64 data URIs in `<style>` block
