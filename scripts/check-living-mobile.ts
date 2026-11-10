// scripts/check-living-mobile.ts
// TASK-31b: the Teacher tab fits a phone. A headless-Chrome check that, at
// 390 x 844, a living file's Teacher tab
//   - shows the WHOLE card inside the viewport (nothing clipped by the viewport or
//     by any ancestor's overflow, no sideways scroll),
//   - gives the card the full width (it is not squeezed beside the card list),
//   - folds the card list behind a "Cards" toggle that opens it,
//   - puts the inspector BELOW the card,
// and, at a desktop width, that the layout is the old one (list beside the card,
// no toggle). It saves docs/media/teacher-390.png.
//
//   npm run build:player && npm run build:living && node --import tsx/esm scripts/check-living-mobile.ts
//
// Headless only, on its own debugging port (9343) and a throwaway profile.
// Skips (exit 0) when no Chrome is found, like the other browser gates.

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exportLivingStack } from "../server/exporter.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9343;
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: unknown) => void>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as { id?: number; result?: unknown };
      if (msg.id !== undefined) this.waiting.get(msg.id)?.(msg.result);
    });
  }
  static async connect(): Promise<Cdp> {
    let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = [];
    for (let i = 0; i < 60 && targets.length === 0; i++) {
      try {
        targets = ((await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as typeof targets).filter((t) => t.type === "page");
      } catch {
        await sleep(200);
      }
    }
    if (targets.length === 0) throw new Error("Chrome did not start");
    const ws = new WebSocket(targets[0]!.webSocketDebuggerUrl);
    await new Promise<void>((res, rej) => {
      ws.addEventListener("open", () => res());
      ws.addEventListener("error", () => rej(new Error("devtools socket failed")));
    });
    return new Cdp(ws);
  }
  send<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.id;
    return new Promise((resolve) => {
      this.waiting.set(id, (v) => resolve(v as T));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{ result?: { value?: T } }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return r.result?.value as T;
  }
  async until(expr: string, ms = 15000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await this.eval<boolean>(`!!(${expr})`)) return true;
      await sleep(120);
    }
    return false;
  }
  close(): void {
    this.ws.close();
  }
}

/** Measure the open Teacher tab; returns a list of problems (empty = fine) and facts. */
const MEASURE = (phone: boolean): string => `(() => {
  const problems = [];
  const vw = window.innerWidth;
  const q = (s) => document.querySelector(s);
  const card = q(".sy-living-canvas .sy-card");
  const canvas = q(".sy-living-canvas");
  const list = q(".sy-living-list");
  const toggle = q(".sy-cards-toggle");
  const insp = q(".sy-living-inspector");
  if (!card || !canvas || !list || !insp || !toggle) return JSON.stringify({ problems: ["the Teacher tab is missing its card, canvas, list, toggle or inspector"] });
  const r = card.getBoundingClientRect();
  const PHONE = ${phone ? "true" : "false"};
  if (r.left < -0.5 || r.right > vw + 0.5) problems.push("the card is outside the viewport horizontally (" + Math.round(r.left) + " to " + Math.round(r.right) + " of " + vw + ")");
  // Not clipped by any ancestor that hides overflow.
  for (let n = card.parentElement; n && n !== document.documentElement; n = n.parentElement) {
    const cs = getComputedStyle(n);
    const clips = [cs.overflowX, cs.overflowY, cs.overflow].some((o) => o && o !== "visible");
    if (!clips) continue;
    const a = n.getBoundingClientRect();
    if (r.left < a.left - 1 || r.right > a.right + 1 || r.top < a.top - 1 || r.bottom > a.bottom + 1) {
      problems.push("the card is clipped by <" + n.tagName.toLowerCase() + " class='" + (n.className || "") + "'> (card " + Math.round(r.left) + "," + Math.round(r.top) + "," + Math.round(r.right) + "," + Math.round(r.bottom) + " in " + Math.round(a.left) + "," + Math.round(a.top) + "," + Math.round(a.right) + "," + Math.round(a.bottom) + ")");
    }
  }
  if (document.documentElement.scrollWidth > vw + 1) problems.push("the page scrolls sideways (" + document.documentElement.scrollWidth + " > " + vw + ")");
  const lr = list.getBoundingClientRect();
  const ir = insp.getBoundingClientRect();
  const listShown = getComputedStyle(list).display !== "none";
  const toggleShown = getComputedStyle(toggle).display !== "none";
  if (PHONE) {
    if (listShown) problems.push("the card list is still open beside the card on a phone");
    if (!toggleShown) problems.push("there is no Cards toggle on a phone");
    if (r.width < vw * 0.8) problems.push("the card only gets " + Math.round(r.width) + " px of " + vw + " px");
    if (ir.top < card.parentElement.getBoundingClientRect().bottom - 1) problems.push("the inspector is not below the card");
  } else {
    if (!listShown) problems.push("desktop: the card list is hidden");
    if (toggleShown) problems.push("desktop: the Cards toggle is showing");
    if (ir.left < r.right - 1) problems.push("desktop: the inspector is not beside the card");
    if (lr.right > r.left + 1) problems.push("desktop: the list overlaps the card");
  }
  return JSON.stringify({ problems, card: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] });
})()`;

