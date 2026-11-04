// server/html-template.ts
// buildHtml({ title, stackJson, playerIife }): assembles the single
// self-contained HTML document described in .kiro/specs/exporter/design.md.
//
// No templating library — the substitution points are few and fixed, so
// plain string assembly is clearer and dependency-free (see tech.md: the
// exported file must have no external deps).
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
 * runtime (renderer.ts); this is only the page shell. No @font-face or CDN
 * links — the design-system fonts are inlined by the player, not here.
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
  const { title, stackJson, playerIife } = options;
  const safeTitle = escapeHtmlText(title);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <style>
${SHELL_CSS}
  </style>
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
