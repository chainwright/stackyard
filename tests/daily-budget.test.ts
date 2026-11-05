// tests/daily-budget.test.ts
// Unit tests for the global DailyBudget (TASK-21d). Injected clock drives the
// UTC-day rollover without fake timers.

import { describe, it, expect, vi } from "vitest";
import { DailyBudget } from "../server/dailyBudget.js";

/** Milliseconds at a given UTC instant. */
function utc(iso: string): number {
  return new Date(iso).getTime();
}

describe("DailyBudget", () => {
  it("allows spend up to the cap, then refuses", () => {
    let t = utc("2026-01-01T00:00:00Z");
    const budget = new DailyBudget({ cap: 3, now: () => t });

    for (let i = 0; i < 3; i++) {
      expect(budget.canSpend(), `spend ${i + 1}`).toBe(true);
      budget.record();
    }
    expect(budget.used()).toBe(3);
    expect(budget.canSpend()).toBe(false);
  });

  it("logs the cap breach exactly once per UTC day", () => {
    let t = utc("2026-01-01T12:00:00Z");
    const onCapReached = vi.fn();
    const budget = new DailyBudget({ cap: 1, now: () => t, onCapReached });

    expect(budget.canSpend()).toBe(true);
    budget.record();
    // Several checks over the cap — logged only once.
    expect(budget.canSpend()).toBe(false);
    expect(budget.canSpend()).toBe(false);
    expect(onCapReached).toHaveBeenCalledTimes(1);
    expect(onCapReached).toHaveBeenCalledWith("2026-01-01");
  });

  it("resets the counter at UTC midnight", () => {
    let t = utc("2026-01-01T23:59:59Z");
    const onCapReached = vi.fn();
    const budget = new DailyBudget({ cap: 2, now: () => t, onCapReached });

    budget.record();
    budget.record();
    expect(budget.canSpend()).toBe(false);
    expect(budget.used()).toBe(2);

    // Cross UTC midnight into the next day.
    t = utc("2026-01-02T00:00:01Z");
    expect(budget.canSpend()).toBe(true);
    expect(budget.used()).toBe(0);

    // The new day can be capped and logged again (once for the new day).
    budget.record();
    budget.record();
    expect(budget.canSpend()).toBe(false);
    expect(onCapReached).toHaveBeenCalledTimes(2);
    expect(onCapReached).toHaveBeenLastCalledWith("2026-01-02");
  });

  it("a cap of 0 refuses every spend", () => {
    const t = utc("2026-03-03T00:00:00Z");
    const budget = new DailyBudget({ cap: 0, now: () => t });
    expect(budget.canSpend()).toBe(false);
    expect(budget.used()).toBe(0);
  });
});
