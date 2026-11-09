// scripts/mutation-lib.ts
// Small pure helpers for scripts/mutation-check.ts, split out so a test can
// import them (mutation-check.ts runs its main() on import).
//
// TASK-31f (J04 P1): when the baseline is not green the runner used to say only
// "the guarding tests are not green on the unmodified code" — a reader could not
// tell which test failed or whether it was a flake. It now prints the tail of the
// failing command's output.

/** The last `n` non-empty lines of `text`. */
export function tailLines(text: string, n = 40): string {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  return lines.slice(-n).join("\n");
}

/** The message printed when the unmodified code does not pass its own tests/gate. */
export function baselineFailureMessage(kind: "tests" | "gate", output: string, n = 40): string {
  const what = kind === "tests" ? "the guarding tests are" : "the browser gate is";
  const tail = tailLines(output, n);
  return [
    `mutation-check: ${what} not green on the unmodified code; fix that first.`,
    "mutation-check: tail of the failing output (re-run it alone to tell a real failure from a flake or a loaded machine):",
    tail.length > 0 ? tail : "(the command printed nothing)",
  ].join("\n");
}
