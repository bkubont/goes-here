import { describe, expect, it } from "vitest";
import { parseDay, toDayKey } from "./itemTypes.js";
import {
  expandRecurring,
  nextOccurrence,
  occurrenceDates,
  parseRecurrence,
} from "./recurring.js";

function keys(dates) {
  return dates.map((d) => toDayKey(d));
}

describe("weekly recurrence", () => {
  it("lands on every Tuesday, including when the anchor is date-only", () => {
    const anchor = parseDay("2026-09-01");
    const rec = parseRecurrence("every Tuesday", anchor);
    const dates = occurrenceDates(rec, anchor, anchor, parseDay("2026-09-29"));
    expect(keys(dates)).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
    ]);

    const expanded = expandRecurring(
      [{ id: "practice", date: "2026-09-01", recurring: "every Tuesday" }],
      anchor,
      parseDay("2026-09-29"),
    );
    // The anchor day stays on the original item; clones are the later Tuesdays.
    expect(expanded.map((item) => item._occurrenceDay)).toEqual([
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
      "2026-09-29",
    ]);
  });
});

describe("monthly recurrence", () => {
  it("clamps month-end to the last real day, including February", () => {
    const anchor = parseDay("2026-01-31");
    const rec = parseRecurrence("monthly", anchor);
    const dates = occurrenceDates(rec, anchor, anchor, parseDay("2026-04-30"));
    expect(keys(dates)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("uses February 29 in a leap year, then returns to the 31st", () => {
    const anchor = parseDay("2024-01-31");
    const rec = parseRecurrence("monthly", anchor);
    const dates = occurrenceDates(rec, anchor, anchor, parseDay("2024-03-31"));
    expect(keys(dates)).toEqual(["2024-01-31", "2024-02-29", "2024-03-31"]);
  });

  it("steps every N months from the same day-of-month", () => {
    const anchor = parseDay("2026-01-31");
    const rec = parseRecurrence("every 3 months", anchor);
    const dates = occurrenceDates(rec, anchor, anchor, parseDay("2027-01-31"));
    expect(keys(dates)).toEqual([
      "2026-01-31",
      "2026-04-30",
      "2026-07-31",
      "2026-10-31",
      "2027-01-31",
    ]);
  });
});

describe("skipped days", () => {
  const item = {
    id: "practice",
    date: "2026-09-01",
    recurring: "every Tuesday",
    recurring_exceptions: ["2026-09-15"],
  };

  it("omits exception days from expansion and from the next occurrence", () => {
    const anchor = parseDay(item.date);
    const rec = parseRecurrence(item.recurring, anchor);
    const dates = occurrenceDates(
      rec,
      anchor,
      anchor,
      parseDay("2026-09-29"),
      500,
      new Set(item.recurring_exceptions),
    );
    expect(keys(dates)).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-22",
      "2026-09-29",
    ]);

    const expanded = expandRecurring([item], anchor, parseDay("2026-09-29"));
    expect(expanded.map((row) => row._occurrenceDay)).toEqual([
      "2026-09-08",
      "2026-09-22",
      "2026-09-29",
    ]);

    expect(toDayKey(nextOccurrence(item, parseDay("2026-09-14")))).toBe("2026-09-22");
    expect(toDayKey(nextOccurrence(
      { ...item, recurring_exceptions: ["2026-09-01"] },
      anchor,
    ))).toBe("2026-09-08");
  });
});
