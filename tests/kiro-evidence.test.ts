// tests/kiro-evidence.test.ts
// TASK-36d1 / TASK-36d: the MCP call made inside Kiro is written up with its
// verbatim records, PostTaskExec is said plainly not to have fired (and why),
// the MCP sentences keep the script history, and check:trace reads Kiro's
// checkbox task lines.

import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { declaredIds } from "../scripts/check-task-trace.js";

const read = (f: string): string => readFileSync(f, "utf8");
const FLAT = (s: string): string => s.replace(/\s+/g, " ");
const CALL = "2026-11-10T06:07:41.771Z tool_call tool_call {\"tool_id\": \"openverse::search_images\", \"arguments\": {\"query\": \"water cycle\", \"license\": \"cc0\", \"pageSize\": 3}}";

describe("TASK-36d1: the Openverse MCP call made inside Kiro is on record", () => {
  it("TASK-36d1: docs/kiro-sessions section 6 has the session id, the verbatim records, the auto-accepted approval and a link to the call file", () => {
    const md = read("docs/kiro-sessions/README.md");
    const s = md.slice(md.indexOf("## 6. An MCP call made inside Kiro (10 Nov)"));
    expect(s.length).toBeGreaterThan(100);
    expect(s).toContain("sess_b006fe90-9722-4630-a0b1-13ecc2981ef9");
    expect(s).toContain("kiro-cli 3.1.0");
    expect(s).toContain('`agentMode` "vibe" and `specWorkflow` "quick"');
    expect(s).toContain("--trust-all-tools");
    expect(s).toContain("2026-11-10T06:07:27.799Z tool_call tool_load {\"tool_ids\": [\"openverse::search_images\"]}");
    expect(s).toContain("2026-11-10T06:07:33.690Z pending_interaction tool_approval \"@openverse/search_images\"");
    expect(s).toContain(CALL);
    expect(s).toContain("[`mcp-call-2026-11-10.md`](mcp-call-2026-11-10.md)");
    // The call file agrees with the record.
    const call = read("docs/kiro-sessions/mcp-call-2026-11-10.md");
    expect(call).toContain("Exact query: `water cycle`");
    expect(call).toContain("**Abandoned water cycle**");
  });

  it("TASK-36d1: the task is noted as ticked by a file edit, with no hook firing", () => {
    const t = read(".kiro/specs/kiro-evidence/tasks.md");
    expect(t).toContain("- [x] TASK-36d1:");
    expect(t).toContain("This box was ticked by a file edit (`str_replace`)");
    expect(t).toContain("the `PostTaskExec` `pre-submit` hook did not fire");
  });
});

describe("TASK-36d: PostTaskExec is still not recorded firing, said plainly with the reason", () => {
  it("TASK-36d: TASK-39d: TASK-41b: the sessions README, the README and EVIDENCE.md say why (no task-status tool in kiro-cli; the IDE was not driven); the write-up keeps the short label", () => {
    expect(read("docs/kiro-sessions/README.md")).toContain("So `pre-submit` (`PostTaskExec`) is **still not recorded firing**.");
    // TASK-39e: the README's Hooks row keeps the short label; the reason moved to EVIDENCE.md.
    expect(FLAT(read("README.md"))).toContain("(not yet recorded firing; run on demand as `/pre-submit`)");
    const ev = FLAT(read("EVIDENCE.md"));
    expect(ev).toContain("kiro-cli sessions have no task-status tool, so a task ticked there is a file edit, and that does not fire it. The documented trigger is a task-status change in the Kiro IDE's tasks view, which we did not drive.");
    // TASK-41b: the Hooks row names the gate as the sixth hook.
    expect(FLAT(read("docs/DEVPOST_WRITEUP.md"))).toContain("The sixth, the pre-submit gate (`PostTaskExec`), is not yet recorded firing.");
  });

  it("TASK-36d: TASK-39d: every MCP sentence keeps the script history and adds the one call through Kiro", () => {
    const add = "its search was also called once through Kiro as an MCP tool (10 Nov)";
    const w = FLAT(read("docs/DEVPOST_WRITEUP.md"));
    const mcpRow = w.slice(w.indexOf("| MCP |"), w.indexOf("| CLI |"));
    expect(mcpRow).toContain("mostly run as a script outside Kiro");
    expect(mcpRow).toContain(add);
    // TASK-39d: Built with points at the table; the long history is in EVIDENCE.md.
    const built = w.slice(w.indexOf("## Built with"));
    expect(built).toContain("one custom agent and an MCP server; see the Kiro table");
    const ev = FLAT(read("EVIDENCE.md"));
    expect(ev).toContain("The Openverse server's search and allowlisted fetch were run as a script outside Kiro (Kiro's sandbox had no network) to pick the deck photos. Through Kiro, its search was called once, on 10 Nov");
    const r = FLAT(read("README.md"));
    expect(r).toContain("Its code was run as a script outside Kiro to pick them (Kiro's sandbox had no network); " + add + ".");
    expect(read("docs/KIRO_LOG.md")).toContain("this script run stays the history of how the pictures were picked; its search was also called once through Kiro as an MCP tool (10 Nov, docs/kiro-sessions)");
  });
});

describe("TASK-36d: check:trace reads Kiro's checkbox task lines", () => {
  let root = "";
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  it("TASK-36d: '- [x] TASK-90q1:' and '- [ ] TASK-90q2:' are declared ids, beside the headings", () => {
    root = mkdtempSync(path.join(os.tmpdir(), "stackyard-trace-cb-"));
    mkdirSync(path.join(root, ".kiro", "specs", "demo"), { recursive: true });
    writeFileSync(path.join(root, ".kiro", "specs", "demo", "tasks.md"), "### TASK-90a: heading\n- [x] TASK-90q1: done box\n- [ ] TASK-90q2: open box\n- a plain TASK-90q3 bullet is not a task\n");
    expect(declaredIds(root)).toEqual(["90a", "90q1", "90q2"]);
    expect(declaredIds()).toContain("36d1");
  });
});
