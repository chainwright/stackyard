// src/player/scan.ts
// One-switch scanning (TASK-33d4). Off by default. A small "Scan" control in the
// file (and the S key) turns it on; then the focus steps across the current
// card's choices every 1.5 s (1–4 s, chosen beside the control). Space or Enter
// picks the highlighted one: the highlight IS the keyboard focus, so the pick
// is the browser's own button activation and nothing else is needed to finish
// a lesson. The setting lasts for this browser session only (sessionStorage).
//
// No framework, no network. Part of the player bundle.

import { announce, liveRegion } from "./renderer.js";

export const SCAN_KEY = "stackyard:scan";
export const SCAN_MS_KEY = "stackyard:scan-ms";
export const SCAN_DEFAULT_MS = 1500;
export const SCAN_MIN_MS = 1000;
export const SCAN_MAX_MS = 4000;

function session(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}

/** The step time, clamped to 1–4 s (1.5 s when unset or unreadable). */
export function scanInterval(): number {
  const raw = Number(session()?.getItem(SCAN_MS_KEY) ?? "");
  if (!Number.isFinite(raw) || raw <= 0) return SCAN_DEFAULT_MS;
  return Math.min(SCAN_MAX_MS, Math.max(SCAN_MIN_MS, Math.round(raw)));
}

/** The choices on the card now, in reading (DOM) order: tiles, the flash card, buttons. */
export function scanChoices(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(".sy-card .sy-tile, .sy-card .sy-flash[role='button'], .sy-card .sy-button")).filter(
    (e) => !(e as HTMLButtonElement).disabled,
  );
}

/** Move the highlight (and focus) to the next choice after the current one. */
export function scanStep(root: HTMLElement): HTMLElement | null {
  const list = scanChoices(root);
  for (const e of Array.from(root.querySelectorAll(".sy-scan-focus"))) e.classList.remove("sy-scan-focus");
  if (list.length === 0) return null;
  const at = list.indexOf(document.activeElement as HTMLElement);
  const next = list[(at + 1) % list.length]!;
  next.classList.add("sy-scan-focus");
  next.focus({ preventScroll: true });
  return next;
}

/** True when a key press is typing into a field (the S key must not steal it). */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Install scanning for the player in `root`: the control bar (appended to
 * `host`), the S key and the timer. Returns a teardown.
 */
export function installScan(root: HTMLElement, host: HTMLElement = document.body): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const bar = document.createElement("div");
  bar.className = "sy-scan-bar";
  // A named region, so the control sits in a landmark like the card (axe "region").
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Switch scanning");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "sy-scan-toggle";
  toggle.textContent = "Scan";
  toggle.setAttribute("aria-pressed", "false");
  toggle.title = "Scan: the highlight moves across the choices; press Space or Enter to pick (S key)";
  const speed = document.createElement("select");
  speed.className = "sy-scan-speed";
  speed.setAttribute("aria-label", "Scan speed");
  for (const ms of [1000, 1500, 2000, 3000, 4000]) {
    const o = document.createElement("option");
    o.value = String(ms);
    o.textContent = `${ms / 1000} s`;
    speed.appendChild(o);
  }
  bar.appendChild(toggle);
  bar.appendChild(speed);
  host.appendChild(bar);

  const on = (): boolean => toggle.getAttribute("aria-pressed") === "true";

  const restart = (): void => {
    if (timer !== null) clearInterval(timer);
    timer = on() ? setInterval(() => scanStep(root), scanInterval()) : null;
  };

  const set = (value: boolean, say: boolean): void => {
    toggle.setAttribute("aria-pressed", value ? "true" : "false");
    document.documentElement.classList.toggle("sy-scanning", value);
    speed.hidden = !value;
    speed.value = String(scanInterval());
    const s = session();
    try {
      if (value) s?.setItem(SCAN_KEY, "on");
      else s?.removeItem(SCAN_KEY);
    } catch {
      /* a locked-down browser: scanning still works for this page */
    }
    if (!value) for (const e of Array.from(root.querySelectorAll(".sy-scan-focus"))) e.classList.remove("sy-scan-focus");
    restart();
    if (value) scanStep(root);
    if (say) announce(liveRegion(), value ? `Scan on. Press Space or Enter to pick. Every ${scanInterval() / 1000} seconds the next choice lights up.` : "Scan off.");
  };

  toggle.addEventListener("click", () => set(!on(), true));
  speed.addEventListener("change", () => {
    try {
      session()?.setItem(SCAN_MS_KEY, speed.value);
    } catch {
      /* ignore */
    }
    restart();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.key === "s" || e.key === "S") && !typing(e.target)) {
      e.preventDefault();
      set(!on(), true);
      return;
    }
    // A pick: hold the highlight still for a full step, so it never moves
    // between the key going down and coming up (Space activates on key-up).
    if (on() && (e.key === " " || e.key === "Enter")) restart();
  };
  document.addEventListener("keydown", onKey);

  set(session()?.getItem(SCAN_KEY) === "on", false);

  return () => {
    if (timer !== null) clearInterval(timer);
    document.removeEventListener("keydown", onKey);
    document.documentElement.classList.remove("sy-scanning");
    bar.remove();
  };
}
