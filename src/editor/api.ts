// src/editor/api.ts
// Fetch wrappers for the two server routes the Maker uses: /api/generate and
// /api/export. Both return plain-language outcomes; neither ever surfaces a
// raw error code or stack trace (audience.md, REQ-MKR-16).

import type {
  Stack,
  Card,
  GenerateStreamMessage,
} from "../shared/types.js";
import { safeFileName } from "../shared/messages.js";

// ---------------------------------------------------------------------------
// Generate

export type GenerateOutcome =
  | { ok: true; stack: Stack; isFallback: boolean; isReadyMadeExample: boolean }
  | { ok: false; message: string };

/** POST /api/generate with a teacher's sentence. */
export async function generateStack(
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GenerateOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    return {
      ok: false,
      message: "We couldn't reach Stackyard. Check your internet and press Build Cards again.",
    };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return {
      ok: false,
      message: "Something went wrong. Please try again.",
    };
  }

  const body = data as {
    ok?: boolean;
    stack?: Stack;
    isFallback?: boolean;
    isReadyMadeExample?: boolean;
    message?: string;
  };

  if (res.ok && body.ok === true && body.stack) {
    return {
      ok: true,
      stack: body.stack,
      isFallback: body.isFallback === true,
      isReadyMadeExample: body.isReadyMadeExample === true,
    };
  }
  return {
    ok: false,
    message:
      typeof body.message === "string" && body.message.length > 0
        ? body.message
        : "We couldn't build your cards. Check your internet and press Build Cards again.",
  };
}

// ---------------------------------------------------------------------------
// Generate (progressive / streaming)

/** Callbacks the Start screen uses to deal cards as they stream in. */
export interface GenerateStreamHandlers {
  onStart?: (info: { total: number; title: string; isFallback: boolean; isReadyMadeExample: boolean }) => void;
  onCard?: (info: { index: number; card: Card; total: number }) => void;
  /**
   * The server abandoned a partial stream (dead stream, bad card, or a stack
   * that failed validation) and is restarting from a fallback. Clear every
   * card dealt so far; a fresh `start` and cards follow.
   */
  onReset?: () => void;
}

/**
 * POST /api/generate asking for NDJSON progressive delivery. Invokes the
 * handlers as cards arrive, then resolves with the same GenerateOutcome shape
 * as generateStack() so callers can branch identically.
 *
 * On any transport failure, a malformed line, or an `error` line, resolves
 * with { ok: false, message } — a plain-language message, never a raw error.
 */
export async function generateStackStream(
  prompt: string,
  handlers: GenerateStreamHandlers = {},
  fetchImpl: typeof fetch = fetch,
): Promise<GenerateOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({ prompt }),
    });
  } catch {
    return {
      ok: false,
      message:
        "We couldn't reach Stackyard. Check your internet and press Build Cards again.",
    };
  }

  // A non-OK HTTP status means the request was rejected before streaming
  // (e.g. 400 for a bad prompt); read the JSON message if present.
  if (!res.ok || res.body === null) {
    let message =
      "We couldn't build your cards. Check your internet and press Build Cards again.";
    try {
      const data = (await res.json()) as { message?: string };
      if (typeof data.message === "string" && data.message.length > 0) {
        message = data.message;
      }
    } catch {
      // keep the generic message
    }
    return { ok: false, message };
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let total = 0;
  let isFallback = false;
  let isReadyMadeExample = false;

  // Process a single parsed NDJSON message. Returns a terminal outcome once
  // `done` or `error` is seen; otherwise undefined to keep reading.
  function handle(msg: GenerateStreamMessage): GenerateOutcome | undefined {
    switch (msg.type) {
      case "start":
        total = msg.total;
        isFallback = msg.isFallback;
        isReadyMadeExample = msg.isReadyMadeExample === true;
        handlers.onStart?.({
          total: msg.total,
          title: msg.title,
          isFallback: msg.isFallback,
          isReadyMadeExample,
        });
        return undefined;
      case "card":
        handlers.onCard?.({ index: msg.index, card: msg.card, total });
        return undefined;
      case "reset":
        // A partial stream was abandoned; a fresh start/cards follow. Drop any
        // fallback flag carried from the abandoned attempt.
        total = 0;
        isFallback = false;
        isReadyMadeExample = false;
        handlers.onReset?.();
        return undefined;
      case "done":
        return {
          ok: true,
          stack: msg.stack,
          isFallback: msg.isFallback || isFallback,
          isReadyMadeExample: msg.isReadyMadeExample === true || isReadyMadeExample,
        };
      case "error":
        return { ok: false, message: msg.message };
      default:
        return undefined;
    }
  }

  function parseLine(line: string): GenerateStreamMessage | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) return null;
    try {
      return JSON.parse(trimmed) as GenerateStreamMessage;
    } catch {
      return null;
    }
  }

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });

      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const msg = parseLine(line);
        if (msg === null) {
          // A line we couldn't parse mid-stream: treat as a broken stream.
          if (line.trim().length > 0) {
            return { ok: false, message: "Something went wrong. Please try again." };
          }
          continue;
        }
        const outcome = handle(msg);
        if (outcome) return outcome;
      }

      if (done) break;
    }

    // Flush any trailing line without a newline.
    const tail = parseLine(buffer);
    if (tail) {
      const outcome = handle(tail);
      if (outcome) return outcome;
    }
  } catch {
    return { ok: false, message: "Something went wrong. Please try again." };
  }

  // Stream ended without a `done` or `error` line — a broken stream.
  return { ok: false, message: "Something went wrong. Please try again." };
}

// ---------------------------------------------------------------------------
// Export

export type ExportOutcome =
  | { ok: true; html: string; filename: string }
  | { ok: false; message: string };

/** Read the filename from a Content-Disposition header, if present. */
function filenameFromDisposition(res: Response): string | null {
  const cd = res.headers.get("Content-Disposition");
  if (!cd) return null;
  const match = /filename="([^"]+)"/.exec(cd);
  return match ? match[1]! : null;
}

/**
 * POST /api/export with the current stack. On success returns the raw HTML
 * body (byte-exact) and a safe filename; on a validation or network failure
 * returns a plain-language message and no bytes.
 */
export async function exportStack(
  stack: Stack,
  fetchImpl: typeof fetch = fetch,
): Promise<ExportOutcome> {
  let res: Response;
  try {
    res = await fetchImpl("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stack }),
    });
  } catch {
    return {
      ok: false,
      message: "We couldn't save your file. Check your internet and try again.",
    };
  }

  if (res.ok) {
    const html = await res.text();
    const filename = filenameFromDisposition(res) ?? safeFileName(stack.title);
    return { ok: true, html, filename };
  }

  // Errors are always JSON with a plain-language message.
  let message = "We couldn't save your file. Please try again.";
  try {
    const data = (await res.json()) as { message?: string };
    if (typeof data.message === "string" && data.message.length > 0) {
      message = data.message;
    }
  } catch {
    // keep the generic message
  }
  return { ok: false, message };
}

/**
 * Trigger a browser download of `html` under `filename`, byte-for-byte (no
 * transform). Returns the object URL it created so a caller/test can assert.
 */
export function triggerDownload(
  html: string,
  filename: string,
  doc: Document = document,
): string {
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  // Revoke on the next tick so the click is processed first.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return url;
}
