// src/editor/ShareCheck.tsx
// The "Before you share" dialog (TASK-27f). It appears BEFORE anything is
// downloaded. The first version ran the same check on the "Your file is ready"
// screen — after the file had already been saved — so a teacher who had dragged
// the first file to a USB stick had already shipped the broken one (J2 #6).
//
// Three ways out: take me to the first card with a problem, export anyway (the
// teacher's call), or — when the problem is a flow problem rather than unfinished
// words — let Stackyard link the cards in for her.

import type { JSX } from "preact";
import { useEffect } from "preact/hooks";
import { Ring } from "./icons.js";

export function ShareCheck({
  lines,
  canFix,
  onTakeMe,
  onExportAnyway,
  onFix,
}: {
  /** One plain sentence per problem. */
  lines: string[];
  /** True when "Fix it for me" can help (a flow problem, not unfinished words). */
  canFix: boolean;
  onTakeMe: () => void;
  onExportAnyway: () => void;
  onFix: () => void;
}): JSX.Element {
  // TASK-33d3: Escape closes the dialog the safe way — nothing is exported, and
  // the teacher is taken to the card (the same as "Take Me There").
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onTakeMe();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onTakeMe]);
  return (
    <div class="desk-overlay">
      <section class="done-card share-dialog" role="alertdialog" aria-labelledby="share-title" aria-label="Before you share">
        <div class="done-rings" aria-hidden="true">
          <Ring />
          <Ring />
        </div>
        <div class="done-inner">
          <h1 id="share-title">Before you share</h1>
          <p class="sub">Not exported yet. The class would meet these:</p>
          <div class="share-check" role="alert">
            <ul>
              {lines.map((line) => (
                <li>{line}</li>
              ))}
            </ul>
          </div>
          <div class="done-actions">
            <button class="primary-btn" type="button" onClick={onTakeMe}>Take me to the card</button>
            <button class="ghost-btn" type="button" onClick={onExportAnyway}>Export anyway</button>
          </div>
          {canFix ? (
            <button class="link-btn" type="button" onClick={onFix}>Link these in for me</button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
