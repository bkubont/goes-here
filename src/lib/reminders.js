// Practical reminders v1: store timing on the item and surface due ones in UI.
// No push/email delivery — computed client-side from date/time + reminder_offset.

import { parseDay, toDayKey, formatDate, formatTime } from "@/lib/itemTypes";

export const REMINDER_OPTIONS = [
  { value: "", label: "No reminder" },
  { value: "at_time", label: "At scheduled time" },
  { value: "15m", label: "15 minutes before" },
  { value: "1h", label: "1 hour before" },
  { value: "morning", label: "Morning of (8:00 AM)" },
];

export const REMINDER_LABEL = Object.fromEntries(
  REMINDER_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label])
);

function scheduledDateTime(item) {
  const d = parseDay(item.date || item.due_date);
  if (!d) return null;
  if (item.time && /^\d{1,2}:\d{2}$/.test(item.time)) {
    const [h, m] = item.time.split(":").map((n) => parseInt(n, 10));
    d.setHours(h, m || 0, 0, 0);
  } else if (item.date) {
    // Timed events without explicit time: assume 9:00 local.
    d.setHours(9, 0, 0, 0);
  } else {
    // Due-date-only: morning of that day.
    d.setHours(8, 0, 0, 0);
  }
  return d;
}

/** Instant when the reminder should surface, or null if none / unparseable. */
export function reminderDueAt(item) {
  if (!item?.reminder_offset) return null;
  const when = scheduledDateTime(item);
  if (!when) return null;
  const due = new Date(when);
  switch (item.reminder_offset) {
    case "at_time":
      break;
    case "15m":
      due.setMinutes(due.getMinutes() - 15);
      break;
    case "1h":
      due.setHours(due.getHours() - 1);
      break;
    case "morning": {
      const morning = parseDay(item.date || item.due_date);
      if (!morning) return null;
      morning.setHours(8, 0, 0, 0);
      return morning;
    }
    default:
      return null;
  }
  return due;
}

export function reminderLabel(offset) {
  return REMINDER_LABEL[offset] || "";
}

export function formatReminderState(item) {
  if (!item?.reminder_offset) return null;
  const label = reminderLabel(item.reminder_offset);
  const due = reminderDueAt(item);
  if (!due) return label;
  return `${label} · ${formatDate(toDayKey(due))}${item.reminder_offset === "morning" ? "" : ` ${formatTime(`${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`)}`}`;
}

/** True when reminder time has passed, item still open, and not dismissed after that due. */
export function isReminderDue(item, now = new Date()) {
  if (!item || item.completed || !item.reminder_offset) return false;
  const due = reminderDueAt(item);
  if (!due || due > now) return false;
  if (item.reminder_dismissed_at) {
    const dismissed = new Date(item.reminder_dismissed_at);
    if (!Number.isNaN(dismissed.getTime()) && dismissed >= due) return false;
  }
  return true;
}

export function dueReminders(items, now = new Date()) {
  return (items || [])
    .filter((i) => isReminderDue(i, now))
    .sort((a, b) => {
      const da = reminderDueAt(a)?.getTime() ?? 0;
      const db = reminderDueAt(b)?.getTime() ?? 0;
      return da - db;
    });
}
