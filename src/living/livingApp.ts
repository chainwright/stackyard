// src/living/livingApp.ts
// The living-file app controller (TASK-24): Play by default, a Teacher tab that
// (behind a confirm) opens the offline editor overlay, and Save a Copy gated on
// the "before you share" reachability check. No network, no server.
//
// Play is always the default each time the file opens — the Teacher state is
// never persisted.

import type { Stack } from "../shared/types.js";
import { mountPlayer } from "../player/mount.js";
import { beforeYouShare } from "../shared/shareCheck.js";
import { cardRefLabel } from "../shared/cardTitle.js";
import { ensureLivingStyles } from "./styles.js";
import { LivingEditor } from "./editor.js";
import { saveCopy } from "./saveCopy.js";
import { snapshotPristine } from "./pristine.js";
import { renderClassResults } from "./classResults.js";
import { readClassResults } from "../shared/escapeStackJson.js";
import { decodeCode, lessonFingerprint, lessonKey } from "../shared/resultsCode.js";
import { countWords } from "../shared/classResults.js";

export interface LivingAppOptions {
  /**
   * The file's HTML as it was BEFORE anything mounted. Save a Copy is built from
   * this and nothing else (TASK-26a). The real boot (boot.ts) passes the
   * snapshot it took first thing; if a caller omits it, it is taken here, before
   * this function touches the DOM — still pristine, never the live document at
   * save time.
   */
  pristineHtml?: string;
}

/**
 * Mount the living app on an exported living file. Starts in Play. Returns a
 * teardown (useful in tests); the real file never tears down.
 */
