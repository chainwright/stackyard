// src/living/classResults.ts
// The "Class results" panel in the Teacher tab (TASK-34b5,
// .kiro/specs/class-results/design.md §4). The teacher types or pastes the
// codes her pupils' last cards show; the panel shows each question's right /
// wrong / did-not-reach counts, the middle score and what to revisit.
//
// Plain DOM like the rest of the living chrome, built from escaped HTML
// strings (smaller than createElement chains; every typed or lesson text goes
// through esc()). No network, no storage API: the codes live in the open page
// (and in a copy only if she saves one).

import type { Stack } from "../shared/types.js";
import { lessonFingerprint, lessonKey } from "../shared/resultsCode.js";
import { addCodes, countWords, formatScore, missedLine, resultsText, statusLine, tally, type Problem } from "../shared/classResults.js";

export interface ClassResultsContext {
  /** The lesson as this file opened: what the class played (design §4). */
  lesson: Stack;
  /** The lesson as edited in this session, if it has been. */
  edited: () => Stack;
  getCodes: () => string[];
  setCodes: (codes: string[]) => void;
  toast: (message: string) => void;
}

export interface ClassResultsPanel {
  /** Move focus to the panel's heading. */
  focus: () => void;
}

const WORD: Record<string, string> = { right: "right", wrong: "wrong", none: "did not reach it" };
const MARK: Record<string, string> = { right: "✓", wrong: "✗", none: "–" };

/** Escape text for HTML (element content and double-quoted attributes). */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const btn = (text: string, id: string): string => `<button type="button" class="sy-living-btn" data-testid="${id}">${text}</button>`;
const hint = (text: string, cls = ""): string => `<p class="sy-living-hint${cls}">${esc(text)}</p>`;
const ths = (cols: string[]): string => `<thead><tr>${cols.map((c) => `<th scope="col">${esc(c)}</th>`).join("")}</tr></thead>`;

