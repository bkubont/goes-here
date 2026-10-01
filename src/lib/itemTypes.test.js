import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOverdue, isToday, parseDay, toDayKey } from "./itemTypes.js";

describe("timezone guard", () => {
  it("runs where a date-only string is the previous local evening", () => {
    // 2026-09-27T00:00:00Z is 8:00 PM on Sept 26 in New York (EDT, UTC-4).
    const utcMidnight = new Date("2026-09-27");
    expect(utcMidnight.getFullYear()).toBe(2026);
    expect(utcMidnight.getMonth()).toBe(8);
    expect(utcMidnight.getDate()).toBe(26);
  });
});

describe("parseDay / toDayKey", () => {
  it("keeps a date-only string on that local calendar day", () => {
    const d = parseDay("2026-09-27");
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(8);
    expect(d.getDate()).toBe(27);
    expect(d.getHours()).toBe(0);
    expect(toDayKey("2026-09-27")).toBe("2026-09-27");
  });

  it("uses the local day for a Date, including late evening", () => {
    const evening = new Date(2026, 8, 27, 23, 30, 0);
    expect(toDayKey(evening)).toBe("2026-09-27");
  });

  it("maps an absolute timestamp onto the local day", () => {
    // 2026-09-27T02:00:00Z is 10:00 PM on Sept 26 in New York.
    expect(toDayKey("2026-09-27T02:00:00.000Z")).toBe("2026-09-26");
  });

  it("returns null for empty or unparseable values", () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay("")).toBeNull();
    expect(parseDay("not-a-date")).toBeNull();
    expect(toDayKey(null)).toBeNull();
    expect(toDayKey("")).toBeNull();
  });
});

describe("overdue and today", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 9:30 PM local on Sept 27. UTC is already Sept 28, which is the case that
    // used to mark a date-only "due today" as yesterday.
    vi.setSystemTime(new Date(2026, 8, 27, 21, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not treat a date-only due today as overdue", () => {
    const naive = new Date("2026-09-27");
    naive.setHours(0, 0, 0, 0);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    expect(naive < startOfToday).toBe(true);

    expect(isToday("2026-09-27")).toBe(true);
    expect(isOverdue("2026-09-27")).toBe(false);
    expect(isOverdue("2026-09-26")).toBe(true);
    expect(isToday("2026-09-26")).toBe(false);
    expect(isOverdue("2026-09-28")).toBe(false);
    expect(isToday("2026-09-28")).toBe(false);
  });

  it("prefers due_date, and ignores a missing day", () => {
    expect(isOverdue(undefined)).toBe(false);
    expect(isToday(null)).toBe(false);
    // Same rule as the People "Priority — overdue" list.
    const dueToday = { due_date: "2026-09-27", date: "2026-09-01T15:00:00.000Z" };
    const dueYesterday = { due_date: "2026-09-26", date: "2026-09-27T15:00:00.000Z" };
    expect(isOverdue(dueToday.due_date || dueToday.date)).toBe(false);
    expect(isOverdue(dueYesterday.due_date || dueYesterday.date)).toBe(true);
    expect(isOverdue(undefined || undefined)).toBe(false);
  });
});
