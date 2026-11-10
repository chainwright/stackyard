// scripts/check-a11y.ts
// TASK-33d: the accessibility gate, in headless Chrome over the DevTools
// protocol (scripts/cdp.ts, its own port 9351 — never 9222 / 9224).
//
//   d1  axe-core (pinned devDependency) is injected by CDP evaluation — never a
//       <script src>, so every page keeps its real CSP — and run on:
//         - the Maker Start screen and the editor with a ready-made deck,
//           served by the REAL server (its strict CSP) from dist/maker;
//         - the 3 samples, served by the real server at /samples/, in Play
//           and with the Teacher tab open;
//         - a class (play-only) export of the Vikings deck;
//         - the first 5 files in bench/files/.
//       docs/accessibility/axe-report.json gets, per page, the violations by
//       impact (rule ids, node counts) and the passes count, with the axe
//       version and the date. Any serious or critical violation fails.
//   d3  Keyboard only: samples/vikings-in-ireland.html is played to the end
//       score with real key events (Tab / Enter / Space — no mouse, no
//       element.click()). Then, still by keyboard, the Teacher tab is opened,
//       a question is changed and Save a Copy writes a copy that carries it.
//       The focus ring is checked on the way (3px, ink).
//   d4  Scan mode: the same sample is finished with ONLY the Space key after
//       "S" turns scanning on (the S key is part of the opt-in, not of play).
//
//   npm run build:maker && npm run build:player && npm run build:living && node --import tsx/esm scripts/check-a11y.ts
//   A11Y_ONLY=axe|keyboard|scan   run one part
//
// Native confirm() dialogs are browser UI that is keyboard-operable on its own;
// the harness answers them (window.confirm = () => true) so the run never
// blocks. Skips (exit 0) when no Chrome is found, like the other browser gates.

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "../server/index.js";
import { exportStack } from "../server/exporter.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";
import { Cdp, CHROME_PATH, launchChrome, sleep } from "./cdp.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9351;
const REPORT = path.join(ROOT, "docs", "accessibility", "axe-report.json");
const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve("axe-core/axe.min.js");
const AXE_VERSION = (JSON.parse(readFileSync(path.join(path.dirname(AXE_PATH), "package.json"), "utf8")) as { version: string }).version;
/** The rule sets we run: WCAG 2.0 / 2.1 / 2.2 A and AA, plus Deque's best practices. */
export const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

export interface PageReport {
  page: string;
  url: string;
  violations: Record<"critical" | "serious" | "moderate" | "minor", Array<{ id: string; nodes: number }>>;
  passes: number;
}

interface AxeRaw {
  violations: Array<{ id: string; impact: string | null; nodes: unknown[] }>;
  passes: unknown[];
}

const RUN_AXE = `(async () => {
  const r = await axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} }, resultTypes: ["violations", "passes"] });
  return JSON.stringify({ violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.map((n) => n.target.join(" ")) })), passes: r.passes });
})()`;

async function audit(cdp: Cdp, page: string, url: string): Promise<PageReport> {
  const present = await cdp.eval<boolean>("typeof window.axe !== 'undefined'");
  if (!present) await cdp.eval(readFileSync(AXE_PATH, "utf8") + "\n;true");
  const raw = JSON.parse(await cdp.eval<string>(RUN_AXE)) as AxeRaw;
  // A stable name for the page (no random port, no temp folder), so the report only changes when a result does.
  const where = url.startsWith("file:") ? `file:${path.basename(fileURLToPath(url))}` : new URL(url).pathname;
  const out: PageReport = { page, url: where, violations: { critical: [], serious: [], moderate: [], minor: [] }, passes: raw.passes.length };
  for (const v of raw.violations) {
    const impact = (v.impact ?? "minor") as keyof PageReport["violations"];
    out.violations[impact].push({ id: v.id, nodes: v.nodes.length });
    if (process.env["A11Y_VERBOSE"] === "1") console.log(`    ${impact} ${v.id}: ${(v.nodes as string[]).slice(0, 4).join(" | ")}`);
  }
  return out;
}

const settle = `(() => { if (document.getAnimations) document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} }); return true; })()`;

async function open(cdp: Cdp, url: string, ready: string): Promise<boolean> {
  await cdp.send("Page.navigate", { url });
  const ok = await cdp.until(ready, 20000);
  await sleep(400);
  await cdp.eval(settle);
  return ok;
}

