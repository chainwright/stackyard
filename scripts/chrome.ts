// scripts/chrome.ts
// One place that launches headless Chrome for the browser gates
// (check-living-file, make-samples, check-export-opens). Learnt the hard way:
//
//   - Chrome prints the COMPLETE dumped DOM and then, on this machine, often
//     hangs on shutdown: "Teardown watchdog expired; recording dump and
//     terminating", exit status 2. The output is fine; only the exit code is
//     wrong. So a launch is judged by its OUTPUT (a complete document), not by
//     its exit status. (Using execFileSync threw on that status and made every
//     gate look flaky.)
//   - back-to-back launches that share Chrome's default profile can collide, so
//     every launch gets its OWN throwaway --user-data-dir;
//   - a launch that produces no complete document is retried once.

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface ChromeRun {
  /** Extra flags (e.g. --virtual-time-budget, --window-size). */
  flags: string[];
  /** The page to open. */
  url: string;
  /** Real-time timeout for one launch, ms. */
  timeoutMs?: number;
}

/** True when `dom` looks like a complete serialised document. */
export function isCompleteDom(dom: string): boolean {
  return /<\/html>\s*$/i.test(dom.trimEnd());
}

/** Run headless Chrome with the network BLOCKED and return the dumped DOM. */
export function dumpDomOffline(chrome: string, run: ChromeRun): string {
  let detail = "no output";
  for (let attempt = 0; attempt < 2; attempt++) {
    const profile = mkdtempSync(path.join(os.tmpdir(), "stackyard-chrome-"));
    try {
      const r = spawnSync(
        chrome,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-sandbox",
          "--allow-file-access-from-files",
          `--user-data-dir=${profile}`,
          // Block ALL network: every host resolves to NOTFOUND, and the proxy is
          // a dead address. A self-contained file needs neither; any stray
          // request fails hard, proving the file is offline.
          "--host-resolver-rules=MAP * ~NOTFOUND",
          "--proxy-server=http://0.0.0.0:0",
          ...run.flags,
          "--dump-dom",
          run.url,
        ],
        {
          encoding: "utf8",
          maxBuffer: 128 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
          timeout: run.timeoutMs ?? 120_000,
        },
      );
      const out = r.stdout ?? "";
      // Judge the OUTPUT. A complete document is a good run whatever the exit
      // status (see the note at the top about the teardown watchdog).
      if (isCompleteDom(out)) return out;
      detail = r.error
        ? r.error.message
        : `exit ${String(r.status)}${r.signal ? ` (${r.signal})` : ""}, ${out.length} bytes of output`;
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  }
  throw new Error(`headless Chrome did not produce a complete page (${detail})`);
}
