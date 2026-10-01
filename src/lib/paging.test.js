import { describe, expect, it, vi } from "vitest";
import { DB_PAGE_SIZE, chunkRows, fetchAllPages, nextPageOffset } from "./paging.js";

describe("nextPageOffset", () => {
  it("stops on a short page, including an empty one", () => {
    expect(nextPageOffset([{ id: 1 }, { id: 2 }], 0, 3)).toBeUndefined();
    expect(nextPageOffset([], 1000, DB_PAGE_SIZE)).toBeUndefined();
    expect(nextPageOffset(null, 0, DB_PAGE_SIZE)).toBeUndefined();
  });

  it("continues only when the page is full, from the real offset", () => {
    expect(nextPageOffset([1, 2, 3], 0, 3)).toBe(3);
    expect(nextPageOffset([1, 2, 3], 3, 3)).toBe(6);
    expect(nextPageOffset(new Array(DB_PAGE_SIZE), 0)).toBe(DB_PAGE_SIZE);
    expect(nextPageOffset(new Array(DB_PAGE_SIZE), DB_PAGE_SIZE)).toBe(DB_PAGE_SIZE * 2);
  });
});

describe("chunkRows", () => {
  it("keeps page boundaries so a full last page still means there may be more", () => {
    const { pages, pageParams } = chunkRows([1, 2, 3, 4, 5], 2);
    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
    expect(pageParams).toEqual([0, 2, 4]);
    expect(nextPageOffset(pages.at(-1), pageParams.at(-1), 2)).toBeUndefined();

    const full = chunkRows([1, 2, 3, 4], 2);
    expect(nextPageOffset(full.pages.at(-1), full.pageParams.at(-1), 2)).toBe(4);
  });
});

describe("fetchAllPages", () => {
  it("keeps requesting until a short page, then stops", async () => {
    const fetchPage = vi.fn(async (offset) => {
      if (offset === 0) return [1, 2];
      if (offset === 2) return [3, 4];
      if (offset === 4) return [5];
      throw new Error(`unexpected offset ${offset}`);
    });

    await expect(fetchAllPages(fetchPage, { pageSize: 2 })).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 2, 4]);
  });

  it("treats an empty page after an exact multiple as the end", async () => {
    const fetchPage = vi.fn(async (offset) => (offset === 0 ? [1, 2] : []));
    await expect(fetchAllPages(fetchPage, { pageSize: 2 })).resolves.toEqual([1, 2]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("refuses a page size above the Supabase default cap", async () => {
    await expect(fetchAllPages(async () => [], { pageSize: DB_PAGE_SIZE + 1 })).rejects.toThrow(
      /pageSize/
    );
  });

  it("loads every row when the database is larger than the 1,000-row cap", async () => {
    const db = Array.from({ length: 2500 }, (_, i) => i);
    const fetchPage = vi.fn(async (offset) => db.slice(offset, offset + DB_PAGE_SIZE));
    const all = await fetchAllPages(fetchPage);
    expect(all).toHaveLength(2500);
    expect(all[0]).toBe(0);
    expect(all[2499]).toBe(2499);
    expect(fetchPage.mock.calls.map((c) => c[0])).toEqual([0, 1000, 2000]);
  });

  it("throws instead of returning a partial list when the walk hits the cap", async () => {
    const fetchPage = vi.fn(async () => [1, 2]);
    await expect(fetchAllPages(fetchPage, { pageSize: 2, maxPages: 2 })).rejects.toThrow(
      /Still more rows/
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
