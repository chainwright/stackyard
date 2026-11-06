// src/editor/fallbackMessages.ts
// Honest, plain-language lines for why a ready-made deck was served instead of
// a model-built one. Never "we couldn't reach the internet" unless the browser
// is genuinely offline (J1/J3/J5, 5 Nov panel).

import type { FallbackReason } from "../shared/types.js";

/**
 * The teacher-facing sentence for a fallback. `online` is whether the browser
 * reports a connection; when it is false (or the fetch itself failed) we say so
 * honestly. Otherwise we state the real server-side reason.
 */
export function fallbackMessage(
  reason: FallbackReason | undefined,
  online: boolean,
): string {
  // A deck the teacher chose herself is not a fallback at all: say so plainly,
  // online or off (the old wording called a deliberate pick "resting").
  if (reason === "chosen") {
    return "Here's a ready-made deck you can edit.";
  }
  if (!online) {
    return "You're offline, so here's a ready-made deck you can edit. Reconnect to build your own.";
  }
  switch (reason) {
    case "no-key":
      return "AI generation isn't set up on this server, so here's a ready-made deck you can edit.";
    case "cap":
      return "Today's AI budget is used up, so here's a ready-made deck you can edit. Try again tomorrow.";
    case "timeout":
      return "The AI didn't answer in time, so here's a ready-made deck you can edit. Try again in a moment.";
    case "error":
    default:
      return "The lesson builder is resting right now, so here's a ready-made deck you can edit.";
  }
}

/** True when the browser reports a live connection (defaults to online). */
export function browserOnline(): boolean {
  try {
    return typeof navigator === "undefined" || navigator.onLine !== false;
  } catch {
    return true;
  }
}
