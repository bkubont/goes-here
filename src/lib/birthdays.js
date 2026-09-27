import { parseDay, toDayKey } from "@/lib/itemTypes";

/**
 * Next occurrence of a birthday (month/day) on or after `from` (local midnight).
 * Year in the stored date is ignored for recurrence — only month/day matter.
 */
export function nextBirthdayDate(birthday, from = new Date()) {
  const b = parseDay(birthday);
  if (!b) return null;
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const month = b.getMonth();
  const day = b.getDate();
  let next = new Date(start.getFullYear(), month, day);
  if (next < start) {
    next = new Date(start.getFullYear() + 1, month, day);
  }
  return next;
}

/** People whose next birthday falls within the next `withinDays` days (inclusive of today). */
export function upcomingBirthdays(people, withinDays = 30, from = new Date()) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + withinDays);

  return (people || [])
    .map((person) => {
      const next = nextBirthdayDate(person.birthday, start);
      if (!next || next > end) return null;
      const daysUntil = Math.round((next - start) / (24 * 60 * 60 * 1000));
      return { person, nextDate: next, dayKey: toDayKey(next), daysUntil };
    })
    .filter(Boolean)
    .sort((a, b) => a.daysUntil - b.daysUntil || a.person.name.localeCompare(b.person.name));
}

export function formatBirthdayCountdown(daysUntil) {
  if (daysUntil === 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

export function formatBirthdayShort(date) {
  if (!date) return "";
  const d = date instanceof Date ? date : parseDay(date);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
