// tests/helpers/living-dialog.ts
// TASK-42a4: the living file asks its yes / no questions in its own in-file box
// (src/living/dialog.ts), not with window.confirm(). Tests answer it the way a
// teacher does: by clicking its button.

/** The open "are you sure?" box, or null. */
export function openDialog(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".sy-dialog");
}

/** Click the open box's primary (yes) or quiet (no) button; returns its heading. Throws when no box is open. */
export function answerDialog(yes: boolean): string {
  const box = openDialog();
  if (!box) throw new Error("no in-file dialog is open");
  const heading = box.querySelector("h2")?.textContent ?? "";
  box.querySelector<HTMLButtonElement>(`[data-sy-dialog="${yes ? "confirm" : "cancel"}"]`)!.click();
  return heading;
}

/** Answer the box if one is open (e.g. "Before you share" only appears when a card needs a look). */
export function answerIfAsked(yes = true): string | null {
  return openDialog() ? answerDialog(yes) : null;
}

/** Press the Teacher tab and answer "Are you the teacher?" with Open the Editor. */
export function enterTeacher(): void {
  document.querySelector<HTMLButtonElement>(".sy-teacher-tab")!.click();
  answerDialog(true);
}
