// server/dailyBudget.ts
// Global daily budget for REAL model calls, bounding worst-case spend on the
// public instance even if the per-client rate limit is bypassed with many
// addresses.
//
// A single counter of model calls made in the current UTC day. Once the cap is
// reached, the caller serves the existing offline ready-made decks instead of
// calling the model. The counter resets at UTC midnight.
//
// The clock is injectable so tests can drive the UTC-day rollover with fake
// timers. No external dependencies.

export interface DailyBudgetOptions {
  /** Max real model calls allowed per UTC day. */
  cap: number;
  /** Clock, injectable for tests. Defaults to Date.now. */
  now?: () => number;
  /** Called once when the cap is first hit on a given UTC day (logging). */
  onCapReached?: (dayKey: string) => void;
}

/** YYYY-MM-DD in UTC — the day bucket key. */
function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export class DailyBudget {
  private readonly cap: number;
  private readonly now: () => number;
  private readonly onCapReached: ((dayKey: string) => void) | undefined;
  private dayKey: string;
  private count = 0;
  private loggedForDay: string | null = null;

  constructor(opts: DailyBudgetOptions) {
    this.cap = Math.max(0, Math.floor(opts.cap));
    this.now = opts.now ?? Date.now;
    this.onCapReached = opts.onCapReached;
    this.dayKey = utcDayKey(this.now());
  }

  /** Roll the counter over if the UTC day changed since the last check. */
  private rollover(): void {
    const today = utcDayKey(this.now());
    if (today !== this.dayKey) {
      this.dayKey = today;
      this.count = 0;
      this.loggedForDay = null;
    }
  }

  /**
   * True when there is budget left to make a real model call today. Does NOT
   * consume budget — call `record()` after a real model call is actually made.
   */
  canSpend(): boolean {
    this.rollover();
    if (this.count < this.cap) return true;
    // Cap reached — log exactly once per UTC day.
    if (this.loggedForDay !== this.dayKey) {
      this.loggedForDay = this.dayKey;
      this.onCapReached?.(this.dayKey);
    }
    return false;
  }

  /** Record that one real model call was made (counts toward today's cap). */
  record(): void {
    this.rollover();
    this.count += 1;
  }

  /** Calls made so far today (for tests / introspection). */
  used(): number {
    this.rollover();
    return this.count;
  }
}
