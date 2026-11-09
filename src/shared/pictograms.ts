// src/shared/pictograms.ts
// Stackyard's own set of small picture "stamps" (TASK-31h). A generated card can
// carry one of these, chosen by NAME. The model never supplies picture bytes: the
// data: URI that reaches an image element is always built here, from this set.
//
// Style: the design system's ink — one colour (#1E2A47, --color-ink), strokes and
// fills on a transparent background, viewBox 0 0 64 64, round caps and joins. No
// text, no external reference, no script, no <foreignObject>, no href: nothing in
// an SVG here can run or fetch. (The one URL-like string is the SVG namespace
// declaration, which an <img> needs and which fetches nothing.)
//
// We drew these ourselves from simple shapes. They are licensed with the repo
// (MIT) and credited on the card as "Picture: Stackyard pictogram".

const INK = "#1E2A47";
const F = `fill="${INK}"`;

/** name → the SVG body (the shapes only; the wrapper is added once, below). */
const BODIES: Readonly<Record<string, string>> = {
  sun: `<circle cx="32" cy="32" r="10" ${F}/><path d="M32 6v8M32 50v8M6 32h8M50 32h8M13.6 13.6l5.7 5.7M44.7 44.7l5.7 5.7M13.6 50.4l5.7-5.7M44.7 19.3l5.7-5.7"/>`,
  cloud: `<path d="M18 46a10 10 0 0 1-1-20 14 14 0 0 1 27-3 11 11 0 0 1 2 23z"/>`,
  rain: `<path d="M18 34a9 9 0 0 1-1-18 13 13 0 0 1 25-3 10 10 0 0 1 2 21z"/><path d="M20 42l-3 8M32 42l-3 8M44 42l-3 8M26 53l-2 6M38 53l-2 6"/>`,
  snowflake: `<path d="M32 6v52M9.5 19l45 26M9.5 45l45-26"/><path d="M26 10l6 6 6-6M26 54l6-6 6 6"/>`,
  drop: `<path d="M32 8C32 8 16 28 16 40a16 16 0 0 0 32 0C48 28 32 8 32 8z" ${F}/>`,
  wave: `<path d="M6 24c6-8 12-8 18 0s12 8 18 0 12-8 16 0"/><path d="M6 36c6-8 12-8 18 0s12 8 18 0 12-8 16 0"/><path d="M6 48c6-8 12-8 18 0s12 8 18 0 12-8 16 0"/>`,
  river: `<path d="M10 6c20 10-8 20 10 30s-6 16 8 22"/><path d="M30 6c20 10-8 20 10 30s-6 16 8 22"/>`,
  mountain: `<path d="M4 54L24 14l14 24 6-9 16 25z"/><path d="M17 28l5 4 4-5 4 5"/>`,
  tree: `<circle cx="32" cy="24" r="16" ${F}/><path d="M32 40v18M24 58h16"/>`,
  leaf: `<path d="M12 52C12 24 28 10 54 10c0 26-14 42-42 42z"/><path d="M12 52L38 26"/>`,
  flower: `<circle cx="32" cy="32" r="6" ${F}/><circle cx="32" cy="17" r="7"/><circle cx="47" cy="32" r="7"/><circle cx="32" cy="47" r="7"/><circle cx="17" cy="32" r="7"/>`,
  seed: `<path d="M32 58V34"/><path d="M32 40C32 28 22 22 12 24c0 12 8 18 20 16z"/><path d="M32 34c0-10 8-16 20-16 0 12-8 18-20 16z"/><path d="M20 58h24"/>`,
  apple: `<path d="M32 20c-8-6-20-2-20 14 0 12 8 24 16 24 2 0 3-1 4-1s2 1 4 1c8 0 16-12 16-24 0-16-12-20-20-14z"/><path d="M32 20c0-6 2-10 6-12"/>`,
  fish: `<path d="M6 32c10-14 28-14 38 0-10 14-28 14-38 0z"/><path d="M44 32l14-10v20z"/><circle cx="17" cy="29" r="1.8" ${F}/>`,
  bird: `<ellipse cx="28" cy="38" rx="18" ry="12"/><circle cx="46" cy="22" r="8"/><path d="M54 22l8 3-8 3"/><circle cx="48" cy="20" r="1.6" ${F}/><path d="M12 36c6 0 12 4 14 10"/><path d="M26 50v8M34 50v8"/>`,
  cat: `<path d="M14 22l4-14 10 8h8l10-8 4 14c2 4 2 8 2 12 0 12-8 20-20 20S12 46 12 34c0-4 0-8 2-12z"/><circle cx="25" cy="32" r="2" ${F}/><circle cx="39" cy="32" r="2" ${F}/><path d="M29 40h6M32 38v4M10 38l-6-2M10 42l-6 2M54 38l6-2M54 42l6 2"/>`,
  dog: `<path d="M18 16c-8 0-10 10-10 22 6 0 10-6 10-12z"/><path d="M46 16c8 0 10 10 10 22-6 0-10-6-10-12z"/><path d="M18 14h28v28c0 8-6 14-14 14s-14-6-14-14z"/><circle cx="26" cy="28" r="2" ${F}/><circle cx="38" cy="28" r="2" ${F}/><ellipse cx="32" cy="42" rx="5" ry="3.5" ${F}/>`,
  horse: `<path d="M22 58c0-10 2-16-4-22L10 28l6-4 4-14 8 8c12 0 22 8 22 22v20z"/><circle cx="26" cy="24" r="1.8" ${F}/><path d="M34 22c6 4 8 12 8 20"/>`,
  cow: `<path d="M17 16C9 16 6 10 8 3M47 16c8 0 11-6 9-13"/><path d="M14 22H5l2 8 9-2M50 22h9l-2 8-9-2"/><path d="M14 14h36v26c0 10-8 16-18 16s-18-6-18-16z"/><rect x="19" y="38" width="26" height="14" rx="7"/><circle cx="27" cy="45" r="1.6" ${F}/><circle cx="37" cy="45" r="1.6" ${F}/><circle cx="24" cy="27" r="2" ${F}/><circle cx="40" cy="27" r="2" ${F}/>`,
  bee: `<ellipse cx="32" cy="38" rx="16" ry="12"/><path d="M26 27v22M34 27v22"/><path d="M26 28c-4-12-14-12-14-6s8 8 14 6z"/><path d="M38 28c4-12 14-12 14-6s-8 8-14 6z"/><path d="M48 38l8 2"/>`,
  butterfly: `<path d="M32 20v28"/><path d="M32 32C20 12 6 14 8 28s14 14 24 4z"/><path d="M32 32c12-20 26-18 24-4s-14 14-24 4z"/><path d="M32 34c-10 0-14 10-10 16s10 0 10-10z"/><path d="M32 34c10 0 14 10 10 16s-10 0-10-10z"/><path d="M32 20l-6-10M32 20l6-10"/>`,
  ship: `<path d="M6 40h52c-4 10-12 14-20 14H26c-8 0-16-4-20-14z"/><path d="M32 40V8"/><path d="M32 10l16 14H32z"/><path d="M6 40c-2-6 0-10 2-12M58 40c2-6 0-10-2-12"/>`,
  boat: `<path d="M8 42h48l-8 12H16z"/><path d="M32 40V10l18 24z"/><path d="M32 18l-14 18h14"/>`,
  sword: `<path d="M32 4l5 6v30H27V10z"/><path d="M18 40h28"/><path d="M32 40v12"/><circle cx="32" cy="56" r="3" ${F}/>`,
  shield: `<path d="M32 6l22 6v16c0 16-10 26-22 30C20 54 10 44 10 28V12z"/><path d="M32 6v52M10 26h44"/>`,
  helmet: `<path d="M10 40c0-18 10-28 22-28s22 10 22 28z"/><path d="M8 40h48v6H8z"/><path d="M32 12v28"/><path d="M26 40v6M38 40v6"/>`,
  castle: `<path d="M8 58V14h12v8h6v-8h12v8h6v-8h12v44z"/><path d="M26 58V44a6 6 0 0 1 12 0v14"/><path d="M14 32v6M50 32v6"/>`,
  house: `<path d="M8 32L32 10l24 22"/><path d="M14 28v28h36V28"/><path d="M27 56V40h10v16"/>`,
  book: `<path d="M32 14c-6-4-16-6-24-4v38c8-2 18 0 24 4 6-4 16-6 24-4V10c-8-2-18 0-24 4z"/><path d="M32 14v38"/>`,
  pencil: `<path d="M44 6l14 14L24 54 6 58l4-18z"/><path d="M38 12l14 14"/><path d="M6 58l4-18 14 14z" ${F}/>`,
  globe: `<circle cx="32" cy="32" r="24"/><path d="M8 32h48M32 8c-12 12-12 36 0 48M32 8c12 12 12 36 0 48"/>`,
  map: `<path d="M6 14l18-6 16 6 18-6v42l-18 6-16-6-18 6z"/><path d="M24 8v42M40 14v42"/>`,
  clock: `<circle cx="32" cy="32" r="24"/><path d="M32 16v16l10 8"/><path d="M32 8v4M32 52v4M8 32h4M52 32h4"/>`,
  star: `<path d="M32 6l7.5 17 18.5 1.6-14 12.2 4.3 18.2L32 45.8 15.7 55l4.3-18.2L6 24.6 24.5 23z" ${F}/>`,
  moon: `<path d="M44 8a26 26 0 1 0 12 36A22 22 0 0 1 44 8z" ${F}/>`,
  heart: `<path d="M32 56C10 40 6 28 6 20a13 13 0 0 1 26-4 13 13 0 0 1 26 4c0 8-4 20-26 36z" ${F}/>`,
  plus: `<path d="M26 8h12v18h18v12H38v18H26V38H8V26h18z" ${F}/>`,
  minus: `<path d="M8 26h48v12H8z" ${F}/>`,
  times: `<path d="M16 8l16 16 16-16 8 8-16 16 16 16-8 8-16-16-16 16-8-8 16-16L8 16z" ${F}/>`,
  coin: `<circle cx="32" cy="32" r="24"/><circle cx="32" cy="32" r="17"/><path d="M32 20v24"/>`,
  magnet: `<path d="M14 10v22a18 18 0 0 0 36 0V10H38v22a6 6 0 0 1-12 0V10z"/><path d="M14 18h12M38 18h12"/>`,
  bulb: `<path d="M24 46c0-6-10-10-10-22a18 18 0 0 1 36 0c0 12-10 16-10 22z"/><path d="M24 52h16M26 58h12"/><path d="M28 46V32l4 4 4-4v14"/>`,
};

