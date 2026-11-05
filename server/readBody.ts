// server/readBody.ts
// Shared request-body reader with a hard byte cap, used by every POST route.
//
// Security: without a cap, a single large request body is read entirely into
// memory and can exhaust the server. readBody stops reading the moment the
// running byte count passes `maxBytes`, answers 413 with a plain-language JSON
// message, and destroys the request stream so no further bytes are buffered.
//
// Wording follows audience.md: one sentence saying what happened, one saying
// what to do next; Irish/UK English; never a raw error code or stack trace.

import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Result of reading a request body.
 *
 *  - `{ ok: true, body }`      — the full body fits within the limit.
 *  - `{ ok: false }`           — the limit was passed (413 already sent) or the
 *                                stream errored (400 already sent). The caller
 *                                must stop and send nothing further.
 */
export type ReadBodyResult =
  | { ok: true; body: string }
  | { ok: false };

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Read a request body as UTF-8 text, refusing bodies larger than `maxBytes`.
 *
 * When the running byte count passes `maxBytes`, readBody immediately:
 *   1. responds `413 Payload Too Large` with a plain-language JSON message,
 *   2. destroys the request stream (so no more of the body is read), and
 *   3. resolves `{ ok: false }` — the caller must not read or send anything
 *      else.
 *
 * The `413` response is sent exactly once, even if more `data` events arrive
 * before the stream is torn down.
 *
 * @param req       The incoming request.
 * @param res       The response — readBody sends the 413/400 itself on failure.
 * @param maxBytes  Maximum allowed body size in bytes (inclusive).
 */
export function readBody(
  req: IncomingMessage,
  res: ServerResponse,
  maxBytes: number
): Promise<ReadBodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;

    const finish = (result: ReadBodyResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      received += chunk.length;
      if (received > maxBytes) {
        // Over the limit — refuse before buffering any more of the body.
        sendJson(res, 413, {
          ok: false,
          message:
            "That request is too big to handle. Please make it smaller and try again.",
        });
        req.destroy();
        finish({ ok: false });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      finish({ ok: true, body: Buffer.concat(chunks).toString("utf-8") });
    });

    req.on("error", () => {
      // destroy() above triggers an 'error'/'close'; only surface a 400 if we
      // have not already answered with the 413.
      if (!settled) {
        sendJson(res, 400, {
          ok: false,
          message: "We couldn't read your request. Please try again.",
        });
      }
      finish({ ok: false });
    });

    req.on("close", () => {
      // If the socket closes before 'end' and we have not settled, treat it as
      // a read failure (the 413 path has already settled via destroy()).
      finish({ ok: false });
    });
  });
}
