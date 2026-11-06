// src/living/saveCopy.ts
// "Save a Copy" for the living file (TASK-24, fixed in TASK-26a). Builds a NEW
// self-contained living file from the PRISTINE snapshot of the file taken at
// start-up, swapping only the embedded stack JSON, and downloads it via a Blob
// link. No network; the original file is untouched.
//
// WHY A SNAPSHOT: the first version serialised the live DOM
// (`document.documentElement.outerHTML`) at save time. Save a Copy is only
// reachable from inside the editor overlay, so every copy carried the open
// overlay, a hidden Teacher tab, the injected styles and the rendered card — it
// opened on a frozen editor with dead buttons, and grew with every save
// (147 → 171 KB). The copy is now the pristine document with one block
// replaced, so it is byte-identical to the original except the stack, it is
// itself a living file, and saving it again gives the same size.

import type { Stack } from "../shared/types.js";
import { validate } from "../shared/validator.js";
import { replaceStackData, readCopyCount, withCopyCount } from "../shared/escapeStackJson.js";
import { copyFileName } from "../shared/messages.js";

export type SaveResult =
  | { ok: true; filename: string; bytes: number }
  | { ok: false; message: string };

export interface SaveCopyOptions {
  /**
   * The file's HTML exactly as it was before anything mounted (the snapshot
   * taken at start-up). REQUIRED: there is deliberately no default that reads
   * the live document, because that is the bug this module exists to prevent.
   */
  pristineHtml: string;
  /** The document to create the download link in (defaults to the live one). */
  doc?: Document;
  /** Performs the download; defaults to a Blob + anchor click (no network). */
  download?: (html: string, filename: string) => void;
}

/**
 * Build the HTML for a copy of the file carrying `stack`, and trigger a
 * download. `stack` MUST already be valid (the caller gates on validate() +
 * reachability); this re-validates as belt and braces.
 */
export function saveCopy(stack: Stack, opts: SaveCopyOptions): SaveResult {
  // Never write an invalid stack, even though the editor keeps the stack valid
  // by construction (invariants 1–9, stack-format.md).
  const check = validate(stack);
  if (!check.valid) {
    return { ok: false, message: "Something's not right with these cards, so the copy wasn't saved." };
  }
  if (typeof opts.pristineHtml !== "string" || opts.pristineHtml.length === 0) {
    return { ok: false, message: "We couldn't find the original file to copy, so the copy wasn't saved." };
  }

  const replaced = replaceStackData(opts.pristineHtml, stack);
  if (replaced === null) {
    return { ok: false, message: "We couldn't find where to write the cards, so the copy wasn't saved." };
  }
  // Count this copy: the file remembers how many times it has been copied, so a
  // copy of a copy is "(copy 2)", not "(copy)" again (TASK-27g).
  const copyNumber = readCopyCount(opts.pristineHtml) + 1;
  const html = withCopyCount(replaced, copyNumber);

  const filename = copyFileName(stack.title, copyNumber);
  const doc = opts.doc ?? document;
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
