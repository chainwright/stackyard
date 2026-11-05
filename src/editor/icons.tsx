// src/editor/icons.tsx
// Shared inline SVG fragments used across Maker screens. All shapes come from
// design-system.md (ring loops, answer-tile shapes, toolbar glyphs). Inline
// SVG, never icon fonts or emoji.

import type { JSX } from "preact";

/** A single metal binder-ring loop that stands above the card's top edge. */
export function Ring(): JSX.Element {
  return (
    <span class="sy-ring">
      <svg width="26" height="52" viewBox="0 0 26 52">
        <ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#1E2A47" stroke-opacity="0.55" stroke-width="3.5" />
        <ellipse cx="13" cy="26" rx="8" ry="22" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="1" />
        <ellipse cx="13" cy="40" rx="7" ry="6" fill="#FFFFFF" stroke="#C9D3E3" stroke-width="1" />
      </svg>
    </span>
  );
}

/** The two ring loops at the top of a card. */
export function Rings(): JSX.Element {
  return (
    <div class="sy-rings" aria-hidden="true">
      <Ring />
      <Ring />
    </div>
  );
}

/** Kind glyph for a card-list entry (quiz/flash/story/end). */
export function KindShape({ kind }: { kind: "quiz" | "flash" | "story" | "end" }): JSX.Element {
  switch (kind) {
    case "flash":
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true">
          <rect x="3" y="6" width="22" height="16" rx="2" fill="none" stroke="#1E2A47" stroke-width="2.4" />
          <line x1="14" y1="6" x2="14" y2="22" stroke="#1E2A47" stroke-width="2.4" />
        </svg>
      );
    case "story":
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M6 23V13c0-2 1.6-3.6 3.6-3.6H20" fill="none" stroke="#1E2A47" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M16 5l5 4.4-5 4.4" fill="none" stroke="#1E2A47" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      );
    case "end":
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true">
          <path d="M7 3v22" fill="none" stroke="#1E2A47" stroke-width="2.4" stroke-linecap="round" />
          <path d="M7 4h14l-3 5 3 5H7z" fill="none" stroke="#1E2A47" stroke-width="2.4" stroke-linejoin="round" />
        </svg>
      );
    case "quiz":
    default:
      return (
        <svg width="20" height="20" viewBox="0 0 28 28" aria-hidden="true">
          <rect x="4" y="4" width="8" height="8" rx="1.5" fill="none" stroke="#1E2A47" stroke-width="2.4" />
          <rect x="16" y="4" width="8" height="8" rx="1.5" fill="none" stroke="#1E2A47" stroke-width="2.4" />
          <rect x="4" y="16" width="8" height="8" rx="1.5" fill="none" stroke="#1E2A47" stroke-width="2.4" />
          <rect x="16" y="16" width="8" height="8" rx="1.5" fill="none" stroke="#1E2A47" stroke-width="2.4" />
        </svg>
      );
  }
}

/** Toolbar glyphs. */
export const TextIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 6V4h16v2M12 6v14M9 20h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
);
export const ButtonIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="8" width="18" height="8" rx="3" fill="none" stroke="currentColor" stroke-width="2" /></svg>
);
export const PictureIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2" /><circle cx="8" cy="10" r="1.8" fill="currentColor" /><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" /></svg>
);
export const LinkCardIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7h8a3 3 0 010 6h-3M15 17H7a3 3 0 010-6h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
);
export const UndoIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7L4 12l5 5M4 12h11a5 5 0 010 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
);
export const RedoIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 7l5 5-5 5M20 12H9a5 5 0 000 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
);
export const ExportIcon = (): JSX.Element => (
  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v9m0 0l-4-4m4 4l4-4M3 15v2a1 1 0 001 1h12a1 1 0 001-1v-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
);
export const PlayIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
);

/** The four answer-tile shapes, by slot index 0..3 (A triangle, B diamond, C circle, D square). */
export function TileShape({ slot }: { slot: number }): JSX.Element {
  switch (slot % 4) {
    case 1:
      return <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,14 14,26 2,14" fill="currentColor" /></svg>;
    case 2:
      return <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="currentColor" /></svg>;
    case 3:
      return <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><rect x="2" y="2" width="24" height="24" fill="currentColor" /></svg>;
    case 0:
    default:
      return <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><polygon points="14,2 26,26 2,26" fill="currentColor" /></svg>;
  }
}