async function openTeacher(cdp: Cdp, url: string, width: number, height: number): Promise<void> {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
  await cdp.send("Page.navigate", { url });
  if (!(await cdp.until(`document.querySelector(".sy-teacher-tab")`))) throw new Error("the living file did not boot");
  await cdp.eval(`window.confirm = () => true; document.querySelector(".sy-teacher-tab").click(); 1`);
  if (!(await cdp.until(`document.querySelector(".sy-living-canvas .sy-card")`))) throw new Error("the Teacher tab did not show a card");
  await sleep(700); // the card settles (flip-in, fit scale)
}

// ---------------------------------------------------------------------------
// TASK-36c5: the PLAY view on a phone is a portrait card.

const SETTLE = `(() => { if (document.getAnimations) document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} }); return 1; })()`;

/** What the play view measures: the card's share of the screen, overflow, meta size, tile heights. */
const MEASURE_PLAY = `(() => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const card = document.querySelector("#player-root .sy-card");
  if (!card) return JSON.stringify({ error: "no card" });
  const r = card.getBoundingClientRect();
  const meta = document.querySelector("#player-root .sy-meta");
  const tiles = Array.from(document.querySelectorAll("#player-root .sy-tile")).map((t) => Math.round(t.getBoundingClientRect().height));
  // Every tile fully inside the visible card (not cut off by its bottom edge or the screen).
  const clipped = Array.from(document.querySelectorAll("#player-root .sy-tile")).filter((t) => {
    const b = t.getBoundingClientRect();
    return b.bottom > Math.min(r.bottom, vh) + 0.5 || b.top < r.top - 0.5;
  }).length;
  const stack = document.querySelector("#player-root .sy-card-stack");
  return JSON.stringify({
    area: (Math.min(r.right, vw) - Math.max(r.left, 0)) * (Math.min(r.bottom, vh) - Math.max(r.top, 0)) / (vw * vh),
    width: Math.round(r.width),
    overflowX: document.documentElement.scrollWidth > vw || document.body.scrollWidth > vw || r.right > vw + 0.5 || r.left < -0.5,
    metaPx: meta ? parseFloat(getComputedStyle(meta).fontSize) * (r.width / card.offsetWidth) : 0,
    tiles,
    clipped,
    portrait: document.getElementById("player-root").classList.contains("sy-portrait"),
    stackTransform: stack ? getComputedStyle(stack).transform : "",
    rootTransform: getComputedStyle(document.getElementById("player-root")).transform,
  });
})()`;

interface PlayFacts { error?: string; area: number; width: number; overflowX: boolean; metaPx: number; tiles: number[]; clipped: number; portrait: boolean; stackTransform: string; rootTransform: string }

async function openPlay(cdp: Cdp, url: string, width: number, height: number): Promise<PlayFacts> {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
  await cdp.send("Page.navigate", { url });
  if (!(await cdp.until(`document.querySelector("#player-root .sy-card .sy-tile")`))) throw new Error("the lesson did not show its first question");
  await sleep(500);
  await cdp.eval(SETTLE);
  await sleep(200);
  return JSON.parse(await cdp.eval<string>(MEASURE_PLAY)) as PlayFacts;
}

