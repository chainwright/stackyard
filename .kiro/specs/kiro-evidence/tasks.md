# Kiro-feature evidence: Tasks

Requirements: `requirements.md` (REQ-KE-01 … 05). Reasoning: `design.md`.

- [x] TASK-36d1: record an Openverse MCP call made inside Kiro  *(REQ-KE-01, 02, 03, 04, 05)*
  - **Note (TASK-36d).** This box was ticked by a file edit (`str_replace`) in session `sess_b006fe90-…`, because kiro-cli has no spec task-status tool. It was not a task-status transition, so the `PostTaskExec` `pre-submit` hook did not fire; the store has no `ContextualHookInvoked` for it. See `docs/kiro-sessions/README.md`, section 6.
  - Call `search_images` (query "water cycle", licence cc0) through the `openverse` MCP server.
  - Write the first three results (title, creator, licence, source URL), the exact query and the time to `docs/kiro-sessions/mcp-call-2026-11-10.md` under "An Openverse MCP call made inside Kiro".
  - Fetch no image and add no picture to any deck.
