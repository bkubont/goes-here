import { describe, expect, it } from "vitest";
import { parseCalendarDateParam, parseCalendarPersonParam } from "./calendarView.js";
import {
  fitDurationMinutes,
  nextFreeSlot,
  nudgeTimeString,
  overlappingItemIds,
  snapDurationMinutes,
} from "./calendarConflicts.js";

describe("parseCalendarDateParam", () => {
  it("parses a valid YYYY-MM-DD as a local date", () => {
    const d = parseCalendarDateParam("2026-10-03");
    expect(d).not.toBeNull();
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(3);
    expect(d.getHours()).toBe(0);
  });

  it("rejects invalid or incomplete values", () => {
    expect(parseCalendarDateParam(null)).toBeNull();
    expect(parseCalendarDateParam("")).toBeNull();
    expect(parseCalendarDateParam("10-03-2026")).toBeNull();
    expect(parseCalendarDateParam("2026-13-01")).toBeNull();
    expect(parseCalendarDateParam("2026-02-31")).toBeNull();
    expect(parseCalendarDateParam("not-a-date")).toBeNull();
  });
});

describe("parseCalendarPersonParam", () => {
  it("matches known names case-insensitively and Unassigned", () => {
    expect(parseCalendarPersonParam("Ada", ["Ada", "Bob"])).toBe("Ada");
    expect(parseCalendarPersonParam("ada", ["Ada", "Bob"])).toBe("Ada");
    expect(parseCalendarPersonParam("Unassigned", ["Ada"])).toBe("Unassigned");
    expect(parseCalendarPersonParam("unassigned", [])).toBe("Unassigned");
  });

  it("keeps raw while loading (null knownNames); rejects unknown after load", () => {
    expect(parseCalendarPersonParam("Ada", null)).toBe("Ada");
    expect(parseCalendarPersonParam("Ada", undefined)).toBe("Ada");
    expect(parseCalendarPersonParam("Ada", [])).toBeNull();
    expect(parseCalendarPersonParam("Nobody", ["Ada"])).toBeNull();
    expect(parseCalendarPersonParam("", ["Ada"])).toBeNull();
    expect(parseCalendarPersonParam(null, ["Ada"])).toBeNull();
  });
});

describe("overlappingItemIds", () => {
  const resolve = (it) => it.duration_minutes || 30;

  it("flags overlapping blocks and ignores touching endpoints", () => {
    const items = [
      { id: "a", time: "09:00", duration_minutes: 60 },
      { id: "b", time: "09:30", duration_minutes: 30 },
      { id: "c", time: "10:00", duration_minutes: 30 },
    ];
    const ids = overlappingItemIds(items, resolve);
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(false);
  });

  it("returns empty when nothing overlaps", () => {
    const items = [
      { id: "a", time: "09:00", duration_minutes: 30 },
      { id: "b", time: "09:30", duration_minutes: 30 },
    ];
    expect(overlappingItemIds(items, resolve).size).toBe(0);
  });
});

describe("snapDurationMinutes", () => {
  it("snaps to 15-minute increments with a 15-minute minimum", () => {
    expect(snapDurationMinutes(7)).toBe(15);
    expect(snapDurationMinutes(22)).toBe(15);
    expect(snapDurationMinutes(23)).toBe(30);
    expect(snapDurationMinutes(60)).toBe(60);
  });
});

describe("fitDurationMinutes", () => {
  it("ceils to 15-minute increments and never rounds down", () => {
    expect(fitDurationMinutes(15)).toBe(15);
    expect(fitDurationMinutes(16)).toBe(30);
    expect(fitDurationMinutes(20)).toBe(30);
    expect(fitDurationMinutes(30)).toBe(30);
  });
});

describe("nudgeTimeString", () => {
  it("nudges by ±15 minutes within the day window", () => {
    expect(nudgeTimeString("09:00", 15)).toBe("09:15");
    expect(nudgeTimeString("09:00", -15)).toBe("08:45");
    expect(nudgeTimeString("06:00", -15)).toBe("06:00");
    expect(nudgeTimeString("21:45", 15, { durationMinutes: 15 })).toBe("21:45");
  });

  it("keeps boundary clamps on the 15-minute grid", () => {
    // 20m block: latest snapped start is 21:30 (not 21:40).
    expect(nudgeTimeString("21:30", 15, { durationMinutes: 20 })).toBe("21:30");
    expect(nudgeTimeString("21:15", 15, { durationMinutes: 20 })).toBe("21:30");
    // 40m block: latest snapped start is 21:15.
    expect(nudgeTimeString("21:15", 15, { durationMinutes: 40 })).toBe("21:15");
  });
});

describe("nextFreeSlot", () => {
  const resolve = (it) => it.duration_minutes || 30;

  it("returns day start when the grid is empty", () => {
    expect(nextFreeSlot([], resolve, 30)).toBe("06:00");
  });

  it("skips occupied ranges and allows touching endpoints", () => {
    const items = [
      { id: "a", time: "06:00", duration_minutes: 60 },
      { id: "b", time: "08:00", duration_minutes: 30 },
    ];
    expect(nextFreeSlot(items, resolve, 30)).toBe("07:00");
    expect(nextFreeSlot(items, resolve, 30, { fromMinutes: 8 * 60 })).toBe("08:30");
  });

  it("ceils fit duration so a 20m item does not pack into a 15m gap", () => {
    // Gap 07:00–07:20 is only 20m; ceil(20)=30 so Next free must skip to 07:30.
    const items = [
      { id: "a", time: "06:00", duration_minutes: 60 },
      { id: "b", time: "07:20", duration_minutes: 40 },
    ];
    expect(nextFreeSlot(items, resolve, 20)).toBe("08:00");
  });

  it("uses actual occupied duration (not rounded down) when scanning", () => {
    // Occupied 06:00–06:20; a 15m candidate must start at 06:30, not 06:15.
    const items = [{ id: "a", time: "06:00", duration_minutes: 20 }];
    expect(nextFreeSlot(items, resolve, 15)).toBe("06:30");
  });

  it("returns null when nothing fits before day end", () => {
    const items = [{ id: "a", time: "06:00", duration_minutes: 16 * 60 }];
    expect(nextFreeSlot(items, resolve, 30)).toBeNull();
  });
});