/** Every allowed picture name, in a fixed order. */
export const PICTOGRAM_NAMES: readonly string[] = Object.freeze(Object.keys(BODIES));

export type PictogramName = string;

export { PICTOGRAM_CREDIT, isPictogramCredit } from "./pictogramCredit.js";

/** The largest a single pictogram SVG may be, in characters (the cap the safety test enforces). */
export const PICTOGRAM_MAX_CHARS = 1500;

const NAME_SET: ReadonlySet<string> = new Set(PICTOGRAM_NAMES);

/** The canonical name for `value` (trimmed, lower-case), or null. Never throws; never matches a prototype key. */
export function pictogramName(value: unknown): PictogramName | null {
  if (typeof value !== "string") return null;
  const n = value.trim().toLowerCase();
  return NAME_SET.has(n) ? n : null;
}

export function isPictogramName(value: unknown): value is PictogramName {
  return pictogramName(value) !== null;
}

/** The full SVG document for a name in the set. */
export function pictogramSvg(name: PictogramName): string {
  const body = BODIES[name];
  if (body === undefined || !NAME_SET.has(name)) throw new Error("not a pictogram name");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="${INK}" ` +
    `stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`
  );
}

const URI_BY_NAME = new Map<string, string>();
const NAME_BY_URI = new Map<string, string>();
for (const name of PICTOGRAM_NAMES) {
  const uri = "data:image/svg+xml," + encodeURIComponent(pictogramSvg(name));
  URI_BY_NAME.set(name, uri);
  NAME_BY_URI.set(uri, name);
}

/** The data: URI for a name in the set. Built only from our SVGs, never from model text. */
export function pictogramDataUri(name: PictogramName): string {
  const uri = URI_BY_NAME.get(name);
  if (uri === undefined) throw new Error("not a pictogram name");
  return uri;
}

/** The name behind a data: URI, if (and only if) it is exactly one of ours. */
export function pictogramNameOfSrc(src: unknown): PictogramName | null {
  return typeof src === "string" ? (NAME_BY_URI.get(src) ?? null) : null;
}

/** Alt text for a pictogram (never empty). */
export function pictogramAlt(name: PictogramName): string {
  return `Picture: ${name}`;
}

/**
 * Everything wrong with the set, in plain words (empty = fine). One definition,
 * used by the unit test and by scripts/check-decks.ts.
 */
export function pictogramProblems(): string[] {
  const problems: string[] = [];
  if (PICTOGRAM_NAMES.length < 40) problems.push(`only ${PICTOGRAM_NAMES.length} pictograms (need 40 or more)`);
  for (const name of PICTOGRAM_NAMES) {
    if (!/^[a-z]{2,12}$/.test(name)) problems.push(`"${name}" is not a plain lower-case noun`);
    const svg = pictogramSvg(name);
    if (svg.length > PICTOGRAM_MAX_CHARS) problems.push(`${name}: ${svg.length} characters (cap ${PICTOGRAM_MAX_CHARS})`);
    // The namespace declaration is the one URL-like string an <img> SVG needs.
    const rest = svg.replace('xmlns="http://www.w3.org/2000/svg"', "");
    const bad: Array<[RegExp, string]> = [
      [/<script/i, "<script"],
      [/<foreignObject/i, "<foreignObject"],
      [/<text|<tspan/i, "text"],
      [/<style|<image|<use|<a[\s>]|<iframe|<object|<embed|<link/i, "an element that can load or style"],
      [/\son[a-z]+\s*=/i, "an on*= handler"],
      [/href/i, "href"],
      [/https?:|\/\/|url\(|@import|javascript:/i, "an external reference"],
      [/#(?!1E2A47\b)[0-9a-f]{3,8}\b/i, "a colour other than the ink"],
    ];
    for (const [re, label] of bad) if (re.test(rest)) problems.push(`${name}: contains ${label}`);
    if (!svg.includes('viewBox="0 0 64 64"')) problems.push(`${name}: viewBox is not 0 0 64 64`);
  }
  if (NAME_BY_URI.size !== PICTOGRAM_NAMES.length) problems.push("two pictograms have the same drawing");
  return problems;
}
