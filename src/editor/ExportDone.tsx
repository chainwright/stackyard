// src/editor/ExportDone.tsx
// The "file exported" confirmation overlay (export-done mockup). Shown after a
// successful export triggers the browser download. Red is used only on the
// earned "Exported ✓" stamp (design-system five-role rule).

import type { JSX } from "preact";
import type { Stack } from "../shared/types.js";
import { Ring } from "./icons.js";
import { checkReachability, describeProblems } from "../shared/reachability.js";
import { cardRefLabel } from "../shared/cardTitle.js";

/** The content line of a card, for naming it in the check ("Card 5 — …").
 *  Uses the question/front/story text, never a caption or image credit. */
function cardLabel(stack: Stack, cardId: string): string {
  const card = stack.cards.find((c) => c.id === cardId);
  return card ? cardRefLabel(stack, card) : "a card";
}

export function ExportDone({
  filename,
  stack,
  onOpen,
  onBack,
  onExportAgain,
  onFixFlow,
  living = false,
  showCheck = true,
}: {
  /**
   * Show the "Before you share" box here. The Maker runs that check BEFORE the
   * download (ShareCheck) and passes false; this stays for a standalone
   * ExportDone (and its tests).
   */
  showCheck?: boolean;
  /** True when the file just exported is a living file (has the Teacher tab). */
  living?: boolean;
  filename: string;
  /** The exported stack, for the "before you share" reachability check. */
  stack: Stack;
  onOpen: () => void;
  onBack: () => void;
  onExportAgain: () => void;
  /** One-click fix: link unreachable cards into the flow (then re-export). */
  onFixFlow: () => void;
}): JSX.Element {
  const report = checkReachability(stack);

  return (
    <div class="desk-overlay">
      <section class="done-card" aria-label="File exported">
        <div class="done-rings" aria-hidden="true">
          <Ring />
          <Ring />
        </div>
        <div class="done-inner">
          <span class="done-stamp" aria-hidden="true">Exported ✓</span>
          <h1>Your file is ready</h1>
          <p class="sub">We've saved your set of cards as one file.</p>
          <span class="filename">{filename}</span>

          {/* "Before you share" check (J2 item 3): warn about cards the class
              can't reach or answers that dead-end, with a one-click fix. */}
          {showCheck && !report.ok ? (
            <div class="share-check" role="alert">
              <h2>Before you share</h2>
              <ul>
                {describeProblems(report, (c) => cardLabel(stack, c.id)).map((line) => (
                  <li>{line}</li>
                ))}
              </ul>
              <button class="ghost-btn" type="button" onClick={onFixFlow}>
                Link these in and export again
              </button>
            </div>
          ) : null}

          <ol class="steps">
            <li><span class="n">1</span><span>Email it or put it on a USB stick.</span></li>
            <li><span class="n">2</span><span>Double-click on the class laptop.</span></li>
            <li><span class="n">3</span><span>No internet needed — try it with Wi-Fi off.</span></li>
          </ol>
          {living ? (
            <p class="hint teacher-hint">
              Open it and press <strong>Teacher</strong> in the corner to change a
              word — even with no internet.
            </p>
          ) : null}

          <div class="done-actions">
            <button class="primary-btn" type="button" onClick={onOpen}>Open the File</button>
            <button class="ghost-btn" type="button" onClick={onBack}>Back to Editing</button>
          </div>
          <button class="link-btn" type="button" onClick={onExportAgain}>Export again</button>
        </div>
      </section>
    </div>
  );
}
