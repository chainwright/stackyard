// server/routes/generate.ts
// Handles POST /api/generate.
//
// Security invariants:
//   - Never forward raw error text or stack traces to the client.
//   - Strip all fields from GenerateSuccess except ok, stack, isFallback.
//   - Plain-language error messages per audience.md.

import type { IncomingMessage, ServerResponse } from "node:http";
import { generate } from "../stackGenerator.js";
import type { GenerateRequest } from "../../src/shared/types.js";

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

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
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

  // Parse body.
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    sendJson(res, 400, {
      ok: false,
      message: "We couldn't read your request. Please try again.",
    });
    return;
  }

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