// ---------------------------------------------------------------------------
// d1: the axe audit

async function runAxe(cdp: Cdp, base: string, tmp: string, problems: string[]): Promise<PageReport[]> {
  const pages: PageReport[] = [];
  const add = async (page: string, url: string, ready: string, after?: () => Promise<void>): Promise<void> => {
    if (!(await open(cdp, url, ready))) {
      problems.push(`${page}: the page never became ready (${ready})`);
      return;
    }
    if (after) await after();
    const r = await audit(cdp, page, url);
    pages.push(r);
    const bad = [...r.violations.critical, ...r.violations.serious];
    const all = Object.values(r.violations).flat();
    console.log(`check-a11y: ${bad.length === 0 ? "OK " : "…  "} — axe ${page}: ${r.passes} passes; violations ${all.map((v) => v.id).join(", ") || "none"}`);
  };

  await cdp.eval(`try { localStorage.clear(); } catch (e) {}`);
  await add("Maker: Start screen", base, `document.querySelector(".start-card h1")`);
  await add("Maker: editor (ready-made deck)", base, `document.querySelector(".ready-made-link")`, async () => {
    await cdp.eval(`document.querySelector(".ready-made-link").click()`);
    if (!(await cdp.until(`document.querySelector(".sy-card .sy-element, .sy-card .sy-flash")`))) problems.push("Maker: the editor never showed a card");
    await sleep(400);
    await cdp.eval(settle);
  });
  await cdp.eval(`try { localStorage.clear(); } catch (e) {}`);

  for (const name of ["irish-words.html", "times-tables.html", "vikings-in-ireland.html"]) {
    const url = `${base}samples/${name}`;
    await add(`Sample ${name}: Play`, url, `document.querySelector("#player-root .sy-card")`);
    await add(`Sample ${name}: Teacher tab`, url, `document.querySelector(".sy-teacher-tab")`, async () => {
      await cdp.eval(`window.confirm = () => true; document.querySelector(".sy-teacher-tab").click(); true`);
      if (!(await cdp.until(`document.querySelector(".sy-living-overlay .sy-living-inspector")`))) problems.push(`${name}: the Teacher tab did not open`);
      await sleep(300);
      await cdp.eval(settle);
    });
  }

  const classFile = path.join(tmp, "vikings-class.html");
  writeFileSync(classFile, await exportStack(vikingsStack()), "utf8");
  await add("Class export (Vikings, play-only)", pathToFileURL(classFile).href, `document.querySelector("#player-root .sy-card")`);

  const benchDir = path.join(ROOT, "bench", "files");
  const bench = readdirSync(benchDir).filter((f) => f.endsWith(".html")).sort().slice(0, 5);
  for (const f of bench) await add(`Bench ${f}: Play`, pathToFileURL(path.join(benchDir, f)).href, `document.querySelector("#player-root .sy-card")`);

  for (const p of pages) for (const v of [...p.violations.critical, ...p.violations.serious]) problems.push(`axe ${p.page}: ${v.id} (${v.nodes} node${v.nodes === 1 ? "" : "s"})`);
  return pages;
}

// ---------------------------------------------------------------------------
// d3: keyboard only

/** What has focus, in one line. */
const FOCUSED = `(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "body";
  const inRoot = !!a.closest("#player-root");
  const kind = a.classList.contains("sy-tile") ? (a.getAttribute("data-correct") === "true" ? "tile-right" : "tile")
    : a.classList.contains("sy-flash") ? "flash"
    : a.classList.contains("sy-teacher-tab") ? "teacher"
    : a.classList.contains("sy-button") ? "button"
    : a.tagName.toLowerCase();
  const cs = getComputedStyle(a);
  return JSON.stringify({ kind, inRoot, text: (a.getAttribute("aria-label") || a.textContent || "").trim().slice(0, 60),
    outline: cs.outlineStyle + " " + cs.outlineWidth + " " + cs.outlineColor, disabled: !!a.disabled });
})()`;

interface Focus { kind: string; inRoot: boolean; text: string; outline: string; disabled: boolean }

async function focused(cdp: Cdp): Promise<Focus | null> {
  const raw = await cdp.eval<string>(FOCUSED);
  return raw === "body" ? null : (JSON.parse(raw) as Focus);
}

const CARD_KEY = `(() => { const r = document.getElementById("player-root"); const m = r && r.querySelector(".sy-meta"); return (r && r.querySelector(".sy-end-card")) ? "END" : (m ? m.textContent : "") + "|" + ((r && r.querySelector(".sy-card")) ? (r.querySelector(".sy-card").getAttribute("aria-label") || "") : ""); })()`;

