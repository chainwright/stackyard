# Stackyard — Tech

## Runtime environment

- Node 24
- TypeScript throughout (strict mode)
- Vite for the Maker web app (dev server + build)

## Maker app (the editor)

A standard Vite + TypeScript single-page app.
No UI framework mandate; prefer a lightweight option (Preact or plain DOM) over React.
Keep the bundle small — the Maker app can load over a slow connection.

## Player runtime (the exported file)

The exported file is ONE standalone HTML file with all assets inlined.
The player runtime is vanilla TypeScript compiled to a single IIFE.
Target size: under 50 KB minified + gzipped.
No framework. No external dependencies at runtime.
The file must work in a browser from 2018 onwards with no internet.

## LLM integration

Stack generation calls an LLM API (e.g., OpenAI-compatible).
All LLM calls are made from a server-side module only.
The API key never reaches the browser and is never inlined into any exported file.
The server validates and sanitises all LLM output before passing it to the client.

Two LLM call shapes live in `server/llmGateway.ts`:

- `call` — a single request with `response_format: { type: "json_object" }`;
  returns the whole JSON string. Used by the non-streaming `/api/generate` path
  and the retry/fallback path.
- `callStream` — a `stream: true` request whose SSE deltas are yielded as they
  arrive. The streaming prompt (`promptBuilder.buildStream`) asks for the stack
  as JSON Lines — a stack-header line then one card per line — so `/api/generate`
  with `Accept: application/x-ndjson` can emit each card the moment its line is
  complete and passes `validateCard()`. On any streaming failure the server falls
  back to `call` (retry + deterministic offline stack), emitting a `reset` first
  if cards were already dealt.

Both calls share identical key handling and no-secrets guarantees: the key is
read only from the server environment, sent only in the request header, and never
appears in any returned value, yielded delta, streamed message, or error.

## Testing

- Vitest for unit and integration tests
- fast-check for property-based tests (invariant checking on stack JSON)
- Test the stack validator exhaustively: every invariant in stack-format.md must have a property test.

## File layout (target)

```
stackyard/
  server/          # LLM gateway, stack generator, export builder
  src/             # Maker app (Vite entry point)
    editor/        # Card editor UI
    player/        # Player runtime source (compiled into exported file)
    shared/        # Types, stack schema, validator
  tests/
  .kiro/
```

## Key constraints

- No secrets in client-side code or exported files.
- The exported HTML file must be fully self-contained (no CDN links, no external fonts).
- All user-facing strings go through the audience rules in audience.md.

## Security: request size limits

Every POST route reads the request body through the shared `readBody(req, res, maxBytes)`
helper in `server/readBody.ts`. It stops reading once the running byte count passes the
limit, answers `413` with a plain-language JSON message, and destroys the request stream,
so no single request can buffer an unbounded body into memory.

- `POST /api/generate`: 16 KB (a sentence).
- `POST /api/export`: 8 MB (a stack with inlined images).

The export path also caps what the validator does not: `server/exportLimits.ts` rejects a
stack with more than `MAX_CARDS` cards or any text field longer than `MAX_TEXT_LENGTH`
(the nine stack-format.md invariants bound neither), returning `413` with a plain-language
message before the exporter runs. Each limit has tests in `tests/request-size-limits.test.ts`.
