// scripts/check-sample-csp.ts
// TASK-30c: a headless-Chrome check that each sample served by the REAL server at
// /samples/<name>.html plays under its strict CSP (default-src 'none'; …):
//   - a card renders,
//   - no Content-Security-Policy violation, no page exception,
//   - no network request besides the document itself,
//   - the Teacher tab opens and Save a Copy really downloads a living file.
//
//   npm run build:maker && node --import tsx/esm scripts/check-sample-csp.ts
//
// Headless only, on its own debugging port (9341) and a throwaway profile.
// Skips (exit 0) when no Chrome is found, like the other browser gates.

import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server/index.js";
import { SAMPLE_NAMES } from "../server/samples.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9341;
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

async function main(): Promise<void> {
  if (CHROME === undefined) {
    console.warn("check-sample-csp: no headless Chrome found — SKIPPING.");
    return;
  }
  const server = createServer({ serveStatic: true, staticRoot: path.join(ROOT, "dist", "maker") });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-csp-"));
  const downloads = mkdtempSync(path.join(os.tmpdir(), "stackyard-csp-dl-"));
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
    await cdp.send("Network.enable");
    await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

    for (const name of [...SAMPLE_NAMES].sort()) {
      cdp.events.length = 0;
      const url = `${base}/samples/${name}`;
      await cdp.send("Page.navigate", { url });
      const rendered = await cdp.until(`document.querySelector(".sy-card") && document.querySelector(".sy-teacher-tab")`);
      if (!rendered) problems.push(`${name}: no card rendered under the sample CSP`);
      if (!rendered && process.env["DEBUG_CSP"] === "1") {
        for (const e of cdp.events) if (/Log\.|Runtime\.(exception|console)/.test(e.method)) console.error("  event:", e.method, JSON.stringify(e.params).slice(0, 400));
      }
      await sleep(600);

      const violations = cdp.events.filter(
        (e) => (e.method === "Log.entryAdded" && /Content Security Policy|Refused to/i.test(String((e.params["entry"] as { text?: string })?.text ?? ""))) ||
          (e.method === "Runtime.exceptionThrown"),
      );
      for (const v of violations) problems.push(`${name}: ${v.method} ${JSON.stringify(v.params).slice(0, 200)}`);

      const requests = cdp.events
        .filter((e) => e.method === "Network.requestWillBeSent")
        .map((e) => String((e.params["request"] as { url?: string }).url))
        .filter((u) => !u.startsWith("data:") && !u.startsWith("blob:") && u !== url);
      if (requests.length > 0) problems.push(`${name}: made network requests: ${requests.join(", ")}`);

      // The sample's own page headers, as the browser saw them.
      const csp = await cdp.eval<string>(`fetch(location.href).then(r => r.headers.get("content-security-policy")).catch(() => "BLOCKED")`);
      if (csp !== "BLOCKED") problems.push(`${name}: a fetch() from the sample was NOT blocked by connect-src 'none' (got ${String(csp).slice(0, 60)})`);

      if (name === "vikings-in-ireland.html") {
        await cdp.eval(`window.confirm = () => true`);
        await cdp.eval(`document.querySelector(".sy-teacher-tab")?.click()`);
        if (!(await cdp.until(`document.querySelector(".sy-living-overlay")`, 8000))) problems.push(`${name}: the Teacher tab did not open`);
        await cdp.eval(`[...document.querySelectorAll(".sy-living-bar button")].find((b) => /Save a Copy/i.test(b.textContent))?.click()`);
        let copy: string | undefined;
        for (let i = 0; i < 60 && copy === undefined; i++) {
          copy = readdirSync(downloads).find((f) => f.includes("(copy") && !f.endsWith(".crdownload"));
          if (copy === undefined) await sleep(250);
        }
        if (copy === undefined) problems.push(`${name}: Save a Copy did not download a file under the sample CSP`);
        else {
          await sleep(300);
          const text = readFileSync(path.join(downloads, copy), "utf8");
          if (!text.includes("sy-teacher-tab") || !text.includes('id="stack-data"')) problems.push(`${name}: the saved copy is not a living file`);
          if (statSync(path.join(downloads, copy)).size < 50_000) problems.push(`${name}: the saved copy is suspiciously small`);
        }
      }
      console.log(`check-sample-csp: ${problems.length === 0 ? "OK" : "…"} — ${name} (card rendered, no violation, no request)`);
    }
    cdp.close();
  } finally {
    chrome.kill();
    server.close();
    await sleep(500);
    for (const d of [profile, downloads]) {
      try {
        rmSync(d, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* temp dir */
      }
    }
  }
  if (problems.length > 0) {
    for (const p of problems) console.error("check-sample-csp: FAIL — " + p);
    process.exit(1);
  }
  console.log("check-sample-csp: OK — TASK-30c: every sample plays and Save a Copy works under the sample CSP.");
}

main().catch((err) => {
  console.error("check-sample-csp:", err instanceof Error ? err.message : err);
  process.exit(1);
});