/** The design-system focus ring: 3px solid ink (#1E2A47 = rgb(30, 42, 71)). */
function ringOk(f: Focus): boolean {
  return /^solid 3px rgb\(30, 42, 71\)$/.test(f.outline);
}

async function waitForChange(cdp: Cdp, before: string, ms = 6000): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await cdp.eval(settle);
    if ((await cdp.eval<string>(CARD_KEY)) !== before) return true;
    await sleep(100);
  }
  return false;
}

async function runKeyboard(cdp: Cdp, base: string, problems: string[]): Promise<{ steps: number; score: string; ring: boolean; saved: boolean }> {
  const url = `${base}samples/vikings-in-ireland.html`;
  if (!(await open(cdp, url, `document.querySelector("#player-root .sy-card")`))) {
    problems.push("keyboard: the Vikings sample never rendered");
    return { steps: 0, score: "", ring: false, saved: false };
  }
  let ring = true;
  let steps = 0;
  let score = "";
  for (; steps < 60; steps++) {
    const key = await cdp.eval<string>(CARD_KEY);
    if (key === "END") break;
    // Tab until a control on the card has focus: the right answer, a flash card,
    // a Next Card / story button. Order: never the Teacher tab before the card.
    let target: Focus | null = null;
    for (let t = 0; t < 14 && target === null; t++) {
      await cdp.press("Tab");
      const f = await focused(cdp);
      if (process.env["A11Y_VERBOSE"] === "1") console.log(`    tab → ${f ? `${f.kind} "${f.text}" inRoot=${f.inRoot}` : "body"}`);
      if (f === null) continue;
      if (f.kind === "teacher") {
        problems.push(`keyboard: Tab reached the Teacher tab before any control on "${key.slice(0, 40)}"`);
        break;
      }
      if (!f.inRoot || f.disabled) continue;
      if (!ringOk(f)) {
        ring = false;
        problems.push(`keyboard: the focus ring on ${f.kind} "${f.text}" is "${f.outline}", not 3px solid ink`);
      }
      if (f.kind === "tile-right" || f.kind === "flash" || f.kind === "button") target = f;
    }
    if (target === null) {
      problems.push(`keyboard: no control reachable by Tab on "${key.slice(0, 60)}"`);
      break;
    }
    if (target.kind === "flash") {
      await cdp.press("Enter"); // flip to the back
      await sleep(300);
      // Tab on to the Next Card button and press Space (both keys activate).
      let next: Focus | null = null;
      for (let t = 0; t < 6 && next === null; t++) {
        await cdp.press("Tab");
        const f = await focused(cdp);
        if (f && f.inRoot && f.kind === "button") next = f;
      }
      if (next === null) {
        problems.push("keyboard: no Next Card button after flipping a flash card");
        break;
      }
      await cdp.press("Space");
    } else {
      await cdp.press(steps % 2 === 0 ? "Enter" : "Space");
    }
    if (!(await waitForChange(cdp, key))) {
      problems.push(`keyboard: pressing the key on ${target.kind} "${target.text}" did not move on`);
      break;
    }
  }
  if ((await cdp.eval<string>(CARD_KEY)) === "END") {
    score = await cdp.eval<string>(`(document.querySelector("#player-root .sy-end-score") || {}).textContent || ""`);
    if (!/^Score \d+ of \d+$/.test(score)) problems.push(`keyboard: the end card shows no score ("${score}")`);
  } else problems.push(`keyboard: did not reach the end card in ${steps} steps`);
  console.log(`check-a11y: ${score ? "OK " : "…  "} — keyboard: Vikings played to "${score}" in ${steps} cards with Tab / Enter / Space only`);

  // The Teacher tab, by keyboard: Tab to it, Enter, edit a question, Save a Copy.
  await cdp.eval(`window.confirm = () => true;
    window.__syCopy = null;
    URL.createObjectURL = function (b) { b.text().then((t) => { window.__syCopy = t; }); return "blob:a11y"; };
    URL.revokeObjectURL = function () {};
    HTMLAnchorElement.prototype.click = function () {}; true`);
  let tab: Focus | null = null;
  for (let t = 0; t < 12 && tab === null; t++) {
    await cdp.press("Tab");
    const f = await focused(cdp);
    if (f && f.kind === "teacher") tab = f;
  }
  if (tab === null) {
    problems.push("keyboard: the Teacher tab is not reachable by Tab");
    return { steps, score, ring, saved: false };
  }
  await cdp.press("Enter");
  if (!(await cdp.until(`document.querySelector(".sy-living-overlay")`, 5000))) {
    problems.push("keyboard: Enter on the Teacher tab did not open the editor");
    return { steps, score, ring, saved: false };
  }
  // Tab to the question in the preview and press Enter: the inspector's text box takes focus.
  let editing = false;
  for (let t = 0; t < 30 && !editing; t++) {
    await cdp.press("Tab");
    const isQuestion = await cdp.eval<boolean>(`!!(document.activeElement && document.activeElement.closest(".sy-living-canvas") && document.activeElement.querySelector(".sy-question"))`);
    if (isQuestion) {
      await cdp.press("Enter");
      editing = await cdp.until(`document.activeElement && document.activeElement.matches(".sy-living-inspector textarea")`, 3000);
    }
  }
  if (!editing) {
    problems.push("keyboard: could not select the question and reach its text box by keyboard");
    return { steps, score, ring, saved: false };
  }
  const NEW = " (keyboard edit)";
  await cdp.eval(`(() => { const t = document.activeElement; t.selectionStart = t.selectionEnd = t.value.length; return true; })()`);
  await cdp.type(NEW);
  // Shift+Tab back to the bar's Save a Copy, then Enter.
  let save = false;
  for (let t = 0; t < 40 && !save; t++) {
    await cdp.press("ShiftTab");
    const f = await focused(cdp);
    save = f !== null && f.text === "Save a Copy";
  }
  if (!save) {
    problems.push("keyboard: Save a Copy is not reachable by Shift+Tab from the text box");
    return { steps, score, ring, saved: false };
  }
  await cdp.press("Enter");
  const got = await cdp.until(`typeof window.__syCopy === "string"`, 5000);
  const copy = got ? await cdp.eval<string>(`window.__syCopy`) : "";
  const saved = copy.includes(NEW.trim()) && copy.includes('id="stack-data"');
  if (!saved) problems.push("keyboard: Save a Copy (by Enter) did not write a copy carrying the edited question");
  // Escape leaves the editor back to Play.
  await cdp.press("Escape");
  const backToPlay = await cdp.until(`!document.querySelector(".sy-living-overlay") && document.querySelector("#player-root .sy-card")`, 3000);
  if (!backToPlay) problems.push("keyboard: Escape did not leave the Teacher editor");
  console.log(`check-a11y: ${saved && backToPlay ? "OK " : "…  "} — keyboard: Teacher tab → question edited → Save a Copy → Escape, all by keyboard`);
  return { steps, score, ring, saved: saved && backToPlay };
}

