// scripts/check-bench-offline.ts
// TASK-33c5: open EVERY curriculum-bench lesson file (bench/files/*.html) in
// headless Chrome with the network BLOCKED and assert, per file:
//   - a card renders;
//   - the first card plays (press the right tile, the flash card or the first
//     button, and the card changes);
//   - 0 network requests (anything that is not file:, data:, blob: or about:);
//   - no page exception.
//
//   node --import tsx/esm scripts/check-bench-offline.ts [DIR]     (default bench/files)
//   BENCH_SAMPLE=5 …                                               (the first 5 files only)
//
// Headless only, one Chrome on its own debugging port (9347, never 9222/9224)
// and a throwaway profile; every host maps to NOTFOUND, the proxy is a dead
// address and DevTools emulates "offline". Skips (exit 0) when no Chrome is
// found, like the other browser gates.

import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9347;
export const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

interface Ev { method: string; params: Record<string, unknown> }

class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: unknown) => void>();
  readonly events: Ev[] = [];
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as { id?: number; result?: unknown; method?: string; params?: Record<string, unknown> };
      if (msg.id !== undefined) this.waiting.get(msg.id)?.(msg.result);
      else if (msg.method) this.events.push({ method: msg.method, params: msg.params ?? {} });
    });
  }
  static async connect(): Promise<Cdp> {
    let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = [];
    for (let i = 0; i < 75 && targets.length === 0; i++) {
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
  async until(expr: string, ms = 10000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await this.eval<boolean>(`!!(${expr})`)) return true;
      await sleep(80);
    }
    return false;
  }
  close(): void {
    this.ws.close();
  }
}

/** Press the first card's way on: the right tile, else the flash card, else the first button. */
const PLAY_FIRST = `(() => {
  const root = document.getElementById("player-root");
  if (!root) return "none";
  if (document.getAnimations) document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} });
  window.__syBefore = root.innerHTML;
  const tile = root.querySelector(".sy-tile[data-correct='true']") || root.querySelector(".sy-tile");
  if (tile) { tile.click(); return "tile"; }
  const flash = root.querySelector(".sy-flash");
  if (flash) { const nb = root.querySelector(".sy-flash-next button"); (nb || flash).click(); return "flash"; }
  const b = root.querySelector(".sy-button");
  if (b) { b.click(); return "button"; }
  return "none";
})()`;

/** Open each file offline; one line per problem (empty when every file passes). */
export async function checkFilesOffline(files: string[], chrome: string, log: (s: string) => void = () => {}): Promise<string[]> {
  const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-bench-"));
  const proc = spawn(
    chrome,
    [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files",
      `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
      "--host-resolver-rules=MAP * ~NOTFOUND", "--proxy-server=http://0.0.0.0:0",
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const problems: string[] = [];
  try {
    const cdp = await Cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    for (const file of files) {
      const name = path.basename(file);
      cdp.events.length = 0;
      await cdp.send("Page.navigate", { url: pathToFileURL(file).href });
      const rendered = await cdp.until(`document.querySelector("#player-root .sy-card")`);
      if (!rendered) {
        problems.push(`${name}: no card rendered offline`);
        continue;
      }
      const how = await cdp.eval<string>(PLAY_FIRST);
      const played = how !== "none" && (await cdp.until(`document.getElementById("player-root").innerHTML !== window.__syBefore`, 6000));
      if (!played) problems.push(`${name}: the first card did not play (pressed: ${how})`);
      await sleep(150);
      const requests = cdp.events
        .filter((e) => e.method === "Network.requestWillBeSent")
        .map((e) => String((e.params["request"] as { url?: string }).url))
        .filter((u) => !/^(?:file|data|blob|about):/.test(u));
      if (requests.length > 0) problems.push(`${name}: ${requests.length} network request(s): ${requests.slice(0, 3).join(", ")}`);
      const errors = cdp.events.filter((e) => e.method === "Runtime.exceptionThrown");
      if (errors.length > 0) problems.push(`${name}: page exception ${JSON.stringify(errors[0]!.params).slice(0, 200)}`);
      log(`check-bench-offline: ${played && requests.length === 0 && errors.length === 0 ? "OK " : "…  "} — ${name} (card rendered, first card played via ${how}, ${requests.length} requests)`);
    }
    cdp.close();
  } finally {
    proc.kill();
    await sleep(300);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* temp profile */
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const dir = path.resolve(process.argv[2] ?? path.join(ROOT, "bench", "files"));
  let files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".html")).sort().map((f) => path.join(dir, f)) : [];
  const total = files.length;
  const sample = Number(process.env["BENCH_SAMPLE"] ?? "");
  if (Number.isFinite(sample) && sample > 0) files = files.slice(0, sample);
  if (files.length === 0) {
    console.log("check-bench-offline: 0 recorded — no bench files to open (TASK-33c5).");
    return;
  }
  if (CHROME === undefined) {
    console.warn("check-bench-offline: no headless Chrome found — SKIPPING.");
    return;
  }
  const t0 = Date.now();
  const problems = await checkFilesOffline(files, CHROME, (s) => console.log(s));
  if (problems.length > 0) {
    for (const p of problems) console.error(`check-bench-offline: FAIL — ${p}`);
    process.exit(1);
  }
  console.log(
    `check-bench-offline: OK — TASK-33c5: ${files.length}${files.length < total ? ` of ${total}` : ""} bench files render, play their first card and make 0 network requests offline (${Date.now() - t0} ms).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("check-bench-offline:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
