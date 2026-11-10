// scripts/check-contrast.ts
// TASK-33d5: every text / background colour pair the player and the Maker use,
// with its WCAG 2 contrast ratio COMPUTED here from the colours read out of the
// source (src/player/renderer.ts COLOR, src/editor/styles.css :root and rules,
// src/living/styles.ts). Nothing is typed into the table by hand.
//
// Thresholds: 4.5:1 for body text, 3:1 for large text (≥ 24px, or ≥ 18.66px
// bold) and for UI (focus rings, control borders). The table is written into
// docs/accessibility/README.md between the contrast markers; `--check` fails if
// the README's table differs from a fresh one, or if any pair is under its line.
//
//   node --import tsx/esm scripts/check-contrast.ts            # check (pre-submit)
//   node --import tsx/esm scripts/check-contrast.ts --write    # rewrite the table

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const README = path.join(ROOT, "docs", "accessibility", "README.md");
export const START = "<!-- contrast:start (written by scripts/check-contrast.ts) -->";
export const END = "<!-- contrast:end -->";

type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

/** WCAG 2 relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG 2 contrast ratio of two colours (≥ 1). */
export function contrast(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

/** `fg` at `alpha` laid over `bg` (for the translucent Teacher tab). */
export function over(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return fg.map((c, i) => Math.round(c * alpha + bg[i]! * (1 - alpha))) as Rgb;
}

const src = (f: string): string => readFileSync(path.join(ROOT, f), "utf8");
const renderer = src("src/player/renderer.ts");
const makerCss = src("src/editor/styles.css");
const livingCss = src("src/living/styles.ts");

/** A colour from the player's COLOR object. */
function player(key: string): string {
  const m = new RegExp(`\\b${key}: "(#[0-9A-Fa-f]{3,6})"`).exec(renderer.slice(renderer.indexOf("const COLOR")));
  if (!m) throw new Error(`no COLOR.${key} in renderer.ts`);
  return m[1]!;
}
/** A colour from the Maker's :root custom properties. */
function makerVar(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{3,6})`).exec(makerCss);
  if (!m) throw new Error(`no --${name} in styles.css`);
  return m[1]!;
}
/** The first hex value of `prop` inside the rule whose selector matches. */
function rule(css: string, selector: string, prop: string): string {
  const at = css.indexOf(selector + " {");
  if (at < 0) throw new Error(`no rule ${selector}`);
  const body = css.slice(at, css.indexOf("}", at));
  const m = new RegExp(`(?:^|[;{\\s])${prop}:\\s*(#[0-9A-Fa-f]{3,6})`).exec(body);
  if (!m) throw new Error(`no ${prop} hex in ${selector}`);
  return m[1]!;
}

export type Size = "body" | "large" | "ui";
export interface Pair { where: string; fg: string; bg: string; size: Size; note?: string }

export function pairs(): Pair[] {
  const ink = player("ink");
  const paper = player("paper");
  const white = player("white");
  const stamp = player("stamp");
  const muted = rule(makerCss, ".hint", "color");
  const tabBg = over(hexToRgb(ink), 0.85, hexToRgb(paper));
  const toHex = (c: Rgb): string => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
  return [
    { where: "Player: card text, question, meta, score", fg: ink, bg: paper, size: "body" },
    { where: "Player: tile A label (coral)", fg: ink, bg: player("tileA"), size: "body" },
    { where: "Player: tile B label (sun)", fg: ink, bg: player("tileB"), size: "body" },
    { where: "Player: tile C label (teal)", fg: ink, bg: player("tileC"), size: "body" },
    { where: "Player: tile D label (navy)", fg: white, bg: player("tileD"), size: "body" },
    { where: "Player: CORRECT ✓ / ✗ stamps over the paper", fg: stamp, bg: paper, size: "large", note: "24px bold" },
    { where: "Player: flash hint (muted)", fg: rule(renderer, ".sy-flash-hint", "color"), bg: paper, size: "body" },
    { where: "Player: \"✓ Right answer\" tag", fg: white, bg: ink, size: "body" },
    { where: "Player: focus ring (ink) on paper", fg: ink, bg: paper, size: "ui" },
    { where: "Player: Scan control", fg: paper, bg: ink, size: "body" },
    { where: "Living file: Teacher tab (ink at 85 % over the paper page)", fg: paper, bg: toHex(tabBg), size: "body" },
    { where: "Teacher tab editor: bar title and Play", fg: paper, bg: ink, size: "body" },
    { where: "Teacher tab editor: Save a Copy", fg: rule(livingCss, ".sy-living-btn.primary", "color"), bg: rule(livingCss, ".sy-living-btn.primary", "background"), size: "body" },
    { where: "Teacher tab editor: text on the desk", fg: ink, bg: rule(livingCss, ".sy-living-overlay", "background"), size: "body" },
    { where: "Teacher tab editor: hints (muted)", fg: rule(livingCss, ".sy-living-hint", "color"), bg: paper, size: "body" },
    { where: "Maker: body text on paper", fg: makerVar("color-ink"), bg: makerVar("color-paper"), size: "body" },
    { where: "Maker: hints and the ready-made lede (muted) on paper", fg: muted, bg: makerVar("color-paper"), size: "body" },
    { where: "Maker: muted text on white", fg: muted, bg: makerVar("color-white"), size: "body" },
    { where: "Maker: top bar subline", fg: makerVar("shell-sub"), bg: makerVar("color-ink"), size: "body" },
    { where: "Maker: wordmark on the top bar", fg: makerVar("color-paper"), bg: makerVar("color-ink"), size: "large" },
    { where: "Maker: Export File button", fg: makerVar("color-white"), bg: makerVar("color-stamp"), size: "body" },
    { where: "Maker: Export File hover", fg: makerVar("color-white"), bg: makerVar("color-stamp-hover"), size: "body" },
    { where: "Maker: \"Card N of M\" and text on the desk", fg: makerVar("color-ink"), bg: makerVar("color-desk"), size: "body" },
    { where: "Maker: focus ring (ink) on the desk", fg: makerVar("color-ink"), bg: makerVar("color-desk"), size: "ui" },
    { where: "Maker: the right-answer tag", fg: makerVar("color-white"), bg: makerVar("color-ink"), size: "body" },
  ];
}

export const MIN: Record<Size, number> = { body: 4.5, large: 3, ui: 3 };

export function table(ps: Pair[]): { md: string; failures: string[] } {
  const failures: string[] = [];
  const rows = ps.map((p) => {
    const r = contrast(hexToRgb(p.fg), hexToRgb(p.bg));
    const ok = r >= MIN[p.size];
    if (!ok) failures.push(`${p.where}: ${p.fg} on ${p.bg} is ${r.toFixed(2)}:1, under ${MIN[p.size]}:1`);
    return `| ${p.where} | \`${p.fg.toUpperCase()}\` | \`${p.bg.toUpperCase()}\` | ${p.size}${p.note ? ` (${p.note})` : ""} | ${r.toFixed(2)}:1 | ${MIN[p.size]}:1 | ${ok ? "pass" : "FAIL"} |`;
  });
  const md = [
    START,
    "| Where | Text / ring | Background | Kind | Ratio | Needs | Result |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    END,
  ].join("\n");
  return { md, failures };
}

function main(): void {
  const write = process.argv.includes("--write");
  const { md, failures } = table(pairs());
  for (const f of failures) console.error(`check-contrast: FAIL — ${f}`);
  if (!existsSync(README)) {
    console.error("check-contrast: FAIL — docs/accessibility/README.md is missing");
    process.exit(1);
  }
  const text = readFileSync(README, "utf8");
  const a = text.indexOf(START);
  const b = text.indexOf(END);
  if (a < 0 || b < 0) {
    console.error("check-contrast: FAIL — the README has no contrast markers");
    process.exit(1);
  }
  const fresh = text.slice(0, a) + md + text.slice(b + END.length);
  if (write) {
    if (fresh !== text) writeFileSync(README, fresh, "utf8");
  } else if (fresh !== text) {
    console.error("check-contrast: FAIL — the README's contrast table is stale; run `node --import tsx/esm scripts/check-contrast.ts --write`.");
    process.exit(1);
  }
  if (failures.length > 0) process.exit(1);
  console.log(`check-contrast: OK — TASK-33d5: ${pairs().length} colour pairs, each at or above its WCAG line (4.5:1 text, 3:1 large text and UI).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
