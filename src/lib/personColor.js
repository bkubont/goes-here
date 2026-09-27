/** Resolve people.color for an assignee name; null → neutral fallback. */

const NEUTRAL = null;

/** Exact name match against people rows (items store responsible_name as text). */
export function resolvePersonColor(name, people) {
  if (!name || !people?.length) return NEUTRAL;
  const hit = people.find((p) => p.name === name);
  return hit?.color || NEUTRAL;
}

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

function relativeLuminance({ r, g, b }) {
  const toLin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const R = toLin(r);
  const G = toLin(g);
  const B = toLin(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Soft fill that keeps dark body text readable (STU contrast). */
export function tintFromColor(hex, alpha = 0.14) {
  const rgb = parseHexColor(hex);
  if (!rgb) return undefined;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Inline style for calendar blocks/cards: left border + light tint.
 * Text color stays inherited (dark on canvas) for contrast.
 */
export function personAccentStyle(color) {
  if (!color) return {};
  const rgb = parseHexColor(color);
  if (!rgb) return {};
  // Slightly stronger border for dark colors so the accent reads.
  const borderAlpha = relativeLuminance(rgb) < 0.2 ? 1 : 0.9;
  return {
    borderLeftWidth: "3px",
    borderLeftStyle: "solid",
    borderLeftColor: color,
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    // Keep default border on other sides from class; left overrides via borderLeft*.
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
