/** Shared snap used by day grid + conflict checks. */
export const SNAP_MINUTES = 15;

const DEFAULT_DAY_START_MIN = 6 * 60;
const DEFAULT_DAY_END_MIN = 22 * 60;

function minutesFromMidnight(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Format minutes-from-midnight as HH:MM. */
export function formatMinutesHHMM(totalMins) {
  const mins = Math.max(0, Math.round(Number(totalMins) || 0));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Snap a start time (minutes from midnight) into the day grid window.
 */
export function snapStartMinutes(
  totalMins,
  { dayStartMin = DEFAULT_DAY_START_MIN, dayEndMin = DEFAULT_DAY_END_MIN } = {}
) {
  const snapped = Math.round(Number(totalMins) / SNAP_MINUTES) * SNAP_MINUTES;
  const max = dayEndMin - SNAP_MINUTES;
  return Math.max(dayStartMin, Math.min(max, snapped));
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

/**
 * Nudge a clock time by delta minutes (usually ±15), clamped to the day window
 * so the block can still start before day end.
 */
export function nudgeTimeString(
  timeStr,
  deltaMinutes,
  {
    dayStartMin = DEFAULT_DAY_START_MIN,
    dayEndMin = DEFAULT_DAY_END_MIN,
    durationMinutes = SNAP_MINUTES,
  } = {}
) {
  const start = minutesFromMidnight(timeStr);
  const dur = Math.max(SNAP_MINUTES, Number(durationMinutes) || SNAP_MINUTES);
  const maxStart = Math.max(dayStartMin, dayEndMin - dur);
  const next = snapStartMinutes(start + Number(deltaMinutes || 0), {
    dayStartMin,
    dayEndMin,
  });
  return formatMinutesHHMM(Math.max(dayStartMin, Math.min(maxStart, next)));
}

/**
 * Find the next free start time (HH:MM) that fits `durationMinutes` without
 * overlapping existing timed blocks. Searches forward from `fromMinutes`
 * (default: day start) in SNAP_MINUTES steps.
 * Returns null if nothing fits before day end.
 */
export function nextFreeSlot(
  scheduled,
  resolveMinutes,
  durationMinutes,
  {
    fromMinutes = DEFAULT_DAY_START_MIN,
    dayStartMin = DEFAULT_DAY_START_MIN,
    dayEndMin = DEFAULT_DAY_END_MIN,
    excludeId = null,
  } = {}
) {
  const dur = snapDurationMinutes(durationMinutes || SNAP_MINUTES);
  const ranges = (scheduled || [])
    .filter((it) => it?.time && it.id !== excludeId)
    .map((it) => {
      const start = minutesFromMidnight(it.time);
      const blockDur = typeof resolveMinutes === "function"
        ? resolveMinutes(it)
        : SNAP_MINUTES;
      const end = start + Math.max(SNAP_MINUTES, blockDur || SNAP_MINUTES);
      return { start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let cursor = snapStartMinutes(Math.max(dayStartMin, fromMinutes), {
    dayStartMin,
    dayEndMin,
  });
  const latestStart = dayEndMin - dur;

  while (cursor <= latestStart) {
    const end = cursor + dur;
    const hit = ranges.find((r) => cursor < r.end && end > r.start);
    if (!hit) return formatMinutesHHMM(cursor);
    // Advance to the next snap at or after the blocking range ends.
    cursor = Math.ceil(hit.end / SNAP_MINUTES) * SNAP_MINUTES;
  }
  return null;
}
