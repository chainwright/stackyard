// tests/hooks.test.ts
// TASK-26k: the Kiro hook files are in the format Kiro IDE 1.x actually loads.
// Checked against the current hook docs: standalone `.kiro/hooks/*.json`,
// `"version": "v1"`, a `hooks[]` list; each hook has a `name`, a PascalCase
// `trigger` from the valid list, and an `action` of type `command` (needs
// `command`) or `agent` (needs `prompt`). `timeout` (seconds) is a SIBLING of
// `action` — three of our four hooks had it inside `action`, where Kiro ignores
// it. `matcher` is a regex tested against the file path. (The `.kiro.hook` /
// `when` / `then` shape is the pre-1.0 IDE format and is not used.)

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";

const HOOKS_DIR = path.join(process.cwd(), ".kiro", "hooks");

const VALID_TRIGGERS = [
  "PreToolUse", "PostToolUse", "SessionStart", "Stop", "UserPromptSubmit",
  "PreTaskExec", "PostTaskExec", "PostFileCreate", "PostFileSave", "PostFileDelete", "Manual",
];

interface Hook {
  name?: unknown;
  description?: unknown;
  trigger?: unknown;
  matcher?: unknown;
  action?: { type?: unknown; command?: unknown; prompt?: unknown; timeout?: unknown } & Record<string, unknown>;
  timeout?: unknown;
  enabled?: unknown;
}

const files = readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".json")).sort();

describe("TASK-26k: .kiro/hooks files match the Kiro 1.x hook schema", () => {
  it("there are hook files, none in the pre-1.0 .kiro.hook format", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(readdirSync(HOOKS_DIR).filter((f) => f.endsWith(".kiro.hook"))).toEqual([]);
  });

  for (const file of files) {
    describe(file, () => {
      const doc = JSON.parse(readFileSync(path.join(HOOKS_DIR, file), "utf8")) as { version?: unknown; hooks?: Hook[] };

      it('declares "version": "v1" and a non-empty hooks list', () => {
        expect(doc.version).toBe("v1");
        expect(Array.isArray(doc.hooks)).toBe(true);
        expect(doc.hooks!.length).toBeGreaterThan(0);
      });

      for (const [i, hook] of (doc.hooks ?? []).entries()) {
        it(`hook ${i + 1}: has a name, a valid PascalCase trigger and a well-formed action`, () => {
          expect(typeof hook.name).toBe("string");
          expect((hook.name as string).length).toBeGreaterThan(0);
          expect(VALID_TRIGGERS).toContain(hook.trigger);
          const action = hook.action!;
          expect(["command", "agent"]).toContain(action.type);
          if (action.type === "command") expect(typeof action.command).toBe("string");
          if (action.type === "agent") expect(typeof action.prompt).toBe("string");
        });

        it(`hook ${i + 1}: timeout (if any) is beside action, not inside it`, () => {
          expect(hook.action).not.toHaveProperty("timeout");
          if (hook.timeout !== undefined) {
            expect(typeof hook.timeout).toBe("number");
            expect(hook.timeout as number).toBeGreaterThanOrEqual(0);
          }
        });

        it(`hook ${i + 1}: file triggers have a matcher that is a valid regex and matches a real path`, () => {
          const fileTrigger = ["PostFileSave", "PostFileCreate", "PostFileDelete"].includes(hook.trigger as string);
          if (!fileTrigger) return;
          expect(typeof hook.matcher).toBe("string");
          const re = new RegExp(hook.matcher as string);
          // Matches both a relative and an absolute path to the same file.
          const sample: Record<string, string> = {
            "export-regression-check.json": "server/exporter.ts",
            "invariants-on-save.json": "src/shared/validator.ts",
            "ready-made-content-check.json": "src/shared/readyMadeStacks.ts",
            "living-file-gate.json": "src/living/saveCopy.ts",
          };
          const rel = sample[file];
          if (rel !== undefined) {
            expect(re.test(rel), `${rel} (relative)`).toBe(true);
            expect(re.test(`/Users/x/stackyard/${rel}`), `${rel} (absolute)`).toBe(true);
          }
          // …and does not fire for an unrelated file.
          expect(re.test("README.md")).toBe(false);
        });

        it(`hook ${i + 1}: the npm script it runs exists`, () => {
          const cmd = String(hook.action!.command ?? "");
          const m = /npm run ([\w:-]+)/.exec(cmd);
          if (!m) return;
          const pkg = JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as { scripts: Record<string, string> };
          expect(pkg.scripts[m[1]!], `npm run ${m[1]}`).toBeDefined();
        });
      }
    });
  }

  it("the full gate is a Manual hook — a run-on-demand button, not tied to task completion", () => {
    const pre = JSON.parse(readFileSync(path.join(HOOKS_DIR, "pre-submit.json"), "utf8")) as { hooks: Hook[] };
    expect(pre.hooks[0]!.trigger).toBe("Manual");
  });

  it("the living-file gate fires on edits under src/living", () => {
    expect(existsSync(path.join(HOOKS_DIR, "living-file-gate.json"))).toBe(true);
  });
});
