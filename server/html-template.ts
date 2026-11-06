// server/html-template.ts
// buildHtml({ title, stackJson, playerIife }): assembles the single
// self-contained HTML document described in .kiro/specs/exporter/design.md.
//
// No templating library — the substitution points are few and fixed, so
// plain string assembly is clearer and dependency-free (see tech.md: the
// exported file must have no external deps).
//
// Guarded by scripts/check-export-opens.ts (the export-regression-check hook).
//
// Contracts:
//   - `title` is escaped for safe use as <title> text content (no raw <, >, &,
//     or quotes).
//   - `stackJson` is embedded verbatim inside an inert
//     <script type="application/json"> block. The caller (exporter.ts) is
//     responsible for escaping <, >, / in the JSON so it cannot close the
//     script element early.
//   - `playerIife` is the pre-built, trusted player bundle, embedded verbatim
//     inside a <script> block.

export interface BuildHtmlOptions {
  title: string;
  stackJson: string;
  playerIife: string;
  /**
   * `@font-face` CSS (with base64 data-URI `src` and OFL notice comments) for
   * the three design-system fonts, built by the exporter. Embedded verbatim in
   * the page `<style>` so the class sees the real type with no internet. When
   * omitted (e.g. a unit test that doesn't care about fonts) no font rules are
   * emitted and the page falls back to the system sans-serif.
   */
  fontFaces?: string;
}

/**
 * Escape a string for use as HTML text content. Covers the five characters
 * that are significant in HTML so a title can never break out of the
 * <title> element or introduce markup.
 */
function escapeHtmlText(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Minimal CSS: reset margins, give the page the paper backdrop, and centre
 * the scaled player canvas. All styling beyond this lives in the player
 * runtime (renderer.ts); this is only the page shell. The design-system
 * `@font-face` rules (base64 data URIs + OFL notices) are injected by the
 * exporter via `fontFaces` — no external URL, so the file stays offline.
 */
const SHELL_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%;
    height: 100%;
    background: #FBF8F1;
    overflow: hidden;
  }
  body {
    display: flex;
    align-items: flex-start;
    justify-content: flex-start;
  }
  #player-root {
    width: 800px;
    height: 600px;
  }
`.trim();

/**
 * Returns the complete HTML document string for an exported stack.
 */
export function buildHtml(options: BuildHtmlOptions): string {
  const { title, stackJson, playerIife, fontFaces } = options;
  const safeTitle = escapeHtmlText(title);
  const fontBlock = fontFaces && fontFaces.trim().length > 0 ? `\n${fontFaces}\n` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
${SHELL_CSS}
${fontBlock}  </style>
</head>
<body>
  <div id="player-root"></div>

  <!-- Stack data: parsed by the player runtime at startup -->
  <script id="stack-data" type="application/json">
${stackJson}
  </script>

  <!-- Player runtime: self-contained IIFE, no external deps -->
  <script>
${playerIife}
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Living-file template (TASK-24)

export interface BuildLivingHtmlOptions {
  title: string;
  stackJson: string;
  /** The living runtime bundle (player + in-file editor + Save a Copy). */
  livingIife: string;
  fontFaces?: string;
}

/**
 * The living file plays like the class file by default and carries the offline
 * in-file editor. It differs from {@link buildHtml} only in the embedded
 * runtime (the living bundle, which includes the player) and a Teacher tab
 * mount point. The `#stack-data` block uses the SAME markers so the living
 * bundle's Save a Copy can replace it with `replaceStackData`, and the
 * round-trip extraction is identical.
 */
export function buildLivingHtml(options: BuildLivingHtmlOptions): string {
  const { title, stackJson, livingIife, fontFaces } = options;
  const safeTitle = escapeHtmlText(title);
  const fontBlock = fontFaces && fontFaces.trim().length > 0 ? `\n${fontFaces}\n` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
${SHELL_CSS}
${fontBlock}  </style>
</head>
<body>
  <div id="player-root"></div>

  <!-- Stack data: parsed by the living runtime at startup -->
  <script id="stack-data" type="application/json">
${stackJson}
  </script>

  <!-- Living runtime: player + offline in-file editor + Save a Copy, no deps -->
  <script>
${livingIife}
  </script>
</body>
</html>
`;
}
