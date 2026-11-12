# Judging Stackyard in 3 minutes

Category: Resurrection (HyperCard, 1987). You need a laptop browser: nothing to install, no account. (On a phone the lesson files play, but the Maker asks for a laptop or tablet.)

- Live app: https://stackyard-sdqt.onrender.com (a paid Render instance, so it stays awake)
- A ready-made lesson file: https://stackyard-sdqt.onrender.com/samples/vikings-in-ireland.html
- Video (2:55): https://youtu.be/x6W2BzhpAyU

## 0:00–0:45 · Make a lesson from one sentence
1. Open the live app, type a sentence such as `A 6-question quiz on the water cycle for 4th class, two flash cards and a short choose-your-path story about a raindrop`, and press **Build Cards**.
2. **Look for:** the cards deal in one by one while the model writes them, and the editor opens, usually within 10–20 s. Every card is format-checked before you see it.
3. Click a wrong answer on a quiz card. **Look for:** the panel's **Swap this wrong answer** list. It makes no model call, and one Undo puts the old answer back.

If the model is busy or the day's model calls are used up, the app hands you a ready-made deck and says so. The rest of the path is the same.

## 0:45–1:30 · The file works with the Wi-Fi off
4. Choose **Export for class** (the play-only file; the default, **Living file**, also carries a Teacher tab) and press **Export File**. One `.html` file downloads.
5. Turn the Wi-Fi off. Open the file from your Downloads folder, open DevTools (F12) → **Network**, and reload.
6. **Look for:** the lesson plays, and the Network tab lists no http or https request, only the file itself. Answer to the end: the last card shows the score and a short results code.

## 1:30–2:30 · The file edits itself and collects class results
7. Open the ready-made lesson file (link above). Play it to the last card and copy the results code.
8. Press **Teacher** in the corner, then **Class Results**. Paste the code and press **Add Codes**. **Look for:** a row per question (right, wrong, not reached), the middle score and the questions to revisit. The code is typed in, so nothing is uploaded.
9. Still in the Teacher tab, change a word on a card and press **Save a Copy**. **Look for:** a new file, `<title> (copy).html`, that plays and can edit itself too.

## 2:30–3:00 · How Kiro built it
10. In the repo, open `.kiro/`: the steering, the specs, the hooks, the `lesson-checker` agent and the MCP config. Two files show it best: `.kiro/specs/class-results/requirements.md` (EARS requirements written before the code) and `docs/kiro-sessions/README.md` (hook firings counted from Kiro's own session store).
11. Every number we state, and the command that reproduces it, is in [EVIDENCE.md](EVIDENCE.md). Every claim in the README, the write-up and the blog, with its status, is in [CLAIMS.md](CLAIMS.md).

## With a terminal (optional)
Node 24 or later:
```sh
git clone https://github.com/chainwright/stackyard && cd stackyard
npm ci
npm test               # 1,514 tests pass
npm run check:trace    # 206 of 206 lettered task ids traced
npm run check:claims   # every number in the README, the write-up and EVIDENCE.md, against the code
```
`npm run pre-submit` runs every gate. The browser gates need a local Chrome or Chromium; without one they say so and skip.

## What this path does not show
No teacher or class has used Stackyard yet, the answer keys were reviewed by AI rather than by a teacher, and Kiro was used through the CLI only. The details are in [EVIDENCE.md](EVIDENCE.md#not-proven).
