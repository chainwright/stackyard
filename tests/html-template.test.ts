// tests/html-template.test.ts
// Unit tests for server/html-template.ts.

import { describe, it, expect } from "vitest";
import { buildHtml } from "../server/html-template.js";

describe("buildHtml", () => {
  const base = {
    title: "Vikings Quiz",
    stackJson: '{"id":"abc","title":"Vikings Quiz"}',
    playerIife: "(function(){/*PLAYER_IIFE_MARKER*/})();",
  };

  it("contains a <title> element", () => {
    const html = buildHtml(base);
    expect(html).toContain("<title>");
    expect(html).toContain("</title>");
  });

  it("starts with the HTML5 doctype", () => {
    const html = buildHtml(base);
    expect(html.startsWith("<!doctype html>")).toBe(true);
  });

  it("contains the #stack-data script block with the stack JSON", () => {
    const html = buildHtml(base);
    expect(html).toContain('id="stack-data"');
    expect(html).toContain('type="application/json"');
    expect(html).toContain(base.stackJson);
  });

  it("embeds the player IIFE content verbatim", () => {
    const html = buildHtml(base);
    expect(html).toContain(base.playerIife);
    expect(html).toContain("/*PLAYER_IIFE_MARKER*/");
  });

  it("has a #player-root mount point", () => {
    const html = buildHtml(base);
    expect(html).toContain('id="player-root"');
  });

  it("escapes a title containing < and > so no raw markup leaks in", () => {
    const html = buildHtml({
      ...base,
      title: "Danger <script>alert(1)</script>",
    });
    // The raw markup must not appear inside the title text.
    expect(html).not.toContain("<script>alert(1)</script>");
    // The escaped form must appear.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    // The title element still exists.
    expect(html).toMatch(/<title>.*&lt;script&gt;.*<\/title>/s);
  });

  it("escapes ampersands and quotes in the title", () => {
    const html = buildHtml({ ...base, title: `Tom & "Jerry"` });
    expect(html).toContain("Tom &amp; &quot;Jerry&quot;");
  });
});
