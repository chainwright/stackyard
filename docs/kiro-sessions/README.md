# Excerpts from real Kiro sessions

Short, unedited excerpts from the Kiro session that built Stackyard (vibe mode), so you can see the Kiro features working. Paths are trimmed to the repository; nothing else is changed. The full running log is [`../KIRO_LOG.md`](../KIRO_LOG.md).

## 1. The TASK-26 prompt (first 1,800 characters)

Sent at 2026-11-06T00:24:38Z. One prompt; the session then ran 175 tool calls and finished at about 01:45Z.

```text
TASK-26: fixes from the round-2 review panel on the LIVE app with real generation (5 Nov evening). Read fully first: judge_2026-11-05_r2/J1_official.md, J2_teacher.md (if present), J3_wow_design.md, J4_engineering.md, J5_hound.md (screenshots in shots_j*/ next to them). Spec first (TASK-26 a–n in the right spec files, with acceptance criteria), then code, then tests that would have caught each bug. Keep every test green; do not commit.

P0 — broken flows:
a) Save a Copy saves the live DOM (src/living/saveCopy.ts:45 outerHTML) incl. the open editor → the copy opens on a frozen editor with dead buttons, two Teacher tabs, and grows each save (147→171→… KB). Fix: snapshot the pristine document at start-up (src/living/index.ts) and only replace #stack-data in that snapshot. Tests must exercise the REAL save path in jsdom AND scripts/check-living-file.ts must click Play in the reopened copy and assert it plays (not just that the edited text exists somewhere), and that three saves in a row give identical size.
b) Generated flash cards dead-end: the model returns a flash card with one text and a Next button; it never flips and Next exists only on the back → the class is stuck. Fix at every layer: prompt rule (front term + back explanation, two texts), server normalisation of model output (repair or convert a malformed flash card), player always draws a way forward, and a validator/reachability check "every card can move forward"; property test over random stacks + a test with the exact malformed shape.
c) Text overlap on generated cards: the model's layout (text at y=40) is used as-is, so the question prints over "Card N of M", long questions run into the answers, the stamp lands on both. Fix: lay out generated quiz/flash/story cards from the template (fixed safe areas, fit-tex
```

## 2. Hook firings recorded by Kiro

Five `ContextualHookInvoked` records from the same session, 2026-11-06, after small real edits. Taken from the session's `messages.jsonl`:

```text
2026-11-06T01:37:44.984Z  export-regression-check.json  completed
2026-11-06T01:37:45.554Z  invariants-on-save.json  completed
2026-11-06T01:37:46.292Z  invariants-on-save.json  completed
2026-11-06T01:37:46.293Z  ready-made-content-check.json  completed
2026-11-06T01:37:48.377Z  living-file-gate.json  completed
```

The `pre-submit` hook is a `PostTaskExec` hook (it fires when a spec task is marked done; `Manual` is not used, because kiro.dev lists it as not invocable). It has not been recorded firing in a Kiro session; the same gate runs on demand as `npm run pre-submit` or by including the `pre-submit` steering file.

## 3. The lesson-checker agent reviewing the ready-made decks

The custom agent in [`.kiro/agents/lesson-checker.md`](../../.kiro/agents/lesson-checker.md), run as a sub-agent on 2026-11-05 (first 1,800 characters of its report):

```text
Acting as **lesson-checker** (read-only; I reviewed the content a child reads, not code). I read the persona file and all three deck builders in `src/shared/readyMadeStacks.ts`. No files were edited.

Note on mechanics: the "correct" answer is the button whose actions include `{type:"score",delta:1}`. In `quizCard(...)` that is the option at `correctIndex`, which is passed as `0` for every quiz — i.e. the **first** label in each answer array (tiles are shuffled at render time, but the first listed label is the intended correct one). I checked against that.

=====================================================================
DECK 1 — Vikings in Ireland
=====================================================================
Verdict: Mostly solid and factually accurate. One genuinely ambiguous quiz card that should be fixed, plus one minor wording nitpick. Facts, flash backs and the story branch all check out.

Findings (prioritised):

1. [Vikings] [c9 — "What did the Vikings trade in Dublin?" → correct: "Silver"; distractors: "Wool", "Salt", "Amber"] — **Ambiguous: more than one answer is true.** The Vikings of Dublin genuinely traded all four of these — silver (famously), wool/cloth, salt, and amber were all real Dublin trade goods. A bright pupil can correctly defend any option, but only "Silver" scores. → Suggested fix: change the three distractors to things the Vikings did NOT trade in Dublin, so only "Silver" is defensible. e.g. `["Silver", "Oranges", "Tea", "Chocolate"]` (all post-medieval / not available), or reframe the question to "Which precious metal did the Vikings trade in Dublin?" with `["Silver", "Tin", "Lead", "Copper"]`.

2. [Vikings] [c2 — "What is a longship?" → "A fast boat"] — Minor: the correct answer is a loose definition. A longship was specificall
```

## 4. TASK-28: hooks fire when the agent edits with its file tools (6 Nov)

In the TASK-28 session, source files were edited with `fs_write` / `str_replace` (rule added to `.kiro/steering/tech.md`), and the new `PostToolUse` hook on `execute_bash` re-runs the invariants after shell edits. The session store (`messages.jsonl`) recorded, for that one session: 71 `invariants-after-shell-edit`, 12 `invariants-on-save` and 7 `living-file-gate` `ContextualHookInvoked` records, all `completed`. First of each:

```text
2026-11-06T17:36:45.575Z  invariants-after-shell-edit.json#hook-0  completed
2026-11-06T17:43:30.859Z  invariants-on-save.json#hook-0           completed
2026-11-06T17:44:56.542Z  invariants-on-save.json#hook-0           completed
2026-11-06T17:45:19.203Z  invariants-on-save.json#hook-0           completed
2026-11-06T18:13:33.024Z  living-file-gate.json#hook-0             completed
```

`pre-submit` (`PostTaskExec`) still has no recorded firing: it needs a spec task to be marked complete, which this kind of session does not do.
