/**
 * Supabase's Data API "Max rows" setting defaults to 1,000.
 * One request must stay at or under that cap. A longer request is cut off
 * by the server and looks like the end of the list.
 */
export const DB_PAGE_SIZE = 1000;

/** Safety stop so a stuck full page cannot walk forever. 100 pages = 100,000 rows. */
export const MAX_PAGES = 100;

/**
 * Offset for the next page, or undefined when this page is short (including empty).
 * A full page only means "there may be more" — the following request confirms it.
 */
export function nextPageOffset(page, offset = 0, pageSize = DB_PAGE_SIZE) {
  if (!Array.isArray(page) || page.length < pageSize) return undefined;
  return offset + page.length;
}

/**
 * Split a flat list back into pages so the React Query cache stays page-sized
 * after an optimistic update. Offsets start at 0.
 */
export function chunkRows(rows, pageSize = DB_PAGE_SIZE) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { pages: [[]], pageParams: [0] };
  const pages = [];
  const pageParams = [];
  for (let i = 0; i < list.length; i += pageSize) {
    pages.push(list.slice(i, i + pageSize));
    pageParams.push(i);
  }
  return { pages, pageParams };
}

/**
 * Call fetchPage(offset) until a page comes back shorter than pageSize.
 * fetchPage must request exactly pageSize rows (never more than DB_PAGE_SIZE).
 */
export async function fetchAllPages(fetchPage, options = {}) {
  const pageSize = options.pageSize ?? DB_PAGE_SIZE;
  const maxPages = options.maxPages ?? MAX_PAGES;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > DB_PAGE_SIZE) {
    throw new Error(`pageSize must be an integer from 1 to ${DB_PAGE_SIZE}`);
  }
  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new Error("maxPages must be a positive integer");
  }

  const all = [];
  let offset = 0;
  for (let n = 0; n < maxPages; n++) {
    const page = await fetchPage(offset);
    const rows = Array.isArray(page) ? page : page == null ? [] : null;
    if (!rows) throw new Error("Page fetch did not return a list");
    all.push(...rows);
    const next = nextPageOffset(rows, offset, pageSize);
    if (next == null) return all;
    if (next <= offset) throw new Error("Paging did not advance");
    offset = next;
  }
  throw new Error(
    `Still more rows after ${maxPages} pages (${all.length} loaded). The list was not cut off silently.`
  );
}
