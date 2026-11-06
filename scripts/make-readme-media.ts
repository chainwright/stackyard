// scripts/make-readme-media.ts
// TASK-28t: real screenshots (and a short GIF) of the CURRENT build for the
// README — sentence → cards deal in → edit → Try It (the CORRECT stamp) →
// export → the file opened offline. Nothing is mocked: it starts the real
// server (no model key, so the ready-made offline path answers, which is what
// the frames show), drives the built Maker in a real headless Chrome over the
// DevTools protocol, then opens a committed sample from disk with the network
// emulated OFF.
//
//   npm run build:maker && npm run build:player && npm run build:living
//   node --import tsx/esm scripts/make-readme-media.ts      # writes docs/media/
//
// Needs Chrome (same lookup as the other gates) and ffmpeg (for the GIF only;
// without it the PNGs are still written).

import { existsSync, mkdirSync, mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server/index.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "media");
const CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

const SENTENCE = "A 10-card quiz about the Vikings in Ireland, the right answer plays a cheer";
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---- a tiny DevTools-protocol client (Node 24 has a global WebSocket) ----
class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: unknown) => void>();
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as { id?: number; result?: unknown };
      if (msg.id !== undefined) this.waiting.get(msg.id)?.(msg.result);
    });
  }
  static async connect(port: number): Promise<Cdp> {
    let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = [];
    for (let i = 0; i < 50 && targets.length === 0; i++) {
      try {
        targets = ((await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as typeof targets).filter((t) => t.type === "page");
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
  async goto(url: string): Promise<void> {
    await this.send("Page.navigate", { url });
    await sleep(900);
  }
  async until(expr: string, ms = 20000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await this.eval<boolean>(`!!(${expr})`)) return true;
      await sleep(120);
    }
    return false;
  }
  async shot(file: string): Promise<void> {
    const r = await this.send<{ data: string }>("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(r.data, "base64"));
  }
  close(): void {
    this.ws.close();
  }
}

async function main(): Promise<void> {
  if (CHROME === undefined) {
    console.error("make-readme-media: no Chrome found — set CHROME_PATH.");
    process.exit(1);
  }
  if (!existsSync(path.join(ROOT, "dist", "maker", "index.html"))) {
    console.error("make-readme-media: run `npm run build:maker` first.");
    process.exit(1);
  }
  delete process.env["STACKYARD_LLM_API_KEY"]; // the offline ready-made path answers
  mkdirSync(OUT, { recursive: true });
  const frames = mkdtempSync(path.join(os.tmpdir(), "stackyard-frames-"));
  let n = 0;
  const gifFrames: Array<{ file: string; seconds: number }> = [];
  const keep = async (cdp: Cdp, name: string | null, seconds: number): Promise<void> => {
    const f = name !== null ? path.join(OUT, name) : path.join(frames, `f${String(++n).padStart(3, "0")}.png`);
    await cdp.shot(f);
    gifFrames.push({ file: f, seconds });
  };

  const server = createServer({
    serveStatic: true,
    staticRoot: path.join(ROOT, "dist", "maker"),
    generateRatePer10Min: 1000,
    generateDailyCap: 100000,
  });
  await new Promise<void>((r) => server.listen(0, r));
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;

  const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-media-"));
  const port = 9333;
  const chrome = spawn(
    CHROME,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--allow-file-access-from-files", "about:blank"],
    { stdio: "ignore" },
  );
  try {
    const cdp = await Cdp.connect(port);
    await cdp.send("Page.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });

    // 1. The sentence.
    await cdp.goto(`${base}/`);
    await cdp.eval(`localStorage.clear()`);
    await cdp.goto(`${base}/`);
    await cdp.until(`document.querySelector("#sentence")`);
    await cdp.eval(`(() => { const t = document.querySelector("#sentence"); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set; set.call(t, ${JSON.stringify(SENTENCE)}); t.dispatchEvent(new Event("input", { bubbles: true })); })()`);
    await sleep(300);
    await keep(cdp, "1-sentence.png", 2);

    // 2. Cards deal in.
    await cdp.eval(`[...document.querySelectorAll("button")].find((b) => /Build Cards/i.test(b.textContent)).click()`);
    // The offline path deals one card every ~400 ms: grab frames while it does.
    let dealt = false;
    let sawDeal = false;
    for (let i = 0; i < 90 && !dealt; i++) {
      await sleep(150);
      const state = await cdp.eval<{ deck: boolean; cards: number }>(
        `({ deck: !!document.querySelector(".deal"), cards: document.querySelectorAll(".deal-card .deal-q, .deal-card .deal-num").length })`,
      );
      if (!state.deck) {
        if (sawDeal) break; // the editor took over
        continue;
      }
      sawDeal = true;
      if (i % 2 === 0) await keep(cdp, null, 0.4);
      if (state.cards >= 5) {
        dealt = true;
        await cdp.shot(path.join(OUT, "2-cards-deal-in.png"));
      }
    }
    if (!dealt) throw new Error("never saw the cards being dealt");

    // 3. The editor.
    await cdp.until(`document.querySelector(".sy-card .sy-element")`, 30000);
    await sleep(900);
    await keep(cdp, "3-edit.png", 2);

    // 4. Try It → the CORRECT stamp on the right answer.
    await cdp.eval(`document.querySelector(".tryit").click()`);
    await cdp.until(`document.querySelector(".sy-card .sy-tile")`, 8000);
    await sleep(700);
    const clicked = await cdp.eval<boolean>(`(() => {
      const stack = JSON.parse(localStorage.getItem("stackyard:maker:v1") || "null");
      const card = stack && stack.cards.find((c) => c.kind === "quiz");
      if (!card) return false;
      const right = card.elements.find((e) => e.type === "button" && e.actions.some((a) => a.type === "score" && a.delta === 1));
      const tiles = [...document.querySelectorAll(".sy-card .sy-tile")];
      const tile = tiles.find((t) => (t.textContent || "").includes(right.label));
      if (!tile) return false;
      tile.click();
      return true;
    })()`);
    if (!clicked) throw new Error("could not click the right answer in Try It");
    await sleep(350);
    await keep(cdp, "4-correct-stamp.png", 2);

    // 5. Export → "EXPORTED ✓".
    await cdp.eval(`[...document.querySelectorAll("button")].find((b) => /Trying It|Back to Editing/i.test(b.textContent))?.click()`);
    await sleep(600);
    await cdp.eval(`document.querySelector(".export-btn").click()`);
    await cdp.until(`document.querySelector(".share-dialog, .done-card")`, 10000);
    if (await cdp.eval<boolean>(`!!document.querySelector(".share-dialog")`)) {
      await cdp.eval(`[...document.querySelectorAll("button")].find((b) => /Export anyway/i.test(b.textContent)).click()`);
    }
    await cdp.until(`document.querySelector(".done-card")`, 10000);
    await sleep(500);
    await keep(cdp, "5-exported.png", 2);

    // 6. The file, opened from disk with the network OFF.
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await cdp.goto(`file://${path.join(ROOT, "samples", "vikings-in-ireland.html")}`);
    await cdp.until(`document.querySelector(".sy-card .sy-element")`, 10000);
    await sleep(900);
    await keep(cdp, "6-offline-file.png", 2.5);

    cdp.close();
  } finally {
    chrome.kill();
    server.close();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* Chrome may still be flushing its profile; a temp dir is harmless */
    }
  }

  // The GIF: palette-based, 720 px wide, each frame held for its own time.
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status === 0 && gifFrames.length > 0) {
    const list = gifFrames.map((f) => `file '${f.file}'\nduration ${f.seconds}`).join("\n") + `\nfile '${gifFrames[gifFrames.length - 1]!.file}'\n`;
    const listFile = path.join(frames, "list.txt");
    writeFileSync(listFile, list);
    const gif = path.join(OUT, "demo.gif");
    const r = spawnSync(
      "ffmpeg",
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listFile, "-vf", "fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4", "-loop", "0", gif],
      { stdio: "inherit" },
    );
    if (r.status !== 0) console.warn("make-readme-media: ffmpeg could not build the GIF.");
    else console.log(`make-readme-media: wrote docs/media/demo.gif (${(readFileSync(gif).byteLength / 1024).toFixed(0)} KB)`);
  } else {
    console.warn("make-readme-media: ffmpeg not found — PNGs written, no GIF.");
  }
  rmSync(frames, { recursive: true, force: true });
  console.log("make-readme-media: wrote docs/media/*.png");
}

main().catch((err) => {
  console.error("make-readme-media:", err instanceof Error ? err.message : err);
  process.exit(1);
});
