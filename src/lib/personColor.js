/**
 * Person color helpers for Calendar time-blocking (hierarchy rank 2).
 * Board views must NOT use these as primary card chrome — see color-hierarchy.md.
 */

import {
  parseHexColor,
  tintFromColor,
  normalizeToPalette,
} from "@/lib/colorPalette";

export { parseHexColor, tintFromColor, normalizeToPalette };

const NEUTRAL = null;

/** Exact name match against people rows (items store responsible_name as text). */
export function resolvePersonColor(name, people) {
  if (!name || !people?.length) return NEUTRAL;
  const hit = people.find((p) => p.name === name);
  if (!hit?.color) return NEUTRAL;
  // Snap legacy off-palette colors so calendar accents stay consistent.
  return normalizeToPalette(hit.color);
}

function relativeLuminance({ r, g, b }) {
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
}

/**
 * Inline style for calendar blocks/cards: left border + light tint.
 * Text color stays inherited (dark on canvas) for contrast.
 */
export function personAccentStyle(color) {
  if (!color) return {};
  const rgb = parseHexColor(color);
  if (!rgb) return {};
  const borderAlpha = relativeLuminance(rgb) < 0.2 ? 1 : 0.9;
  return {
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    boxShadow: `inset 0 0 0 0 transparent`,
    ["--person-accent"]: color,
    ["--person-accent-border"]: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${borderAlpha})`,
  };
}

/** Workload bar fill — solid person color when known. */
export function personBarStyle(color) {
  if (!color) return undefined;
  return { backgroundColor: color };
}

/** Subtle person chip for Board cards — accent only, not full card chrome. */
export function personChipDotStyle(color) {
  if (!color) return undefined;
  return { backgroundColor: color };
}
