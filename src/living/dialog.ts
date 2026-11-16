// src/living/dialog.ts
// TASK-42a1: the living file's own "are you sure?" box, in place of the
// browser's confirm(). No dependency, no network. Ink on paper like the rest of
// the living file (styles in ./styles.ts, `.sy-dialog*`).
//
// - role="dialog", aria-modal="true", named by its heading;
// - focus moves into it on open and back to the opener on close;
// - Tab and Shift+Tab stay inside it;
// - Escape, the quiet button and a click on the backdrop all decline;
// - Enter on a focused button presses that button;
// - while it is open, keys do not reach the lesson or the editor behind it.
//
// The answer arrives through a callback, after the box has closed and focus has
// gone back, so the caller can move focus on (e.g. into the editor).

export interface AskOptions {
  /** The question, as the heading that names the dialog. */
  heading: string;
  /** One or more short lines under the heading. */
  body: string | string[];
  /** Optional bullet list between the body and the buttons (e.g. "Before you share"). */
  list?: string[];
  /** The primary button: says what will happen ("Open the Editor"). */
  confirmLabel: string;
  /** The quiet button: declines ("Back to the Lesson"). */
  cancelLabel: string;
  /** Which button has focus when the box opens. Default: the quiet one. */
  focus?: "confirm" | "cancel";
  /** Where focus goes back to on close. Default: whatever had focus at open. */
  opener?: HTMLElement | null;
}

let open: { close: (yes: boolean) => void } | null = null;
let seq = 0;

/** Is an "are you sure?" box open right now? */
export function dialogIsOpen(): boolean {
  return open !== null;
}

/** Decline and close the open box, if any (teardown). */
export function closeDialog(): void {
  if (open) open.close(false);
}

/**
 * Ask a yes / no question in the page. `onAnswer(true)` when the primary button
 * is pressed; `onAnswer(false)` for the quiet button, Escape or the backdrop.
 * Opening a second box declines the first. Returns a function that declines.
 */
export function ask(opts: AskOptions, onAnswer: (yes: boolean) => void): () => void {
  if (open) open.close(false);
  const doc = document;
  const opener = opts.opener ?? (doc.activeElement instanceof HTMLElement ? doc.activeElement : null);
  const id = `sy-dialog-title-${++seq}`;

  const backdrop = doc.createElement("div");
  backdrop.className = "sy-dialog-backdrop";

  const box = doc.createElement("div");
  box.className = "sy-dialog";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-labelledby", id);

  const h = doc.createElement("h2");
  h.id = id;
  h.className = "sy-dialog-title";
  h.textContent = opts.heading;
  box.appendChild(h);

  for (const line of Array.isArray(opts.body) ? opts.body : [opts.body]) {
    const p = doc.createElement("p");
    p.className = "sy-dialog-body";
    p.textContent = line;
    box.appendChild(p);
  }
  if (opts.list && opts.list.length > 0) {
    const ul = doc.createElement("ul");
    ul.className = "sy-dialog-list";
    for (const item of opts.list) {
      const li = doc.createElement("li");
      li.textContent = item;
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }

  const row = doc.createElement("div");
  row.className = "sy-dialog-row";
  const cancel = button(doc, opts.cancelLabel, "sy-dialog-btn quiet", "cancel");
  const confirm = button(doc, opts.confirmLabel, "sy-dialog-btn primary", "confirm");
  row.appendChild(cancel);
  row.appendChild(confirm);
  box.appendChild(row);
  backdrop.appendChild(box);
  doc.body.appendChild(backdrop);

  let done = false;
  function close(yes: boolean): void {
    if (done) return;
    done = true;
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", stopKey, true);
    backdrop.remove();
    if (open && open.close === close) open = null;
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
    onAnswer(yes);
  }

  const buttons = [cancel, confirm];
  function onKey(e: KeyboardEvent): void {
    // Nothing behind the box (the player's scan keys, the editor's Escape) hears it.
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close(false);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const at = buttons.indexOf(doc.activeElement as HTMLButtonElement);
      const next = at < 0 ? 0 : (at + (e.shiftKey ? buttons.length - 1 : 1)) % buttons.length;
      buttons[next]!.focus();
      return;
    }
    if (e.key === "Enter") {
      const target = doc.activeElement;
      if (target === cancel || target === confirm) {
        e.preventDefault();
        (target as HTMLButtonElement).click();
      }
    }
  }
  function stopKey(e: KeyboardEvent): void {
    e.stopPropagation();
  }

  cancel.addEventListener("click", () => close(false));
  confirm.addEventListener("click", () => close(true));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close(false);
  });
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", stopKey, true);

  open = { close };
  (opts.focus === "confirm" ? confirm : cancel).focus({ preventScroll: true });
  return () => close(false);
}

function button(doc: Document, text: string, cls: string, role: "confirm" | "cancel"): HTMLButtonElement {
  const b = doc.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.setAttribute("data-sy-dialog", role);
  return b;
}
