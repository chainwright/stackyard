# Stackyard — Product

## What it is

Stackyard is a tool that turns a single sentence into a set of interactive lesson cards.
A teacher describes what they want ("a 10-card quiz about the Vikings in Ireland, the right answer plays a cheer") and Stackyard builds it instantly.
The teacher can then edit any card — move buttons, change text, wire up simple actions — and export everything as one self-contained HTML file.
That file runs offline on any old laptop, with no internet connection and no account required.

Inspired by HyperCard.

## The one key moment

> Sentence → working stack → edit → one offline file → class plays it.

Every design decision should make that path faster and more reliable.

## Roles

**Maker** — the teacher. Creates stacks, edits cards, exports the file.
The Maker uses the Stackyard web app (requires internet once, to generate and edit).

**Player** — the class (pupils). Opens the exported HTML file locally.
The Player sees only the cards — no editing tools, no menus, no accounts.
The last card shows the score.

## Persona

Ms. Aoife Brennan, 4th-class teacher at a small national school in County Cork.
She has patchy classroom Wi-Fi, a mix of old laptops, and no interest in learning to code.
She needs something that works the first time, every time, without help from IT.

## Card types

| Kind  | Description                                   |
|-------|-----------------------------------------------|
| quiz  | Question with multiple-choice answers         |
| flash | Term on the front, explanation on the back    |
| story | Text + branching buttons ("go to card N")     |
| end   | Final card, shows the score                   |

## Out of scope

- No user accounts or sign-up
- No cloud save or sync
- No analytics or tracking
- No collaborative editing
- No native app or app-store distribution
- No audio beyond a simple cheer/buzz sound on answer
- No curriculum database or content library
