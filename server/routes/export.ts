// server/routes/export.ts
// Handles POST /api/export.
//
// Modelled on server/routes/generate.ts (same sendJson / readBody shapes,
// same security posture).
//
// Security invariants:
//   - Never forward raw error text, env vars, or stack traces to the client.
//   - Success is raw text/html (byte-exact); errors are always plain-language JSON.

import type { IncomingMessage, ServerResponse } from "node:http";
import { exportStack, exportLivingStack, ExportValidationError } from "../exporter.js";
import { readBody } from "../readBody.js";
import { checkExportLimits } from "../exportLimits.js";
import { plainMessageFrom, safeFileName, classFileName } from "../../src/shared/messages.js";
import type { Stack } from "../../src/shared/types.js";

// An export body carries a whole stack with image data URIs inlined; 8 MB is
// enough for a real lesson's images while still refusing a memory-exhausting
// payload.
const MAX_EXPORT_BODY_BYTES = 8 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers

function sendJson(res: ServerResponse, status: number, body: unknown): void {
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
 * Handle a POST /api/export request.
 * Can be called directly (e.g. from tests) or wired into an http.Server.
 */
export async function handleExport(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Only accept POST.
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "Method not allowed." });
    return;
  }

  // Read body with a hard size cap. readBody sends 413/400 itself on failure.
  const read = await readBody(req, res, MAX_EXPORT_BODY_BYTES);
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
    !("stack" in parsed) ||
    typeof (parsed as Record<string, unknown>)["stack"] !== "object" ||
    (parsed as Record<string, unknown>)["stack"] === null
  ) {
    sendJson(res, 400, {
      ok: false,
      message: "We couldn't find a set of cards to export. Please try again.",
    });
    return;
  }

  const stack = (parsed as Record<string, unknown>)["stack"] as Stack;
  // Export kind (TASK-24): the living file (default) carries the offline in-file
  // editor; `living: false` asks for the smaller play-only class file.
  const living = (parsed as Record<string, unknown>)["living"] !== false;

  // Resource caps the validator does not enforce: the nine invariants in
  // stack-format.md bound neither the number of cards nor the length of text
  // fields, so a stack that is valid can still be huge. Cap both before the
  // (more expensive) exportStack() work. Guard against a malformed cards array
  // first; the exporter's validate() still reports the real shape error below.
  if (Array.isArray(stack.cards)) {
    const limitErrors = checkExportLimits(stack);
    if (limitErrors.length > 0) {
      sendJson(res, 413, {
        ok: false,
        message: plainMessageFrom(limitErrors),
      });
      return;
    }
  }

  // Build the file. Both exporters validate internally and throw
  // ExportValidationError on any invariant failure.
  let html: string;
  try {
    html = living ? await exportLivingStack(stack) : await exportStack(stack);
  } catch (err) {
    if (err instanceof ExportValidationError) {
      sendJson(res, 422, {
        ok: false,
        message: plainMessageFrom(err.errors),
      });
      return;
    }
    // Unexpected error — log server-side only; never leak details.
    console.error("[export route] unexpected error:", err);
    sendJson(res, 500, {
      ok: false,
      message: "Something went wrong on our end. Please try again.",
    });
    return;
  }

  // Success — respond with the HTML body verbatim (byte-exact).
  // The class export is "<title>-class.html" and the living export "<title>.html",
  // so the two files from one lesson can be told apart (TASK-27g).
  const title = typeof stack.title === "string" ? stack.title : "";
  const filename = living ? safeFileName(title) : classFileName(title);
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Content-Length": Buffer.byteLength(html),
  });
  res.end(html);
}
