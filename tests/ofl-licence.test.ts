// TASK-27r: the exported file carries the full SIL OFL 1.1 text, once.
import { describe, it, expect } from "vitest";
import { exportStack, exportLivingStack } from "../server/exporter.js";
import { vikingsStack } from "../src/shared/readyMadeStacks.js";

describe("the OFL 1.1 licence travels with the fonts", () => {
  for (const [name, fn] of [["class file", exportStack], ["living file", exportLivingStack]] as const) {
    it(`${name} contains the licence text exactly once`, async () => {
      const html = await fn(vikingsStack());
      expect(html).toContain("SIL OPEN FONT LICENSE Version 1.1");
      expect(html).toContain("PERMISSION & CONDITIONS");
      expect(html.split("SIL OPEN FONT LICENSE Version 1.1").length - 1).toBe(1);
    });
  }
});
