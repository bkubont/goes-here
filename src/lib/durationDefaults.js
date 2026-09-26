// Type / category default durations (minutes). Used when no manual or family_avg estimate exists.
// Keep keys aligned with ITEM_TYPES in itemTypes.js.

export const TYPE_DURATION_DEFAULTS = {
  todo: 25,
  grocery: 60, // shopping trip
  shopping: 45,
  bill: 15,
  event: 60,
  to_schedule: 30,
  idea: 15,
  note: 10,
  research: 45,
  errand: 45,
  gift: 30,
  project_item: 45,
  household: 30,
};

/** Optional overrides by category within a type (e.g. grocery aisle). */
export const CATEGORY_DURATION_DEFAULTS = {
  grocery: {
    Produce: 20,
    Meat: 15,
    Dairy: 15,
    Bakery: 10,
    Frozen: 15,
    Canned: 15,
    Snacks: 10,
    Beverages: 10,
    Household: 20,
    Other: 15,
  },
};

export const DEFAULT_BLOCK_MINUTES = 30;
export const MIN_FAMILY_AVG_SAMPLES = 3;

export function typeDefaultDuration(type, category) {
  if (type && category && CATEGORY_DURATION_DEFAULTS[type]?.[category] != null) {
    return CATEGORY_DURATION_DEFAULTS[type][category];
  }
  if (type && TYPE_DURATION_DEFAULTS[type] != null) {
    return TYPE_DURATION_DEFAULTS[type];
  }
  return DEFAULT_BLOCK_MINUTES;
}

export function formatDuration(minutes) {
  if (minutes == null || Number.isNaN(Number(minutes))) return "";
  const m = Math.round(Number(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}
