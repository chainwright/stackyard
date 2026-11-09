> This was run on 6 Nov, on the files exported for the v2 video, before TASK-29/30, with Playwright's engine builds. `cross_browser.py` and `result.json` sit next to this file.

# Cross-browser run of the exported lesson files (06.11.2026, for judge item P1-4)

**What was tested**
- The files exported from the live app in take `live_maker3`, i.e. the files used in the v2 video: `raw/exports_live_maker3/The-water-cycle-4th-class-quiz-flash-cards-and-a-raindrop-story-class.html` and the living file next to it.
- They were copied to `scratch/xb2/` for the run.
- Script: `tools/cross_browser.py`. Raw result: `scratch/xb2/result.json`. An earlier run on the v1 exports (`scratch/xb1/result.json`) gave the same result: all three passed.

**How each browser was run**
- Each browser engine is Playwright's own build, headless, at a 1366×768 viewport. Each file is opened from disk (`file://`).
- **Network off** means every http/https request is aborted by the test. Chromium and Firefox are also put into offline emulation.
- WebKit is not put into offline emulation, because that refuses every `file://` load ("WebKit encountered an internal error"). That's a Playwright emulation quirk, not a Stackyard bug. The request counter still shows 0 requests.

**Each run:**
1. The class file is played to the score card. It clicks the right answer on every quiz, flips both flash cards, and takes the first story choice.
2. The living file: Teacher tab → card 3 → "Rain clods" retyped as "Rain clouds" (the card changes).
3. **Save a Copy.** A real download event. The `.html` file is saved to disk.
4. The copy is opened from disk. The test checks for exactly 1 Teacher tab and no editor overlay, that the edit is in its data, and that it plays to the score card.

| Browser | Version | Network off | Class file plays to score | Edit shows on card | Save a Copy → file | Copy opens in Play | Copy keeps the edit | Copy plays to score | Requests | Page errors | Result |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | 148.0.7778.96 | all http/https aborted + offline emulation | yes | yes | (copy).html · 169.1 KB | yes | yes | yes | 0 | 0 | **PASS** |
| firefox | 150.0.2 | all http/https aborted + offline emulation | yes | yes | (copy).html · 169.1 KB | yes | yes | yes | 0 | 0 | **PASS** |
| webkit | 26.4 | all http/https aborted | yes | yes | (copy).html · 169.1 KB | yes | yes | yes | 0 | 0 | **PASS** |

**Result: all three engines pass every check, with 0 network requests and 0 page errors.**

**Limits (stated plainly):**
- These are Playwright's engine builds, not the branded browsers. **WebKit ≠ Safari.app**: the download and file-access behaviour of real Safari, including its sandbox prompts, was not tested. **Edge was not run separately.** It uses the Chromium engine, which passes.
- Only macOS was used, with no Windows or ChromeOS laptop. There was no touch input, and the files were not opened from a USB stick.
- Under the rule the coordinator set, the VO keeps "any laptop" ("The class opens it on any laptop, with nothing to install"). A cautious reading would add a real Safari and Windows Edge check before submission.
