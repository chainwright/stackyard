// src/editor/api.ts
// Fetch wrappers for the two server routes the Maker uses: /api/generate and
// /api/export. Both return plain-language outcomes; neither ever surfaces a
// raw error code or stack trace (audience.md, REQ-MKR-16).

import type { Stack } from "../shared/types.js";
import { safeFileName } from "../shared/messages.js";

// ---------------------------------------------------------------------------
// Generate

export type GenerateOutcome =
  | { ok: true; stack: Stack; isFallback: boolean }
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
    message?: string;
  };

  if (res.ok && body.ok === true && body.stack) {
    return { ok: true, stack: body.stack, isFallback: body.isFallback === true };
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
