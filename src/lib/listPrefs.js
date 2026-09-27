// Per-device list type visibility + order (Settings → Lists).
// Built-in types only — show / hide / reorder (product choice 1B).

import { PINNED_LIST_KEYS, PLANNING_TYPES, PLANNING_TYPE_KEYS } from "@/lib/itemTypes";

const PREFS_KEY = "goeshere.lists.prefs";
const LEGACY_HIDDEN_KEY = "goeshere.lists.hidden";

function defaultOrder() {
  const pinned = PINNED_LIST_KEYS.filter((k) => PLANNING_TYPE_KEYS.includes(k));
  const rest = PLANNING_TYPE_KEYS.filter((k) => !pinned.includes(k));
  return [...pinned, ...rest];
}

function sanitizeOrder(order) {
  const seen = new Set();
  const next = [];
  for (const key of Array.isArray(order) ? order : []) {
    if (PLANNING_TYPE_KEYS.includes(key) && !seen.has(key)) {
      seen.add(key);
      next.push(key);
    }
  }
  for (const key of defaultOrder()) {
    if (!seen.has(key)) next.push(key);
  }
  return next;
}

function sanitizeHidden(hidden, order) {
  const set = new Set(
    (Array.isArray(hidden) ? hidden : []).filter((k) => PLANNING_TYPE_KEYS.includes(k))
  );
  // Never hide every planning type — keep at least the first in order visible.
  if (set.size >= PLANNING_TYPE_KEYS.length) {
    set.delete(order[0] || "todo");
  }
  return [...set];
}

/**
 * @returns {{ order: string[], hidden: string[] }}
 */
export function loadListPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const order = sanitizeOrder(parsed?.order);
      const hidden = sanitizeHidden(parsed?.hidden, order);
      return { order, hidden };
    }
  } catch {
    /* fall through */
  }
  // Migrate legacy hide-only key from Lists hub.
  let legacyHidden = [];
  try {
    const raw = localStorage.getItem(LEGACY_HIDDEN_KEY);
    if (raw) legacyHidden = JSON.parse(raw);
  } catch {
    legacyHidden = [];
  }
  const order = defaultOrder();
  return {
    order,
    hidden: sanitizeHidden(legacyHidden, order),
  };
}

/**
 * @param {{ order?: string[], hidden?: string[] }} prefs
 * @returns {{ order: string[], hidden: string[] }}
 */
export function saveListPrefs(prefs) {
  const current = loadListPrefs();
  const order = sanitizeOrder(prefs.order ?? current.order);
  const hidden = sanitizeHidden(prefs.hidden ?? current.hidden, order);
  const next = { order, hidden };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    // Keep legacy key in sync so older code paths stay consistent.
    localStorage.setItem(LEGACY_HIDDEN_KEY, JSON.stringify(hidden));
  } catch {
    /* ignore quota */
  }
  return next;
}

/** Planning types in user order (including hidden). */
export function orderedPlanningTypes(prefs = loadListPrefs()) {
  const map = Object.fromEntries(PLANNING_TYPES.map((t) => [t.key, t]));
  return prefs.order.map((k) => map[k]).filter(Boolean);
}

/** Visible planning types in user order. */
export function visiblePlanningTypes(prefs = loadListPrefs()) {
  const hidden = new Set(prefs.hidden);
  return orderedPlanningTypes(prefs).filter((t) => !hidden.has(t.key));
}

export function isListTypeHidden(key, prefs = loadListPrefs()) {
  return prefs.hidden.includes(key);
}

export function setListTypeHidden(key, hide) {
  const prefs = loadListPrefs();
  const hidden = new Set(prefs.hidden);
  if (hide) hidden.add(key);
  else hidden.delete(key);
  return saveListPrefs({ ...prefs, hidden: [...hidden] });
}

export function moveListType(key, direction) {
  const prefs = loadListPrefs();
  const order = [...prefs.order];
  const idx = order.indexOf(key);
  if (idx < 0) return prefs;
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= order.length) return prefs;
  [order[idx], order[swap]] = [order[swap], order[idx]];
  return saveListPrefs({ ...prefs, order });
}

export function resetListPrefs() {
  const next = { order: defaultOrder(), hidden: [] };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    localStorage.setItem(LEGACY_HIDDEN_KEY, JSON.stringify([]));
  } catch {
    /* ignore */
  }
  return next;
}