export function mountLivingApp(
  stack: Stack,
  root: HTMLElement,
  options: LivingAppOptions = {},
): () => void {
  // Snapshot FIRST: nothing below has mounted yet (no styles, no Teacher tab,
  // no player, no overlay), so this is the file as the author exported it.
  const pristineHtml = options.pristineHtml ?? snapshotPristine(document);

  ensureLivingStyles();

  let playTeardown: (() => void) | null = null;
  let overlay: HTMLElement | null = null;
  let editor: LivingEditor | null = null;
  // The stack the file currently plays. Edits in the Teacher view update this
  // so returning to Play reflects them (and Save a Copy writes them).
  let current = stack;
  // TASK-34b5/b6: the class results codes. They live in this page, and come from
  // the file only when a saved copy kept them; they are read against the lesson
  // AS THE FILE OPENED (`stack`), the one the class played (design §4, §5).
  const openedKey = lessonKey(stack);
  let classCodes: string[] = readClassResults(pristineHtml).filter((c) => decodeCode(c, openedKey).ok);

  const teacherTab = document.createElement("button");
  teacherTab.type = "button";
  teacherTab.className = "sy-teacher-tab";
  teacherTab.textContent = "Teacher";
  teacherTab.setAttribute("aria-label", "Teacher: edit this file");
  document.body.appendChild(teacherTab);

  function startPlay(): void {
    stopPlay();
    teacherTab.style.display = "";
    playTeardown = mountPlayer(current, root, { scan: true });
  }

  function stopPlay(): void {
    if (playTeardown) {
      playTeardown();
      playTeardown = null;
    }
  }

  function openEditor(): void {
    // A gentle guard so the class can't stumble in — not security.
    const ok = window.confirm("Are you the teacher? Editing is for the teacher.");
    if (!ok) return;
    stopPlay();
    teacherTab.style.display = "none";

    overlay = document.createElement("div");
    overlay.className = "sy-living-overlay";
    // TASK-33d1/d3: the editor is a modal dialog named by its title; Escape
    // leaves it (or leaves Try It first), and focus starts on the title.
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "sy-living-title");

    const bar = document.createElement("div");
    bar.className = "sy-living-bar";
    const title = document.createElement("h1");
    title.id = "sy-living-title";
    title.tabIndex = -1;
    title.textContent = "Editing — no internet needed";
    bar.appendChild(title);
    const spacer = document.createElement("div");
    spacer.className = "sy-spacer";
    bar.appendChild(spacer);
    bar.appendChild(barButton("Play", "sy-living-btn ghost", returnToPlay));
    const resultsToggle = barButton("Class Results", "sy-living-btn ghost", toggleResults);
    resultsToggle.setAttribute("data-testid", "class-results-toggle");
    bar.appendChild(resultsToggle);
    bar.appendChild(barButton("Save a Copy", "sy-living-btn primary", doSaveCopy));
    overlay.appendChild(bar);

    const editorHost = document.createElement("div");
    editorHost.style.flex = "1 1 auto";
    editorHost.style.minHeight = "0";
    editorHost.style.display = "flex";
    overlay.appendChild(editorHost);
    const resultsHost = document.createElement("div");
    resultsHost.className = "sy-results-host";
    resultsHost.hidden = true;
    overlay.appendChild(resultsHost);
    document.body.appendChild(overlay);

    // TASK-34b5: "Class Results" swaps the card editor for the panel (the editor
    // is only hidden, so its edits and undo history are kept); "Edit Cards" back.
    function toggleResults(): void {
      if (resultsHost.hidden) {
        const panel = renderClassResults(resultsHost, {
          lesson: stack,
          edited: () => (editor ? editor.getStack() : current),
          getCodes: () => classCodes,
          setCodes: (codes) => {
            classCodes = codes;
          },
          toast: showToast,
        });
        editorHost.style.display = "none";
        resultsHost.hidden = false;
        resultsToggle.textContent = "Edit Cards";
        panel.focus();
      } else {
        resultsHost.hidden = true;
        resultsHost.innerHTML = "";
        editorHost.style.display = "flex";
        resultsToggle.textContent = "Class Results";
        resultsToggle.focus({ preventScroll: true });
      }
    }

    editor = new LivingEditor(current, editorHost, showToast);
    editor.render();
    title.focus({ preventScroll: true });
    document.addEventListener("keydown", onEscape);
  }

  /** Escape: out of Try It first, else out of the editor back to Play. */
  function onEscape(e: KeyboardEvent): void {
    if (e.key !== "Escape" || !editor) return;
    e.preventDefault();
    if (!editor.leaveTryIt()) returnToPlay();
  }

  function returnToPlay(): void {
    if (editor) current = editor.getStack();
    closeOverlay();
    startPlay();
    teacherTab.focus({ preventScroll: true });
  }

  function closeOverlay(): void {
    document.removeEventListener("keydown", onEscape);
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    editor = null;
  }

  function doSaveCopy(): void {
    if (!editor) return;
    const edited = editor.getStack();
    // "Before you share" (TASK-27f): the same check the Maker runs before it
    // exports — unreachable cards, answers/buttons that go nowhere, cards with no
    // way on, and cards still holding the words they started with. It runs BEFORE
    // anything is written. OK saves anyway; Cancel writes nothing and takes the
    // teacher to the first card with a problem.
    const check = beforeYouShare(edited, (c) => cardRefLabel(edited, c));
    if (!check.ok) {
      const lines = check.lines;
      const proceed = window.confirm(
        `Before you share:\n• ${lines.join("\n• ")}\n\nPress OK to save the copy anyway, or Cancel to go to the card.`,
      );
      if (!proceed) {
        const first = check.first;
        if (first) editor.selectCard(first.id);
        return;
      }
    }
    // TASK-34b6: the copy keeps the codes only while its quiz content is the
    // lesson the codes were read against; otherwise they would all read as
    // "from a different lesson" (design §5).
    const n = classCodes.length;
    const sameQuiz = lessonFingerprint(edited) === openedKey.fingerprint && lessonKey(edited).n === openedKey.n;
    const keep = n > 0 && sameQuiz;
    const result = saveCopy(edited, { pristineHtml, classCodes: keep ? classCodes : [] });
    if (result.ok) {
      const codesWord = `${countWords(n)} results code${n === 1 ? "" : "s"}`;
      if (keep) showToast(`Saved a copy with ${codesWord}: ${result.filename}`);
      else if (n > 0) showToast(`Saved a copy: ${result.filename}. The questions changed, so the ${codesWord} ${n === 1 ? "was" : "were"} not kept in it.`);
      else showToast(`Saved a copy: ${result.filename}`);
    } else {
      showToast(result.message);
    }
  }

  function showToast(message: string): void {
    const existing = document.querySelector(".sy-living-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = "sy-living-toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  teacherTab.addEventListener("click", openEditor);

  startPlay();

  return function teardown(): void {
    stopPlay();
    closeOverlay();
    teacherTab.remove();
  };
}

function barButton(text: string, cls: string, onClick: () => void): HTMLElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = cls;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}
