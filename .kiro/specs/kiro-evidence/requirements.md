# Kiro-feature evidence: Requirements

Evidence that Kiro's own features work in this project's sessions. Nothing here
changes the product.

### REQ-KE-01: MCP call record
WHEN the `openverse` MCP server's `search_images` tool is called from a Kiro session, THE evidence file SHALL record the exact query, the licence filter, the time of the call and the first three results (title, creator, licence, source URL).

### REQ-KE-02: no images
THE evidence work SHALL NOT fetch, download or embed any image, and SHALL NOT add any picture to any deck.

### REQ-KE-03: real tool call
THE recorded results SHALL come from a real MCP tool call made in the session, not from a script.

### REQ-KE-04: no secrets
THE evidence file SHALL NOT contain any key, token or credential.

### REQ-KE-05: gate on completion
WHEN TASK-36d1 is marked complete, THE PostTaskExec hook "Pre-submit: full gate" SHALL run `npm run pre-submit`.
