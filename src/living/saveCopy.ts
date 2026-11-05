// src/living/saveCopy.ts
// "Save a Copy" for the living file (TASK-24). Regenerates a NEW self-contained
// living file from the CURRENT document, swapping only the embedded stack JSON,
// and downloads it via a Blob link. No network; the original file is untouched.
//
// Because the copy is the current document with one block replaced, it is
// byte-identical except the stack — so it is itself a living file, and an
// unedited save round-trips losslessly.

import type { Stack } from "../shared/types.js";
import { validate } from "../shared/validator.js";
import { replaceStackData } from "../shared/escapeStackJson.js";
import { safeFileName } from "../shared/messages.js";

export type SaveResult =
  | { ok: true; filename: string; bytes: number }
  | { ok: false; message: string };

/**
 * Build the HTML for a copy of the current living file carrying `stack`, and
 * trigger a download. `stack` MUST already be valid (the caller gates on
 * validate() + reachability). `doc` defaults to the live document; tests pass
 * a parsed document. `downloadImpl` lets tests capture the download instead of
 * touching the DOM/Blob APIs.
 */
export function saveCopy(
  stack: Stack,
  opts: {
    doc?: Document;
    /** Returns the current file's full HTML (defaults to the live document). */
    currentHtml?: () => string;
    /** Performs the download; defaults to a Blob + anchor click. */
    download?: (html: string, filename: string) => void;
  } = {},
): SaveResult {
  // Belt-and-braces: never write an invalid stack, even though the editor keeps
  // the stack valid by construction (invariants 1–9, stack-format.md).
  const check = validate(stack);
  if (!check.valid) {
    return { ok: false, message: "Something's not right with these cards, so the copy wasn't saved." };
  }

  const doc = opts.doc ?? document;
  const currentHtml =
    opts.currentHtml ?? (() => "<!doctype html>\n" + doc.documentElement.outerHTML);

  const html = replaceStackData(currentHtml(), stack);
  if (html === null) {
    return { ok: false, message: "We couldn't find where to write the cards, so the copy wasn't saved." };
  }

  const filename = safeFileName(stack.title);
  const download = opts.download ?? defaultDownload(doc);
  download(html, filename);
  return { ok: true, filename, bytes: html.length };
}

/** Default Blob-link download (no network). */
function defaultDownload(doc: Document): (html: string, filename: string) => void {
  return (html, filename) => {
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
}