// ---------------------------------------------------------------------------
// d4: one-switch scan mode

async function runScan(cdp: Cdp, base: string, problems: string[]): Promise<{ steps: number; score: string }> {
  const url = `${base}samples/vikings-in-ireland.html`;
  if (!(await open(cdp, url, `document.querySelector("#player-root .sy-card")`))) {
    problems.push("scan: the Vikings sample never rendered");
    return { steps: 0, score: "" };
  }
  // Faster scanning for the gate (1 s, the minimum a teacher can set).
  await cdp.eval(`try { sessionStorage.setItem("stackyard:scan-ms", "1000"); } catch (e) {} true`);
  await cdp.press("s");
  if (!(await cdp.until(`document.documentElement.classList.contains("sy-scanning")`, 3000))) {
    problems.push("scan: the S key did not turn scan mode on");
    return { steps: 0, score: "" };
  }
  let steps = 0;
  for (; steps < 80; steps++) {
    const key = await cdp.eval<string>(CARD_KEY);
    if (key === "END") break;
    // Wait (doing nothing) until the scan highlights something worth picking:
    // the right answer, else any non-tile control (flash, Next Card, a story choice).
    const want = await cdp.until(
      `(() => { const a = document.activeElement; if (!a || !a.closest("#player-root") || !a.classList.contains("sy-scan-focus")) return false;
        const tiles = document.querySelectorAll("#player-root .sy-tile");
        if (document.querySelector("#player-root .sy-flash-back")) return a.classList.contains("sy-button");
        return tiles.length === 0 ? true : a.getAttribute("data-correct") === "true"; })()`,
      12000,
    );
    if (!want) {
      problems.push(`scan: the highlight never reached a choice on "${key.slice(0, 60)}"`);
      break;
    }
    // A flash card flips (same card); anything else moves on.
    const wasFront = !(await cdp.eval<boolean>(`!!document.querySelector("#player-root .sy-flash-back")`));
    await cdp.press("Space");
    await sleep(250);
    await cdp.eval(settle);
    const flipped = wasFront && (await cdp.eval<boolean>(`!!document.querySelector("#player-root .sy-flash-back")`));
    if (!flipped && !(await waitForChange(cdp, key))) {
      problems.push(`scan: Space did not pick the highlighted control on "${key.slice(0, 60)}"`);
      break;
    }
  }
  let score = "";
  if ((await cdp.eval<string>(CARD_KEY)) === "END") {
    score = await cdp.eval<string>(`(document.querySelector("#player-root .sy-end-score") || {}).textContent || ""`);
    if (!/^Score \d+ of \d+$/.test(score)) problems.push(`scan: the end card shows no score ("${score}")`);
  } else problems.push(`scan: did not reach the end card in ${steps} presses`);
  console.log(`check-a11y: ${score ? "OK " : "…  "} — scan: Vikings finished to "${score}" with the Space key only (${steps} presses)`);
  return { steps, score };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (CHROME_PATH === undefined) {
    console.warn("check-a11y: no headless Chrome found — SKIPPING.");
    return;
  }
  const only = process.env["A11Y_ONLY"];
  const server = createServer({ serveStatic: true, staticRoot: path.join(ROOT, "dist", "maker") });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "stackyard-a11y-"));
  const chrome = launchChrome(CHROME_PATH, PORT);
  const problems: string[] = [];
  let pages: PageReport[] = [];
  let keyboard = { steps: 0, score: "", ring: false, saved: false };
  let scan = { steps: 0, score: "" };
  try {
    const cdp = await Cdp.connect(PORT);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    if (only === undefined || only === "axe") pages = await runAxe(cdp, base, tmp, problems);
    if (only === undefined || only === "keyboard") keyboard = await runKeyboard(cdp, base, problems);
    if (only === undefined || only === "scan") scan = await runScan(cdp, base, problems);
    cdp.close();
  } finally {
    await chrome.cleanup();
    server.close();
    rmSync(tmp, { recursive: true, force: true });
  }

  if (only === undefined) {
    const count = (impact: keyof PageReport["violations"]): number => pages.reduce((n, p) => n + p.violations[impact].reduce((m, v) => m + v.nodes, 0), 0);
    const report = {
      about: "Automated accessibility audit (TASK-33d1). axe-core injected by DevTools evaluation into headless Chrome; pages keep their real CSP. Not a screen-reader user test.",
      axeVersion: AXE_VERSION,
      tags: AXE_TAGS,
      date: new Date().toISOString().slice(0, 10),
      pages,
      totals: {
        pages: pages.length,
        critical: count("critical"),
        serious: count("serious"),
        moderate: count("moderate"),
        minor: count("minor"),
      },
      keyboard: { playThrough: keyboard.score.length > 0, endScore: keyboard.score, cards: keyboard.steps, focusRing: keyboard.ring, teacherEditAndSave: keyboard.saved },
      scan: { playThrough: scan.score.length > 0, endScore: scan.score, presses: scan.steps },
    };
    mkdirSync(path.dirname(REPORT), { recursive: true });
    if (problems.length === 0) {
      // Rewrite the report only when the date is the only difference, or the content moved.
      const prev = (() => { try { return JSON.parse(readFileSync(REPORT, "utf8")) as { date: string }; } catch { return null; } })();
      const same = prev !== null && JSON.stringify({ ...prev, date: "" }) === JSON.stringify({ ...report, date: "" });
      if (!same) writeFileSync(REPORT, JSON.stringify(report, null, 2) + "\n", "utf8");
    }
  }

  if (problems.length > 0) {
    for (const p of problems) console.error(`check-a11y: FAIL — ${p}`);
    process.exit(1);
  }
  console.log(`check-a11y: OK — TASK-33d: ${pages.length} pages audited with axe ${AXE_VERSION} (0 serious, 0 critical); keyboard-only play-through and Teacher edit pass; scan mode finishes a sample with Space only.`);
}

main().catch((err) => {
  console.error("check-a11y:", err instanceof Error ? err.message : err);
  process.exit(1);
});
