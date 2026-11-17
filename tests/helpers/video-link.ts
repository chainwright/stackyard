// tests/helpers/video-link.ts
// TASK-44f5: the demo-video link, without pinning its id. The v9b id is not
// known until the upload: the patch carries a placeholder that one sed
// replaces, so tests check only that the README, JUDGES.md and the write-up
// carry the SAME youtu.be id and that it is not the old v8b one.

/** The v8b video's YouTube id: linked until TASK-44f, never after. */
export const V8B_ID = "x6W2BzhpAyU";

/** A youtu.be link in a markdown line: the id is letters, digits, _ and -. */
export const YOUTU_BE = /https:\/\/youtu\.be\/([A-Za-z0-9_-]+)/;

/** The first youtu.be id in `text`, or null. */
export function videoId(text: string): string | null {
  const m = YOUTU_BE.exec(text);
  return m ? m[1]! : null;
}
