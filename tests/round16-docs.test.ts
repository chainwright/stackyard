// tests/round16-docs.test.ts
// TASK-42d (judge round r7, P2-9): one relevance line with one cited statistic
// near the top of the README and the write-up. The source was checked at gov.uk
// by the coordinator on 16 Nov 2026, outside Kiro; these tests make no network call.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseClaimRows, compareClaimsTable } from "../scripts/claims-lib.js";

const ROOT = path.resolve(__dirname, "..");
const read = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const readOrNull = (p: string): string | null => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
};

const URL = "https://www.gov.uk/government/news/no-child-left-behind-in-plans-to-narrow-the-digital-divide-in-education";
const PARAGRAPH = `Why it matters: in England, the Department for Education's 2023 Technology in Schools Survey found just 63% of schools reported a fully functional Wi-Fi signal throughout the school ([DfE, 21 March 2025](${URL})). Stackyard's lesson file needs no connection to play or to bring the results back.`;
const PUBLISHER = "But the 2023 Technology in Schools Survey found just 63% of schools reported having a fully functional Wi-Fi signal throughout the school.";

/** The paragraphs after the title (line 1), split on blank lines. */
const paragraphs = (text: string): string[] =>
  text.split("\n").slice(1).join("\n").split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);

describe("TASK-42d: one cited statistic near the top", () => {
  it("TASK-42d1: the relevance paragraph sits right under line 5 in both files, within the first three paragraphs after the title", () => {
    for (const f of ["README.md", "docs/DEVPOST_WRITEUP.md"]) {
      const lines = read(f).split("\n");
      expect(lines[5], f).toBe("");
      expect(lines[6], f).toBe(PARAGRAPH);
      const ps = paragraphs(read(f));
      expect(ps.slice(0, 3), f).toContain(PARAGRAPH);
    }
  });

  it("TASK-42d1: the paragraph has exactly one percentage and the gov.uk link, and does not stretch the source", () => {
    expect(PARAGRAPH.match(/\d+(?:\.\d+)?\s?%/g)).toEqual(["63%"]);
    expect(PARAGRAPH).toContain(URL);
    // Not stretched: no other number, no "primary", no classroom share, no claim about the other 37 %.
    expect(PARAGRAPH).not.toMatch(/primary|classroom|third|fails in the rest/i);
    expect((PARAGRAPH.replace(URL, "").match(/\d+/g) ?? []).sort()).toEqual(["2023", "2025", "21", "63"].sort());
  });

  it("TASK-42d2: CLAIMS.md has the row with the publisher's exact sentence, the date, the check and the limits; EVIDENCE.md cites the same", () => {
    const row = parseClaimRows(read("CLAIMS.md")).find((r) => r.quote === "found just 63% of schools reported a fully functional Wi-Fi signal throughout the school")!;
    expect(row).toBeDefined();
    expect(row.status).toBe("TRUE");
    expect(row.refs.map((r) => r.file)).toEqual(["docs/DEVPOST_WRITEUP.md", "README.md"]);
    for (const s of [URL, "21 March 2025", PUBLISHER, "checked at gov.uk on 16 Nov 2026".replace("checked", "Checked"), "England", "all phases", "summary of its own survey"]) {
      expect(row.proof, s).toContain(s);
    }
    const ev = read("EVIDENCE.md");
    expect(ev).toContain("## Sources we cite");
    expect(ev).toContain(PUBLISHER);
    expect(ev).toContain(URL);
    expect(ev).toContain("of all phases, not only primary, and it is the department's summary of its own survey");
    expect(ev).toContain("Checked at gov.uk on 16 Nov 2026 by our coordinator, outside Kiro");
  });

  it("TASK-42d3: every CLAIMS.md line reference is right again after the new paragraph", () => {
    const files = { "README.md": read("README.md"), "docs/DEVPOST_WRITEUP.md": read("docs/DEVPOST_WRITEUP.md") };
    expect(compareClaimsTable(read("CLAIMS.md"), files).filter((c) => !c.ok)).toEqual([]);
    const row = parseClaimRows(read("CLAIMS.md")).find((r) => r.id === "C71")!;
    expect(row.refs).toEqual([{ file: "docs/DEVPOST_WRITEUP.md", line: 7 }, { file: "README.md", line: 7 }]);
  });

  it("TASK-42d4: no network: this file only reads local files", () => {
    const src = read("tests/round16-docs.test.ts");
    expect(src.split("\n").filter((l) => /^import /.test(l))).toEqual([
      'import { describe, it, expect } from "vitest";',
      'import { readFileSync } from "node:fs";',
      'import path from "node:path";',
      'import { parseClaimRows, compareClaimsTable } from "../scripts/claims-lib.js";',
    ]);
  });

  it("TASK-42d5: the write-up draft beside the repo follows the new body (skips when it is not there)", (ctx) => {
    const draft = readOrNull(path.join(ROOT, "..", "WRITEUP_DRAFT.md"));
    if (draft === null) return ctx.skip();
    expect(draft.split("\n").slice(1).join("\n")).toBe(read("docs/DEVPOST_WRITEUP.md").split("\n").slice(1).join("\n"));
    expect(draft).toContain(PARAGRAPH);
    for (const f of ["BLOG_DRAFT.md", "SOCIAL_DRAFT.md"]) {
      const d = readOrNull(path.join(ROOT, "..", f));
      if (d !== null) expect(d, f).not.toContain("63% of schools");
    }
  });
});
