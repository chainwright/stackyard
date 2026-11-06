---
inclusion: manual
---

# Pre-submit gate (on demand)

Run this file on demand with `/pre-submit` (a manually included steering file runs as a slash command), or type `#pre-submit` to include it as context. Use it when you want the full submission gate run now, without finishing a spec task. kiro.dev lists `Manual` hooks as not invocable in CLI v3 and the IDE no longer creates them, so the on-demand path is this steering file.

Run, in this order, from the repository root, and report each exit code:

1. `npm test`
2. `npx tsc --noEmit`
3. `npm run pre-submit` (adds the Maker build, `check:decks`, `check:text-fit`, `check:living-file`, `check:samples` and `check:claims`)
4. `CI=true npm run check:claims` (the coloured-output path GitHub Actions takes)

Do not report the gate as green unless every command exited 0. If `check:samples` says a sample is stale, run `npm run samples` and re-run the gate. If `check:claims` says a README number drifted, run `npm run check:claims:fix`.
