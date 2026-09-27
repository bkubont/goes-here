// Persist last-used Board / Lists filters in localStorage (this browser only).

const BOARD_KEY = "goeshere.filters.board";
const LISTS_KEY = "goeshere.filters.lists";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function loadBoardFilters() {
  const f = readJson(BOARD_KEY, {});
  return {
    responsible: f.responsible || "all",
    person: f.person || "all",
    project: f.project || "all",
    type: f.type || "all",
  };
}

export function saveBoardFilters(filters) {
  writeJson(BOARD_KEY, {
    responsible: filters.responsible || "all",
    person: filters.person || "all",
    project: filters.project || "all",
    type: filters.type || "all",
  });
}

export function loadListsFilters() {
  const f = readJson(LISTS_KEY, {});
  return {
    type: f.type || "all",
    person: f.person || "all",
    responsible: f.responsible || "all",
  };
}

export function saveListsFilters(filters) {
  writeJson(LISTS_KEY, {
    type: filters.type || "all",
    person: filters.person || "all",
    responsible: filters.responsible || "all",
  });
}

export const SAVED_FILTERS_HINT = "Saved on this device";
