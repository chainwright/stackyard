// server/routes/generate.ts
// Handles POST /api/generate.
//
// Security invariants:
//   - Never forward raw error text or stack traces to the client.
//   - Strip all fields from GenerateSuccess except ok, stack, isFallback.
//   - Plain-language error messages per audience.md.

import type { IncomingMessage, ServerResponse } from "node:http";
import { generate } from "../stackGenerator.js";
import { readBody } from "../readBody.js";
import { streamGenerate } from "../stream-generate.js";
import type { LineSink } from "../stream-generate.js";
import type {
  GenerateRequest,
  GenerateStreamMessage,
} from "../../src/shared/types.js";

/** NDJSON media type the client sends in Accept to request progressive delivery. */
const NDJSON_MEDIA_TYPE = "application/x-ndjson";

// A generate request body is a single sentence plus a little JSON wrapping;
// 16 KB is far more than that and refuses anything that could exhaust memory.
const MAX_GENERATE_BODY_BYTES = 16 * 1024;

// ---------------------------------------------------------------------------
// Helpers

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

// ---------------------------------------------------------------------------
// Route handler

/**
 * Handle a POST /api/generate request.
 * Can be called directly (e.g. from tests) or wired into an http.Server.
 */
export async function handleGenerate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Only accept POST.
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed." });
    return;
  }

  // Read body with a hard size cap. readBody sends 413/400 itself on failure.
  const read = await readBody(req, res, MAX_GENERATE_BODY_BYTES);
  if (!read.ok) return;
  const body = read.body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    sendJson(res, 400, {
      ok: false,
      message: "We couldn't understand your request. Please try again.",
    });
    return;
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("prompt" in parsed)
  ) {
    sendJson(res, 400, {
      ok: false,
      message: "Please describe what you'd like Stackyard to build.",
    });
    return;
  }

  const { prompt } = parsed as Record<string, unknown>;

  // Validate the prompt string.
  if (typeof prompt !== "string" || prompt.trim().length === 0) {
    sendJson(res, 400, {
      ok: false,
      message: "Please describe what you'd like Stackyard to build.",
    });
    return;
  }

  if (prompt.length > 500) {
    sendJson(res, 400, {
      ok: false,
      message:
        "Your description is too long. Keep it under 500 characters and try again.",
    });
    return;
  }

  // Call the generator.
  const request: GenerateRequest = { prompt: prompt.trim() };

  // Progressive (NDJSON) delivery when the client asks for it. The request
  // limit (16 KB) and prompt validation above are identical for both paths;
  // only the response encoding differs. The default JSON path is unchanged so
  // existing tests and clients keep working.
  const accept = (req.headers["accept"] ?? "").toLowerCase();
  if (accept.includes(NDJSON_MEDIA_TYPE)) {
    await streamGenerateToResponse(req, res, request);
    return;
  }

  let result: Awaited<ReturnType<typeof generate>>;
  try {
    result = await generate(request);
  } catch (err) {
    // generate() is documented to never throw, but guard anyway.
    console.error("[generate route] unexpected error:", err);
    sendJson(res, 500, {
      ok: false,
      message: "Something went wrong on our end. Please try again in a moment.",
    });
    return;
  }

  if (result.ok) {
    // Strip everything except ok, stack, isFallback.
    sendJson(res, 200, {
      ok: true,
      stack: result.stack,
      isFallback: result.isFallback,
    });
  } else {
    sendJson(res, 422, {
      ok: false,
      message: result.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Streaming (NDJSON) response

/**
 * Stream the generated stack to `res` as NDJSON. The response is always 200 at
 * the HTTP level (the stream itself carries success/error as its final line),
 * so the body can begin flushing before generation finishes. Each message is a
 * single JSON object followed by a newline.
 */
async function streamGenerateToResponse(
  req: IncomingMessage,
  res: ServerResponse,
  request: GenerateRequest,
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": NDJSON_MEDIA_TYPE,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });

  // When the client disconnects mid-stream, abort so the upstream LLM request
  // is cancelled and the server stops paying for tokens nobody will read.
  const connection = new AbortController();
  const onClose = (): void => connection.abort();
  req.on("close", onClose);

  // A closed connection can't be written to; swallow EPIPE-style write errors.
  const sink: LineSink = {
    write(obj: GenerateStreamMessage): void {
      if (res.writableEnded || connection.signal.aborted) return;
      res.write(JSON.stringify(obj) + "\n");
    },
    end(): void {
      if (!res.writableEnded) res.end();
    },
  };

  try {
    await streamGenerate(request, sink, { signal: connection.signal });
  } finally {
    req.off("close", onClose);
  }
}
