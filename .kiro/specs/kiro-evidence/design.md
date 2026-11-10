# Kiro-feature evidence: Design

Requirements: `requirements.md` (REQ-KE-01 … 05).

## Approach

1. Call `search_images` on the registered `openverse` MCP server from the Kiro
   session with `query: "water cycle"`, `license: "cc0"`, `pageSize: 3`.
2. Read the clock (`date`) at the call so the file records the time.
3. Write the three results as text into
   `docs/kiro-sessions/mcp-call-2026-11-10.md` under the heading
   "An Openverse MCP call made inside Kiro". Only text fields are recorded; the
   thumbnail and image URLs are left out so nothing is fetched or embedded.
4. Mark the task complete through the spec task tooling so the PostTaskExec
   hook fires.

## Out of scope

Any image in a deck, any change to `src/`, `server/` or the exporter.
