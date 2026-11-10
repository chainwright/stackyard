// src/shared/escapeStackJson.ts
// Escape-safe serialisation of a stack to the JSON embedded in the exported
// file's <script id="stack-data" type="application/json"> block, shared by the
// server exporter and the living-file "Save a Copy" path so BOTH escape user
// text identically (no </script> breakout; no raw https:// — REQ-EXP-01).
//
// Pure, no Node/DOM deps, so it runs in the server exporter and inside the
// exported living file alike.

/**
 * Serialise `value` to JSON, then escape `<`, `>` and `/` to their `\uXXXX`
 * forms. JSON structural syntax uses none of these three characters, so they
 * only ever occur inside string values; escaping them is safe and is restored
 * exactly by `JSON.parse`.
 *
 *   - `</script>` inside any string can never close the embedding
 *     <script type="application/json"> block.
 *   - A URL such as `https://example.com` becomes `https:\u002f\u002fexample.com`,
 *     so no raw `https://` appears while the parsed value is byte-for-byte equal.
 */
export function toEscapedStackJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/\//g, "\\u002f");
}

/** The opening/closing markers of the embedded stack-data block. */
const STACK_DATA_OPEN = '<script id="stack-data" type="application/json">';
const STACK_DATA_CLOSE = "</script>";

/**
 * Replace the content of the `#stack-data` block inside a living-file HTML
 * string with `stack` (escape-safe). Only the JSON between the markers changes;
 * everything else — the fonts, the living bundle, the Teacher tab — is kept
 * byte-for-byte, so the result is still a living file. Returns null if the
 * block is not found (the caller treats that as a save failure).
 *
 * The replacement JSON is wrapped in newlines to match the exporter's layout,
 * so an unedited round trip is byte-identical.
 */
export function replaceStackData(html: string, stack: unknown): string | null {
  const openIdx = html.indexOf(STACK_DATA_OPEN);
  if (openIdx === -1) return null;
  const contentStart = openIdx + STACK_DATA_OPEN.length;
  const closeIdx = html.indexOf(STACK_DATA_CLOSE, contentStart);
  if (closeIdx === -1) return null;

  const before = html.slice(0, contentStart);
  const after = html.slice(closeIdx);
  const json = toEscapedStackJson(stack);
  return `${before}\n${json}\n  ${after}`;
}

/**
 * The living file remembers how many times it has been copied in
 * `<meta name="stackyard-copy" content="N">` (0 in a fresh export), so Save a Copy
 * can name the next one "(copy 2)", "(copy 3)"… instead of "(copy)" again. It is a
 * <meta> rather than an attribute on the stack-data tag so the stack-data markers
 * above stay exactly as they are.
 */
const COPY_META_RE = /<meta name="stackyard-copy" content="(\d+)">/;

/** How many times this file has been copied (0 for a fresh export or a legacy file). */
export function readCopyCount(html: string): number {
  const m = COPY_META_RE.exec(html);
  return m ? Number(m[1]) : 0;
}

/**
 * Set the copy counter to `n`: replace the meta if there is one, else insert it
 * just before `</head>` (a file exported before the counter existed). Replacing
 * keeps the file's size stable from one copy to the next (until the number gains
 * a digit).
 */
export function withCopyCount(html: string, n: number): string {
  const tag = `<meta name="stackyard-copy" content="${Math.max(0, Math.floor(n))}">`;
  if (COPY_META_RE.test(html)) return html.replace(COPY_META_RE, tag);
  const head = html.indexOf("</head>");
  if (head === -1) return html;
  return `${html.slice(0, head)}  ${tag}\n${html.slice(head)}`;
}

// ---------------------------------------------------------------------------
// Class results kept in a saved copy (TASK-34b6, class-results design §5)

// The content must be a JSON array (codes only: no "<"). The living bundle itself
// contains the opening tag as text (in withClassResults below), so a looser
// pattern would match inside the runtime and cut it (caught by check-living-file).
const CLASS_RESULTS_RE = /[ \t]*<script id="class-results" type="application\/json">(\[[^<]*\])<\/script>\n?/;

/** The results codes a saved copy keeps (strings only), or [] when it has none. */
export function readClassResults(html: string): string[] {
  const m = CLASS_RESULTS_RE.exec(html);
  if (!m) return [];
  try {
    const parsed: unknown = JSON.parse(m[1]!);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Write `codes` into the file's results block, just before `</head>`, or
 * remove the block when there are none. A file with no codes therefore never
 * has the block, and saves of it stay byte-identical (TASK-26a).
 */
export function withClassResults(html: string, codes: string[]): string {
  const without = html.replace(CLASS_RESULTS_RE, "");
  if (codes.length === 0) return without;
  const head = without.indexOf("</head>");
  if (head === -1) return without;
  const tag = `  <script id="class-results" type="application/json">${toEscapedStackJson(codes)}</script>\n`;
  return `${without.slice(0, head)}${tag}${without.slice(head)}`;
}
