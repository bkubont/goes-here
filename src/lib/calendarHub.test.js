import { describe, expect, it } from "vitest";
import {
  buildFamilyHubLinks,
  countBoardDoing,
  countHouseholdToday,
  countOpenShopping,
} from "./calendarHub";

describe("countOpenShopping", () => {
  it("counts unchecked grocery and shopping", () => {
    expect(
      countOpenShopping([
        { type: "grocery", completed: false },
        { type: "grocery", completed: true },
        { type: "shopping", completed: false },
        { type: "todo", completed: false },
      ])
    ).toEqual({ grocery: 1, shopping: 1, total: 2 });
  });

  it("ignores recurring occurrence clones", () => {
    expect(
      countOpenShopping([{ type: "grocery", completed: false, _recurringOccurrence: true }])
    ).toEqual({ grocery: 0, shopping: 0, total: 0 });
  });
});

describe("countBoardDoing", () => {
  it("counts open items in doing", () => {
    expect(
      countBoardDoing([
        { board_status: "doing", completed: false },
        { board_status: "doing", completed: true },
        { board_status: "ready", completed: false },
      ])
    ).toBe(1);
  });
});

describe("countHouseholdToday", () => {
  it("matches date or due_date on the day", () => {
    const day = "2026-10-03";
    expect(
      countHouseholdToday(
        [
          { type: "household", completed: false, date: day },
          { type: "household", completed: false, due_date: day },
          { type: "household", completed: false, date: "2026-10-04" },
          { type: "todo", completed: false, date: day },
        ],
        day
      )
    ).toBe(2);
  });
});

describe("buildFamilyHubLinks", () => {
  it("builds deep links only for non-zero counts", () => {
    const links = buildFamilyHubLinks(
      [
        { type: "household", completed: false, date: "2026-10-03" },
        { board_status: "doing", completed: false },
        { type: "grocery", completed: false },
        { type: "shopping", completed: false },
      ],
      { todayKey: "2026-10-03" }
    );
    expect(links.map((l) => l.key)).toEqual(["doing", "household", "shopping"]);
    expect(links.find((l) => l.key === "doing").to).toBe("/board?stage=doing");
    expect(links.find((l) => l.key === "household").to).toBe("/lists/household");
    expect(links.find((l) => l.key === "shopping").to).toBe("/lists/grocery/shop");
    expect(links.find((l) => l.key === "shopping").count).toBe(2);
  });

  it("routes shopping-only open items to shopping list", () => {
    const links = buildFamilyHubLinks(
      [{ type: "shopping", completed: false }],
      { todayKey: "2026-10-03" }
    );
    expect(links).toHaveLength(1);
    expect(links[0].to).toBe("/lists/shopping");
  });

  it("returns empty when nothing needs attention", () => {
    expect(buildFamilyHubLinks([], { todayKey: "2026-10-03" })).toEqual([]);
  });
});
