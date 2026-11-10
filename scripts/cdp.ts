// scripts/cdp.ts
// A small Chrome DevTools Protocol client for the browser gates that need more
// than --dump-dom (TASK-33d: check-a11y). It launches ONE headless Chrome on a
// port of the caller's choosing (never 9222 or 9224), with a throwaway profile,
// and talks to its first page over the DevTools WebSocket.

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import os from "node:os";
import path from "node:path";

export const CHROME_PATH = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env["CHROME_PATH"] ?? "",
].find((p) => p.length > 0 && existsSync(p));

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface CdpEvent { method: string; params: Record<string, unknown> }

export class Cdp {
  private id = 0;
  private waiting = new Map<number, (v: unknown) => void>();
  readonly events: CdpEvent[] = [];
  private constructor(private ws: WebSocket) {
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(String(e.data)) as { id?: number; result?: unknown; error?: unknown; method?: string; params?: Record<string, unknown> };
      if (msg.id !== undefined) this.waiting.get(msg.id)?.(msg.result ?? { error: msg.error });
      else if (msg.method) this.events.push({ method: msg.method, params: msg.params ?? {} });
    });
  }

  static async connect(port: number): Promise<Cdp> {
    let targets: Array<{ type: string; webSocketDebuggerUrl: string }> = [];
    for (let i = 0; i < 75 && targets.length === 0; i++) {
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

  /** Evaluate in the page (CDP evaluation: not a page <script>, so the page's CSP is untouched). */
  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send<{ result?: { value?: T }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>(
      "Runtime.evaluate",
      { expression, awaitPromise: true, returnByValue: true },
    );
    if (r.exceptionDetails) throw new Error(`page evaluation failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? "?"}`);
    return r.result?.value as T;
  }

  async until(expr: string, ms = 15000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await this.eval<boolean>(`!!(${expr})`)) return true;
      await sleep(80);
    }
    return false;
  }

  /** A real (trusted) key press: keyDown then keyUp, as a keyboard sends them. */
  async press(key: "Tab" | "Enter" | "Space" | "Escape" | "s" | "ShiftTab"): Promise<void> {
    const k = {
      Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
      ShiftTab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers: 8 },
      Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" },
      Space: { key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " },
      Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
      s: { key: "s", code: "KeyS", windowsVirtualKeyCode: 83, text: "s" },
    }[key];
    await this.send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...k });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...k, text: undefined });
  }

  /** Type text as real key input into the focused field. */
  async type(text: string): Promise<void> {
    await this.send("Input.insertText", { text });
  }

  close(): void {
    this.ws.close();
  }
}

/** Launch headless Chrome on `port` with a throwaway profile. */
export function launchChrome(chrome: string, port: number, extra: string[] = []): { proc: ChildProcess; cleanup: () => Promise<void> } {
  if (port === 9222 || port === 9224) throw new Error("ports 9222 and 9224 are reserved");
  const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-cdp-"));
  const proc = spawn(
    chrome,
    ["--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--allow-file-access-from-files", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, ...extra, "about:blank"],
    { stdio: "ignore" },
  );
  return {
    proc,
    cleanup: async () => {
      proc.kill();
      await sleep(400);
      try {
        rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
      } catch {
        /* temp profile */
      }
    },
  };
}