/** Build the panel into `host` (emptied first). */
export function renderClassResults(host: HTMLElement, ctx: ClassResultsContext): ClassResultsPanel {
  const key = lessonKey(ctx.lesson);
  const head = `<h2 id="sy-results-title" tabindex="-1">Class results</h2>`;
  if (key.n === 0) {
    host.innerHTML = `<section class="sy-results" aria-labelledby="sy-results-title">${head}${hint("This lesson has no questions, so its last card shows no results code.")}</section>`;
  } else {
    const changed =
      lessonFingerprint(ctx.edited()) !== key.fingerprint
        ? hint("You've changed the questions since this file opened. Codes are read against the questions the class played.", " warn")
        : "";
    host.innerHTML =
      `<section class="sy-results" aria-labelledby="sy-results-title">${head}` +
      hint("Type or paste the codes from your pupils' last card: one per line, or with spaces between them. Nothing leaves this laptop.") +
      changed +
      `<div class="sy-living-field sy-noprint"><label for="sy-results-codes">Results codes</label>` +
      `<textarea id="sy-results-codes" data-testid="results-codes-input" spellcheck="false" autocapitalize="characters" autocomplete="off"></textarea>` +
      `<div class="sy-living-row">${btn("Add Codes", "results-add")}${btn("Clear Codes", "results-clear")}</div></div>` +
      `<p class="sy-results-status" role="status" tabindex="-1" data-testid="results-status"></p>` +
      `<ul class="sy-results-problems sy-noprint" data-testid="results-problems"></ul><div class="sy-results-body"></div>` +
      `<div class="sy-living-row sy-noprint">${btn("Copy as Text", "results-copy")}${btn("Print Results", "results-print")}</div>` +
      `<div class="sy-living-field sy-noprint" id="sy-results-textcopy" hidden><label for="sy-results-text">Results as text</label><textarea id="sy-results-text" readonly></textarea></div></section>`;
  }
  const heading = host.querySelector<HTMLElement>("#sy-results-title")!;
  const panel = { focus: () => heading.focus({ preventScroll: true }) };
  if (key.n === 0) return panel;

  const q = <T extends HTMLElement>(sel: string): T => host.querySelector<T>(sel)!;
  const box = q<HTMLTextAreaElement>("#sy-results-codes");
  const status = q<HTMLElement>(".sy-results-status");
  const problemList = q<HTMLElement>(".sy-results-problems");
  const body = q<HTMLElement>(".sy-results-body");
  const textField = q<HTMLElement>("#sy-results-textcopy");
  const textBox = q<HTMLTextAreaElement>("#sy-results-text");
  const on = (id: string, f: () => void): void => q<HTMLElement>(`[data-testid="${id}"]`).addEventListener("click", f);

  const showProblems = (problems: Problem[]): void => {
    problemList.innerHTML = problems
      .map((p) => `<li${p.kind === "bad" ? ' data-kind="bad"' : ""}><strong>${esc(p.typed)}</strong> — ${esc(p.message)}</li>`)
      .join("");
  };

  on("results-add", () => {
    const r = addCodes(ctx.getCodes(), box.value, key, lessonKey(ctx.edited()));
    ctx.setCodes(r.codes);
    box.value = r.keep;
    showProblems(r.problems);
    status.textContent = statusLine(tally(ctx.lesson, r.codes).pupils.length, r.problems.filter((p) => p.kind === "bad").length);
    draw();
    status.focus({ preventScroll: true });
  });

  on("results-clear", () => {
    const n = ctx.getCodes().length;
    if (n === 0 || !window.confirm(n === 1 ? "Clear the one code?" : `Clear all ${countWords(n)} codes?`)) return;
    ctx.setCodes([]);
    showProblems([]);
    status.textContent = "All codes cleared.";
    draw();
  });

  on("results-copy", () => {
    const text = resultsText(tally(ctx.lesson, ctx.getCodes()), ctx.lesson.title);
    textBox.value = text;
    const copied = (): void => ctx.toast("Copied the results as text.");
    const fallback = (): void => {
      textField.hidden = false;
      textBox.focus();
      textBox.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      if (ok) copied();
      else ctx.toast("Select the text below and copy it.");
    };
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip && typeof clip.writeText === "function") clip.writeText(text).then(copied, fallback);
    else fallback();
  });

  on("results-print", () => {
    const root = document.documentElement;
    root.classList.add("sy-printing");
    const done = (): void => root.classList.remove("sy-printing");
    window.addEventListener("afterprint", done, { once: true });
    try {
      window.print();
    } finally {
      setTimeout(done, 1000);
    }
  });

  /** The tables, from the codes now held. */
  function draw(): void {
    const t = tally(ctx.lesson, ctx.getCodes());
    const P = t.pupils.length;
    if (P === 0) {
      body.innerHTML = `<p>No codes yet.</p>`;
      return;
    }
    const rows = t.questions
      .map(
        (r) =>
          `<tr data-q="${r.q}"><th scope="row">${esc(`Q${r.q} ${r.question}`)}</th>` +
          `<td>${r.right}</td><td>${r.wrong}</td><td>${r.none}</td></tr>`,
      )
      .join("");
    const missed = t.questions.filter((r) => r.wrong > 0).map((r) => `<li>${esc(missedLine(r, P))}</li>`).join("");
    const revisit =
      t.revisit.length === 0
        ? `<p>No question was missed by a third or more of the pupils who answered it.</p>`
        : `<ol class="sy-results-revisit" data-testid="results-revisit">${t.revisit
            .map((n) => `<li data-q="${n}">${esc(`${missedLine(t.questions[n - 1]!, P)}: ${t.questions[n - 1]!.question}`)}</li>`)
            .join("")}</ol>`;
    const pupils = t.pupils
      .map(
        (p) =>
          `<tr><th scope="row"${p.hasInitials ? ' data-initials="true"' : ""}>${esc(p.name)}</th><td>${p.score} of ${t.n}</td>` +
          p.results.map((r) => `<td data-result="${r}"><span aria-hidden="true">${MARK[r]}</span><span class="sy-sr-only">${WORD[r]}</span></td>`).join("") +
          `</tr>`,
      )
      .join("");
    body.innerHTML =
      `<p class="sy-results-summary" data-testid="results-summary">${P} pupil${P === 1 ? "" : "s"} · Middle score (median): ${formatScore(t.median!)} of ${t.n}</p>` +
      `<table class="sy-results-table" data-testid="results-questions"><caption>Each question</caption>${ths(["Question", "Right", "Wrong", "Did not reach"])}<tbody>${rows}</tbody></table>` +
      (missed ? `<ul data-testid="results-missed">${missed}</ul>` : "") +
      `<h3>Questions to revisit</h3>${revisit}` +
      // Each pupil, in a keyboard-scrollable region (axe scrollable-region-focusable).
      `<div class="sy-results-scroll" tabindex="0" role="region" aria-label="Each pupil"><table class="sy-results-table" data-testid="results-pupils"><caption>Each pupil</caption>` +
      `${ths(["Pupil", "Score", ...t.questions.map((r) => `Q${r.q}`)])}<tbody>${pupils}</tbody></table></div>`;
  }

  // Codes kept from a saved copy, or added earlier in this sitting.
  const start = tally(ctx.lesson, ctx.getCodes()).pupils.length;
  status.textContent = start === 0 ? "" : statusLine(start, 0);
  draw();
  return panel;
}
