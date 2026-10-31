# How Stackyard is built with Kiro (running log)

Kept from day one for the Kiroween write-up.

## 30 Oct 2026: steering first
- Tool: Kiro CLI (`kiro-cli chat`), signed in with Google.
- Before any code, we asked Kiro to write the project steering from a one-paragraph brief: `product.md`, `tech.md`, `stack-format.md`, `audience.md` in `.kiro/steering/`.
- The stack format and its seven invariants (unique ids, valid goto targets, exactly one end card, one correct answer per quiz card, canvas bounds, non-empty title, at least one playable card) become the contract for the generator, the editor, the exporter and the property-based tests.
- First attempt drafted the files but did not write them (file tools were not trusted for the session); resumed the same session with write access and it saved what it had drafted.

## 30 Oct 2026: first spec (stack generator)
- Asked Kiro (CLI) for a spec of the first feature with EARS acceptance criteria. It wrote `.kiro/specs/stack-generator/{requirements,design,tasks}.md`: 7 requirements, a data-flow design (one LLM call → shared validator → one retry with the validator's errors → deterministic fallback stack if the model is down), and 9 tasks.
- The spec turned the steering's seven invariants into the validator contract and into one property-based test per invariant (fast-check).
- Cost so far: under 1 credit for steering and spec together.

## 30 Oct 2026: Phase 1 implemented by Kiro (types, validator, property tests)
- Kiro CLI implemented tasks 1–3 of the spec: `src/shared/types.ts`, `src/shared/validator.ts` (collects every failing invariant, no `any`), and `tests/validator.property.test.ts` (18 fast-check properties, one block per invariant).
- `npm test` 18/18, `tsc --noEmit` clean.
- We checked the tests can actually fail: removing any one of five invariant checks from the validator makes 1–2 property tests fail; restoring it brings 18/18 back.

## 30 Oct 2026: Phase 2 (prompt builder, fallback stack)
- Kiro implemented `server/promptBuilder.ts` (system prompt carries the schema, the seven invariants and the audience rules; card count clamped to 20; retry message leads with the validator's errors) and `server/fallback.ts` (3-card stack with ids seeded from the prompt).
- The service throttled the first run halfway; we resumed the same Kiro session and it finished the phase.
- Two fast-check properties (500 runs each): any non-empty prompt up to 500 characters gives a fallback stack that passes the validator, and the same prompt always gives the identical stack.
- 49/49 tests, `tsc` clean. Mutation check: turning the fallback's end card into a story card fails 5 tests.

## 30 Oct 2026: Phase 3–4 (LLM gateway, generator)
- Kiro implemented `server/llmGateway.ts` (OpenAI-compatible; base URL, model and key from env, read only in this file; key never in errors) and `server/stackGenerator.ts` (validate → one retry at lower temperature with the validator's errors → plain-language error; fallback stack when the model is unreachable).
- Throttled twice by the service mid-task; each time we resumed the same session and Kiro picked up where it stopped (it also fixed its own TypeScript precedence error and added Node types).
- Property tests: for any string and any JSON value the model might return, `generate()` never throws, returns a valid stack or a plain-language error, and never contains the API key.
- 89/89 tests, `tsc` clean. Mutation check: if the generator skips validation, 9 tests fail.

## 30 Oct 2026: Phase 5–6 (route, end-to-end) and a bug the tests missed
- Kiro implemented `POST /api/generate` on `node:http` (plain-language 400/422/500, response stripped to `{ ok, stack, isFallback }`) and an end-to-end test of the three paths. 113/113 tests, `tsc` clean. All 9 spec tasks are now ticked.
- A live run without an API key returned the fallback stack (good), but its ids were 38 characters, not UUID v4 as REQ-2 says. The validator only checks uniqueness, so no test caught it. Next: make the fallback ids real UUID v4 and add the format to the validator with a property test.
- Fixed with Kiro (two throttles, resumed both times): fallback ids are now real RFC 4122 v4 UUIDs, still deterministic; the validator gained invariant 8 (`invalid-id`); steering and spec updated to eight invariants; property tests for invalid ids and for every fallback id over 500 random prompts. The old "conforming stack" arbitraries had produced non-v4 ids, so Kiro switched them to a v4 generator rather than weakening the check.
- 118/118, `tsc` clean. Mutation check: removing the `invalid-id` check fails 3 tests. Live run: all 10 ids in a fallback stack match UUID v4.
- Lesson for the write-up: the spec and 113 green tests still let a real defect through; a 30-second live run caught it, and the fix went back into the spec as a new invariant.

## 30 Oct 2026: second spec (exporter + player) and a review round
- Kiro wrote `.kiro/specs/exporter/` (requirements, design, 18 tasks): one self-contained HTML file, player under 50 KB gzipped, stack JSON embedded for lossless re-import (fast-check round-trip), synthesised sounds, ES2018 target.
- We reviewed it like a pull request and sent five fixes back to Kiro: reuse the existing types/validator instead of re-specifying them; the right key variable name for the no-secrets test; a card-level auto-advance cycle could hang the player (now invariant 9 `goto-cycle` plus a runtime cap); image inlining must never read arbitrary paths from stack data (only data URIs or files inside one assets directory, path-traversal tests); a teacher's text containing a URL must still export with no raw `https://` and round-trip exactly.
- Kiro applied all five across requirements, design, tasks and the steering.

## 30 Oct 2026: invariant 9 and the player runtime
- Kiro added invariant 9 (`goto-cycle`: the card-level auto-advance graph must have no cycle) with property tests, `ExportValidationError`, and `src/player/runtime.ts` (state, dispatcher, `goto` stops the action list, injected sound callback) with 24 unit tests.
- 146/146, `tsc` clean. Mutation check: removing the cycle check fails 2 tests.

## 31 Oct 2026: design system as steering
- Three directions were mocked up at full fidelity (Stamp Pad, Bit Garden, Answer Tiles, plus a hybrid); the team picked the hybrid: a ring-bound pad with rubber-stamp feedback and shaped answer tiles (▲ ◆ ● ■) for kids and colour-blind readers. Reference: `docs/design/reference-stamp-pad-tiles.png`.
- Kiro wrote `.kiro/steering/design-system.md` from the exact tokens (colours, fonts, type scale, radii, motion, accessibility, banned AI-default patterns).
- Review round: we measured contrast with the WCAG formula instead of trusting estimates. The first stamp red (#E5402B) failed AA (3.88 on paper, 4.12 under white text), so Kiro switched it to #CE3926 (4.67 / 4.96), fixed a token typo and raised a 16px label to the 18px floor.
