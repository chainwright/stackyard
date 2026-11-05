// src/living/livingApp.ts
// The living-file app controller (TASK-24): Play by default, a Teacher tab that
// (behind a confirm) opens the offline editor overlay, and Save a Copy gated on
// the "before you share" reachability check. No network, no server.
//
// Play is always the default each time the file opens — the Teacher state is
// never persisted.

import type { Stack } from "../shared/types.js";
import { mountPlayer } from "../player/mount.js";
import { checkReachability } from "../shared/reachability.js";
import { ensureLivingStyles } from "./styles.js";
import { LivingEditor } from "./editor.js";
import { saveCopy } from "./saveCopy.js";

/**
 * Mount the living app on an exported living file. Starts in Play. Returns a
 * teardown (useful in tests); the real file never tears down.
 */
export function mountLivingApp(stack: Stack, root: HTMLElement): () => void {
  ensureLivingStyles();

  let playTeardown: (() => void) | null = null;
  let overlay: HTMLElement | null = null;
  let editor: LivingEditor | null = null;
  // The stack the file currently plays. Edits in the Teacher view update this
  // so returning to Play reflects them (and Save a Copy writes them).
  let current = stack;

  const teacherTab = document.createElement("button");
  teacherTab.type = "button";
  teacherTab.className = "sy-teacher-tab";
  teacherTab.textContent = "Teacher";
  teacherTab.setAttribute("aria-label", "Teacher: edit this file");
  document.body.appendChild(teacherTab);

  function startPlay(): void {
    stopPlay();
    teacherTab.style.display = "";
    playTeardown = mountPlayer(current, root);
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

    const bar = document.createElement("div");
    bar.className = "sy-living-bar";
    const title = document.createElement("h1");
    title.textContent = "Editing — no internet needed";
    bar.appendChild(title);
    const spacer = document.createElement("div");
    spacer.className = "sy-spacer";
    bar.appendChild(spacer);
    bar.appendChild(barButton("Play", "sy-living-btn ghost", returnToPlay));
    bar.appendChild(barButton("Save a Copy", "sy-living-btn primary", doSaveCopy));
    overlay.appendChild(bar);

    const editorHost = document.createElement("div");
    editorHost.style.flex = "1 1 auto";
    editorHost.style.minHeight = "0";
    editorHost.style.display = "flex";
    overlay.appendChild(editorHost);
    document.body.appendChild(overlay);

    editor = new LivingEditor(current, editorHost, showToast);
    editor.render();
  }

  function returnToPlay(): void {
    if (editor) current = editor.getStack();
    closeOverlay();
    startPlay();
  }

  function closeOverlay(): void {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    editor = null;
  }

  function doSaveCopy(): void {
    if (!editor) return;
    const edited = editor.getStack();
    // "Before you share": warn about unreachable cards / dead-end answers.
    const report = checkReachability(edited);
    if (!report.ok) {
      const bits: string[] = [];
      if (report.unreachable.length > 0) {
        bits.push(`${report.unreachable.length} card(s) the class can't reach`);
      }
      if (report.deadEndQuiz.length > 0) {
        bits.push(`${report.deadEndQuiz.length} card(s) with an answer that goes nowhere`);
      }
      const proceed = window.confirm(
        `Before you share: ${bits.join(" and ")}. Save the copy anyway?`,
      );
      if (!proceed) return;
    }
    const result = saveCopy(edited);
    if (result.ok) {
      showToast(`Saved a copy: ${result.filename}`);
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
