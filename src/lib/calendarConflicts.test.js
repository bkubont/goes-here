import { describe, expect, it } from "vitest";
import { parseCalendarDateParam, parseCalendarPersonParam } from "./calendarView.js";
import { overlappingItemIds, snapDurationMinutes } from "./calendarConflicts.js";

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