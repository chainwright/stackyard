// scripts/check-maker-fonts.ts
// TASK-30h (review fix): every font the Maker declares must really LOAD under the
// real server's Content-Security-Policy. check-maker-fit opens the Maker from
// file://, which does not enforce `font-src 'self'`, so it cannot see the real
// failure (Vite inlining digits.woff2 as a data: URI, which the server's CSP
// blocks). This check:
//   - builds the Maker to a temp dir (default config, so a config regression shows),
//   - starts the REAL server (createServer + serveStatic → applySecurityHeaders),
//   - opens it over http://127.0.0.1 in headless Chrome,
//   - on the Start screen and in the editor (a ready-made deck) loads every
//     FontFace, waits for document.fonts.ready, and fails naming each one whose
//     status is not "loaded" (and any CSP "Refused to load the font" message).
//
//   node --import tsx/esm scripts/check-maker-fonts.ts
//
// Headless only. Its own debugging port (9342) and a throwaway profile; never
// 9222 or 9224. Skips (exit 0) when no Chrome is found, like the other browser gates.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9342;
const CHROME = [
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

/** Load every declared FontFace, wait for fonts.ready, and list each face that is not "loaded". */
const FONT_REPORT = `(async () => {
  const faces = [];
  document.fonts.forEach((f) => faces.push(f));
  await Promise.all(faces.map((f) => f.load().catch(() => {})));
  await document.fonts.ready;
  return JSON.stringify({
    count: faces.length,
    bad: faces.filter((f) => f.status !== "loaded").map((f) => f.family + " " + f.weight + " (" + f.status + ")"),
  });
})()`;

async function main(): Promise<void> {
  if (CHROME === undefined) {
    console.warn("check-maker-fonts: no headless Chrome found — SKIPPING the real-server font check.");
    return;
  }
  const out = mkdtempSync(path.join(os.tmpdir(), "stackyard-fonts-"));
  execFileSync("npx", ["vite", "build", "--outDir", out, "--emptyOutDir", "--logLevel", "error"], { stdio: "inherit", cwd: ROOT });

  const server = createServer({ serveStatic: true, staticRoot: out });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}/`;

  const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-fonts-profile-"));
  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"],
    { stdio: "ignore" },
  );
  const problems: string[] = [];
  try {
    const cdp = await Cdp.connect();
    await cdp.send("Page.enable");
    await cdp.send("Log.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

    const csp = await (async () => {
      const res = await fetch(base);
      return res.headers.get("content-security-policy") ?? "";
    })();
    if (!/font-src 'self'/.test(csp)) problems.push(`the server did not send the Maker CSP with font-src 'self' (got "${csp.slice(0, 80)}") — this check would prove nothing`);

    const report = async (where: string): Promise<void> => {
      const raw = await cdp.eval<string>(FONT_REPORT);
      const r = JSON.parse(raw ?? '{"count":0,"bad":["no report"]}') as { count: number; bad: string[] };
      if (r.count === 0) problems.push(`${where}: the page declares no FontFace at all`);
      for (const b of r.bad) problems.push(`${where}: font ${b} is not loaded`);
      console.log(`check-maker-fonts: ${r.bad.length === 0 && r.count > 0 ? "OK" : "…"} — ${where}: ${r.count} fonts declared, ${r.bad.length} not loaded`);
    };

    // Start screen.
    await cdp.eval(`try { localStorage.removeItem("stackyard:maker:v1"); } catch (e) {}`);
    await cdp.send("Page.navigate", { url: base });
    if (!(await cdp.until(`document.querySelector(".start-card h1")`))) problems.push("the Start screen never appeared over http");
    await report("Start screen");

    // Editor, through a ready-made deck (client-side; no API call).
    if (!(await cdp.until(`document.querySelector(".ready-made-link")`))) problems.push("no ready-made deck link on the Start screen");
    await cdp.eval(`document.querySelector(".ready-made-link")?.click()`);
    if (!(await cdp.until(`document.querySelector(".sy-card .sy-element, .sy-card .sy-flash")`))) problems.push("the editor never showed a card");
    await report("Editor (ready-made deck)");

    // The CSP itself: a font the page asked for must not have been refused.
    const refused = cdp.events
      .filter((e) => e.method === "Log.entryAdded")
      .map((e) => String((e.params["entry"] as { text?: string })?.text ?? ""))
      .filter((t) => /font/i.test(t) && /Refused|Content Security Policy/i.test(t));
    for (const t of refused) problems.push(`the browser refused a font: ${t.slice(0, 160)}`);
    cdp.close();
  } finally {
    chrome.kill();
    server.close();
    await sleep(500);
    for (const d of [profile, out]) {
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* temp dir */
      }
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error("check-maker-fonts: FAIL — TASK-30h: " + p);
    process.exit(1);
  }
  console.log("check-maker-fonts: OK — TASK-30h: every Maker font loads under the real server's CSP.");
}

main().catch((err) => {
  console.error("check-maker-fonts:", err instanceof Error ? err.message : err);
  process.exit(1);
});