/** The 390 x 844 play-view problems (empty when it passes). */
export function phonePlayProblems(f: PlayFacts): string[] {
  const p: string[] = [];
  if (f.error) return [f.error];
  if (!f.portrait) p.push("the player is not in portrait mode");
  if (f.area < 0.7) p.push(`the card fills ${Math.round(f.area * 100)} % of the screen (need at least 70 %)`);
  if (f.overflowX) p.push("the play view overflows sideways");
  if (f.metaPx < 14) p.push(`the "Card N of M" text renders at ${f.metaPx.toFixed(1)} px (need at least 14)`);
  if (f.tiles.length === 0) p.push("no answer tiles");
  for (const h of f.tiles) if (h < 44) p.push(`a tile is ${h} px tall (need at least 44)`);
  if (f.clipped > 0) p.push(`${f.clipped} answer tile(s) are cut off by the card's edge`);
  return p;
}

async function main(): Promise<void> {
  if (CHROME === undefined) {
    console.warn("check-living-mobile: no headless Chrome found — SKIPPING.");
    return;
  }
  const dir = mkdtempSync(path.join(os.tmpdir(), "stackyard-livingm-"));
  const file = path.join(dir, "living.html");
  writeFileSync(file, await exportLivingStack(vikingsStack()), "utf8");
  const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-livingm-profile-"));
  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"],
    { stdio: "ignore" },
  );
  const problems: string[] = [];
  try {
    const cdp = await Cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const url = `file://${file}`;

    // ---- phone: 390 x 844 ----
    await openTeacher(cdp, url, 390, 844);
    const phone = JSON.parse(await cdp.eval<string>(MEASURE(true))) as { problems: string[] };
    for (const p of phone.problems) problems.push("390x844: " + p);
    // The toggle opens the list, and a card in it can be chosen.
    await cdp.eval(`document.querySelector(".sy-cards-toggle").click(); 1`);
    const opened = await cdp.eval<boolean>(`getComputedStyle(document.querySelector(".sy-living-list")).display !== "none"`);
    if (!opened) problems.push("390x844: the Cards toggle did not open the card list");
    await cdp.eval(`document.querySelector(".sy-cards-toggle").click(); 1`);
    // Screenshot of the settled Teacher tab.
    const shot = await cdp.send<{ data?: string }>("Page.captureScreenshot", { format: "png" });
    if (shot.data) {
      const out = path.join(ROOT, "docs", "media", "teacher-390.png");
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(shot.data, "base64"));
    } else problems.push("390x844: no screenshot came back");

    // ---- desktop: the old layout ----
    await openTeacher(cdp, url, 1366, 768);
    const desk = JSON.parse(await cdp.eval<string>(MEASURE(false))) as { problems: string[] };
    for (const p of desk.problems) problems.push("1366x768: " + p);

    // ---- TASK-36c5: the PLAY view, phone then desktop ----
    const play = await openPlay(cdp, url, 390, 844);
    for (const p of phonePlayProblems(play)) problems.push("TASK-36c5 play 390x844: " + p);
    const playShot = await cdp.send<{ data?: string }>("Page.captureScreenshot", { format: "png" });
    if (playShot.data) {
      const out = path.join(ROOT, "docs", "media", "play-390.png");
      mkdirSync(path.dirname(out), { recursive: true });
      writeFileSync(out, Buffer.from(playShot.data, "base64"));
    } else problems.push("TASK-36c5 play 390x844: no screenshot came back");
    console.log(`check-living-mobile: play 390x844 — card ${play.width} px wide, ${Math.round(play.area * 100)} % of the screen, meta ${play.metaPx.toFixed(1)} px, tiles ${play.tiles.join("/")} px tall.`);
    const deskPlay = await openPlay(cdp, url, 1366, 768);
    if (deskPlay.rootTransform === "none" || !/matrix/.test(deskPlay.rootTransform)) problems.push("TASK-36c5 play 1366x768: the desktop card is no longer the scaled 800 x 600 card");
    if (deskPlay.width < 700) problems.push(`TASK-36c5 play 1366x768: the desktop card is ${deskPlay.width} px wide`);
    cdp.close();
  } finally {
    chrome.kill();
    await sleep(500);
    for (const d of [profile, dir]) {
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* temp dir */
      }
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error("check-living-mobile: FAIL — TASK-31b: " + p);
    process.exit(1);
  }
  console.log("check-living-mobile: OK — TASK-31b: at 390x844 the card fits, the list folds behind Cards and the inspector sits below (docs/media/teacher-390.png); desktop is unchanged. TASK-36c5: the play view is a portrait card (docs/media/play-390.png).");
}

main().catch((err) => {
  console.error("check-living-mobile:", err instanceof Error ? err.message : err);
  process.exit(1);
});
