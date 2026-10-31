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
