/**
 * Shared GoesHere color palette (~28 distinct swatches) for people, projects,
 * and list-type accents. See docs/color-hierarchy.md for surface priority.
 */

/** Curated hex colors — visually distinct, readable as 24–32px swatches. */
export const COLOR_PALETTE = [
  "#0f766e", // teal
  "#0d9488", // teal mid
  "#0891b2", // cyan
  "#0284c7", // sky
  "#0369a1", // sky deep
  "#1d4ed8", // blue
  "#0404A9", // brand blue
  "#0505C7", // indigo blue
  "#4f46e5", // indigo
  "#6366f1", // indigo light
  "#7c3aed", // violet
  "#a21caf", // fuchsia
  "#be185d", // pink
  "#e11d48", // rose
  "#dc2626", // red
  "#ea580c", // orange
  "#d97706", // amber
  "#CFAB59", // brand gold
  "#ca8a04", // yellow ochre
  "#65a30d", // lime
  "#16a34a", // green
  "#15803d", // green deep
  "#047857", // emerald
  "#555D6D", // slate
  "#475569", // slate mid
  "#334155", // slate deep
  "#0A0A0A", // near black
  "#78716c", // stone
];

const DEFAULT_LIST_COLORS = {
  todo: "#1d4ed8",
  shopping: "#0d9488",
  bill: "#dc2626",
  event: "#7c3aed",
  to_schedule: "#d97706",
  idea: "#CFAB59",
  note: "#555D6D",
  research: "#0284c7",
  errand: "#ea580c",
  gift: "#be185d",
  project_item: "#4f46e5",
  household: "#0f766e",
  grocery: "#15803d",
};

/** Human-readable name for a11y labels (nearest known or hex). */
const PALETTE_NAMES = {
  "#0f766e": "Teal",
  "#0d9488": "Teal mid",
  "#0891b2": "Cyan",
  "#0284c7": "Sky",
  "#0369a1": "Sky deep",
  "#1d4ed8": "Blue",
  "#0404a9": "Brand blue",
  "#0505c7": "Indigo blue",
  "#4f46e5": "Indigo",
  "#6366f1": "Indigo light",
  "#7c3aed": "Violet",
  "#a21caf": "Fuchsia",
  "#be185d": "Pink",
  "#e11d48": "Rose",
  "#dc2626": "Red",
  "#ea580c": "Orange",
  "#d97706": "Amber",
  "#cfab59": "Brand gold",
  "#ca8a04": "Ochre",
  "#65a30d": "Lime",
  "#16a34a": "Green",
  "#15803d": "Green deep",
  "#047857": "Emerald",
  "#555d6d": "Slate",
  "#475569": "Slate mid",
  "#334155": "Slate deep",
  "#0a0a0a": "Near black",
  "#78716c": "Stone",
};

/** Parse #RGB / #RRGGBB into { r, g, b } or null. */
export function parseHexColor(hex) {
  if (!hex || typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function hexKey(hex) {
  const rgb = parseHexColor(hex);
  if (!rgb) return "";
  const to = (n) => n.toString(16).padStart(2, "0");
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`;
}

function colorDistance(a, b) {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/** Snap any hex to the nearest palette swatch (migration / sanitize). */
export function nearestPaletteColor(hex) {
  const rgb = parseHexColor(hex);
  if (!rgb) return COLOR_PALETTE[0];
  let best = COLOR_PALETTE[0];
  let bestDist = Infinity;
  for (const swatch of COLOR_PALETTE) {
    const s = parseHexColor(swatch);
    if (!s) continue;
    const d = colorDistance(rgb, s);
    if (d < bestDist) {
      bestDist = d;
      best = swatch;
    }
  }
  return best;
}

/** True when hex is already an exact palette member (case-insensitive). */
export function isPaletteColor(hex) {
  const key = hexKey(hex);
  if (!key) return false;
  return COLOR_PALETTE.some((c) => hexKey(c) === key);
}

/** Normalize to palette; returns default if invalid. */
export function normalizeToPalette(hex, fallback = COLOR_PALETTE[0]) {
  if (!hex) return fallback;
  if (isPaletteColor(hex)) {
    const key = hexKey(hex);
    return COLOR_PALETTE.find((c) => hexKey(c) === key) || fallback;
  }
  return nearestPaletteColor(hex);
}

export function colorSwatchLabel(hex) {
  const key = hexKey(hex);
  const name = PALETTE_NAMES[key];
  return name ? `${name} (${hexKey(hex) || hex})` : `Color ${hexKey(hex) || hex || "unknown"}`;
}

/** Default accent for a list type key. */
export function defaultListTypeColor(typeKey) {
  return DEFAULT_LIST_COLORS[typeKey] || COLOR_PALETTE[0];
}

function relativeLuminance({ r, g, b }) {
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/** Soft fill that keeps dark body text readable. */
export function tintFromColor(hex, alpha = 0.14) {
  const rgb = parseHexColor(hex);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Surface accent: left border + light tint (lists hub, project chrome).
 * Does not set text color — keep inherited dark text for contrast.
 */
export function surfaceAccentStyle(color, { tintAlpha = 0.08, borderWidth = 3 } = {}) {
  if (!color) return {};
  const rgb = parseHexColor(color);
  if (!rgb) return {};
  const borderAlpha = relativeLuminance(rgb) < 0.2 ? 1 : 0.9;
  return {
    borderLeftWidth: `${borderWidth}px`,
    borderLeftStyle: "solid",
    borderLeftColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${borderAlpha})`,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${tintAlpha})`,
    ["--surface-accent"]: color,
  };
}

/** Solid icon/avatar fill. */
export function solidColorStyle(color) {
  if (!color) return undefined;
  return { backgroundColor: color };
}
