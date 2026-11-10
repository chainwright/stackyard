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

The `pre-submit` hook is a `PostTaskExec` hook (it fires when a spec task is marked done; `Manual` is not used, because kiro.dev lists Manual hooks as not invocable in CLI v3 and the IDE no longer creates them). It has not been recorded firing in a Kiro session; the same gate runs on demand as `/pre-submit` (the steering file) or `npm run pre-submit`. The `/pre-submit` path was run once from kiro-cli 3.1.0 (`kiro-cli chat --no-interactive "/pre-submit"`, 6 Nov; session `2028064e-7d31-4c17-a0db-e0d22ecc728e` in the kiro-cli v2 store, 20:27Z, title "/pre-submit"): it read the steering file and ran `npm test`, `npx tsc --noEmit`, `npm run pre-submit` and `CI=true npm run check:claims`, all exit 0. That is a slash-command run, not a `PostTaskExec` firing.

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

In the TASK-28 session, source files were edited with `fs_write` / `str_replace` (rule added to `.kiro/steering/tech.md`), and the new `PostToolUse` hook on `execute_bash` re-runs the invariants after shell edits. The session store (`messages.jsonl`) recorded, for that one session, in the TASK-28 window (6 Nov, 17:30–18:44Z): 79 `invariants-after-shell-edit`, 12 `invariants-on-save` and 7 `living-file-gate` `ContextualHookInvoked` records, 98 in all, all `completed`. (This "98" is the three-hook TASK-28 total; the "98" in KIRO_LOG's TASK-30 entry is the after-shell count alone of a different window. Both are in the recount table in section 5.) First of each:

```text
2026-11-06T17:36:45.575Z  invariants-after-shell-edit.json#hook-0  completed
2026-11-06T17:43:30.859Z  invariants-on-save.json#hook-0           completed
2026-11-06T17:44:56.542Z  invariants-on-save.json#hook-0           completed
2026-11-06T17:45:19.203Z  invariants-on-save.json#hook-0           completed
2026-11-06T18:13:33.024Z  living-file-gate.json#hook-0             completed
```

`pre-submit` (`PostTaskExec`) still has no recorded firing: it needs a spec task to be marked complete, which this kind of session does not do.

## 5. Hook firings, recounted from the session store (9 Nov)

Recounted for TASK-32 from session `sess_4ead26b8`'s `messages.jsonl`: every record with `payload.type == "ContextualHookInvoked"`, grouped by hook and by window. These are the numbers the README, KIRO_LOG and the Devpost write-up use.

| Window | Total | invariants-after-shell-edit | invariants-on-save | living-file-gate | ready-made-content-check | export-regression-check | pre-submit |
|---|---|---|---|---|---|---|---|
| Whole session (5 Nov 16:07Z to 9 Nov 19:19Z) | **493** | 417 | 39 | 23 | 12 | 2 | 0 |
| 5 Nov 16:07–16:26Z | 11 | — | — | — | 11 | — | — |
| 6 Nov 01:37–01:38Z | 5 | — | 2 | 1 | 1 | 1 | — |
| TASK-28 window, 6 Nov 17:30–18:44Z | **98** | 79 | 12 | 7 | — | — | — |
| TASK-30 window, 9 Nov 16:10–17:21Z | 100 | **98** | 2 | — | — | — | — |
| TASK-31 window, 9 Nov 18:12–19:21Z | 147 | 132 | 6 | 9 | — | — | — |

So "98" means two different things in older notes: the TASK-28 total of three hooks (79 + 12 + 7), and TASK-30's after-shell count alone (100 firings in all in that window). `pre-submit` (`PostTaskExec`) has never fired: no spec task was marked done in these sessions, and kiro-cli sessions have no task-status tool (a ticked box is a file edit; see section 6).

## 6. An MCP call made inside Kiro (10 Nov)

Until 10 Nov the `openverse` MCP server was registered in `.kiro/settings/mcp.json`, but its code had only been run as a script outside Kiro (the write-up's MCP row; KIRO_LOG, 5 Nov). On 10 Nov a separate Kiro session called it as an MCP tool:

- **The session.** `sess_b006fe90-9722-4630-a0b1-13ecc2981ef9`, kiro-cli 3.1.0. It was started with `--mode spec`, but its `session.json` records `agentMode` "vibe" and `specWorkflow` "quick".
- **What it wrote.** `.kiro/specs/kiro-evidence/` and [`mcp-call-2026-11-10.md`](mcp-call-2026-11-10.md), which holds the query, the time and the first three results.
- **The tool approval.** It was accepted automatically, because the session ran with `--trust-all-tools`. No person clicked it.

The records, extracted by us from that session's `messages.jsonl` (payload types `tool_call` / `pending_interaction` / `tool_result`; paths trimmed to the repo), verbatim:

```
2026-11-10T06:07:27.799Z tool_call tool_load {"tool_ids": ["openverse::search_images"]}
2026-11-10T06:07:27.799Z tool_result bLmpkk1X {   "loaded": [     {       "tool_id": "openverse::search_images",       "description": "Search Openverse for CC0 or public-domain-mark images. Returns title, creator, licence, source URL and a thumbnail URL per result.",       "input_schema": {         "type": "object",         "properties": {     
2026-11-10T06:07:33.690Z pending_interaction tool_approval "@openverse/search_images"
2026-11-10T06:07:41.771Z tool_call tool_call {"tool_id": "openverse::search_images", "arguments": {"query": "water cycle", "license": "cc0", "pageSize": 3}}
2026-11-10T06:07:41.771Z tool_result cYJvFZoy [   {     "title": "Abandoned water cycle",     "creator": "Unknown",     "license": "cc0",     "source": "https://www.rawpixel.com/image/5938991/abandoned-water-cycle",     "thumbnail": "https://api.openverse.org/v1/images/6284ff02-3b3a-44eb-9e72-9d7aa6b2bb87/thumb/",     "url": "https://images.raw
```

No image was fetched and no picture was added to any deck.

**`PostTaskExec` still did not fire.**
- The same session ticked `- [ ] TASK-36d1` to `- [x]` with `str_replace`, a file edit, because kiro-cli sessions have no spec task-status tool.
- A file edit is not a task-status transition, so the `pre-submit` hook had nothing to fire on. The store has no `ContextualHookInvoked` record for it. That session's only hook record is `invariants-after-shell-edit` at 06:07:34Z.
- The documented trigger is a task-status change from the Kiro IDE's tasks view, and we did not drive the IDE.
- So `pre-submit` (`PostTaskExec`) is **still not recorded firing**. The same gate runs as `/pre-submit` or `npm run pre-submit`.
