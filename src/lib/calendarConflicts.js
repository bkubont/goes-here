/** Shared snap used by day grid + conflict checks. */
export const SNAP_MINUTES = 15;

function minutesFromMidnight(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Return a Set of item ids that overlap another timed block on the same day.
 * Touching endpoints (A ends when B starts) are not conflicts.
 */
export function overlappingItemIds(scheduled, resolveMinutes) {
  const ranges = (scheduled || [])
    .filter((it) => it?.time)
    .map((it) => {
      const start = minutesFromMidnight(it.time);
      const dur = typeof resolveMinutes === "function"
        ? resolveMinutes(it)
        : SNAP_MINUTES;
      const end = start + Math.max(SNAP_MINUTES, dur || SNAP_MINUTES);
      return { id: it.id, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const conflicts = new Set();
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (b.start >= a.end) break;
      if (a.start < b.end && b.start < a.end) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

/** Snap a duration to 15-minute increments (minimum one snap). */
export function snapDurationMinutes(minutes) {
  const snapped = Math.round(Number(minutes) / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(SNAP_MINUTES, snapped);
}
