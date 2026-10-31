// src/player/errors.ts
// User-facing fatal error display for the player.
// Consistent with audience.md: plain language, no stack traces, no error codes.

/**
 * Clears `root` and appends a friendly error message.
 *
 * Message: "Something went wrong. Please ask your teacher to check the file."
 *
 * No technical detail, no stack trace — the target audience is pupils aged ~9–10.
 */
export function showFatalError(root: HTMLElement): void {
  root.innerHTML = "";

  const p = document.createElement("p");
  p.textContent =
    "Something went wrong. Please ask your teacher to check the file.";
  root.appendChild(p);
}
