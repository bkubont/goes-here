/** Compact relative time for Recent activity ("just now", "5m ago", …). */
export function formatRelativeTime(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 45) return "just now";
  if (seconds < 3600) {
    const m = Math.max(1, Math.round(seconds / 60));
    return `${m}m ago`;
  }
  if (seconds < 86400) {
    const h = Math.max(1, Math.round(seconds / 3600));
    return `${h}h ago`;
  }
  if (seconds < 86400 * 7) {
    const days = Math.max(1, Math.round(seconds / 86400));
    return days === 1 ? "yesterday" : `${days}d ago`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
