// Practical reminders v1: store timing on the item and surface due ones in UI.
// No push/email delivery — computed client-side from date/time + reminder_offset.

import { useEffect, useState } from "react";
import { parseDay, toDayKey, formatDate, formatTime } from "@/lib/itemTypes";
import { invalidateAll } from "@/lib/queries";

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

/** End-of-local-day (23:59:59.999) for "later today". */
export function endOfLocalDay(from = new Date()) {
  const d = new Date(from);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** 8:00 local tomorrow morning. */
export function tomorrowMorning(from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d;
}

export const SNOOZE_PRESETS = [
  { id: "1h", label: "1h", until: (now) => new Date(now.getTime() + 60 * 60 * 1000) },
  { id: "later", label: "Later today", until: (now) => endOfLocalDay(now) },
  { id: "tomorrow", label: "Tomorrow", until: (now) => tomorrowMorning(now) },
];

/** Patch object for a snooze preset (keeps Clear on reminder_dismissed_at). */
export function snoozePatch(presetId, now = new Date()) {
  const preset = SNOOZE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return { reminder_snooze_until: preset.until(now).toISOString() };
}

/** True when reminder time has passed, item still open, not snoozed, and not cleared. */
export function isReminderDue(item, now = new Date()) {
  if (!item || item.completed || !item.reminder_offset) return false;
  const due = reminderDueAt(item);
  if (!due || due > now) return false;
  if (item.reminder_snooze_until) {
    const until = new Date(item.reminder_snooze_until);
    if (!Number.isNaN(until.getTime()) && until > now) return false;
  }
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

/** Soonest future `reminder_snooze_until` among items, or null. */
export function nextSnoozeWakeAt(items, now = new Date()) {
  let soonest = null;
  for (const item of items || []) {
    if (!item?.reminder_snooze_until) continue;
    const until = new Date(item.reminder_snooze_until);
    if (Number.isNaN(until.getTime()) || until <= now) continue;
    if (!soonest || until < soonest) soonest = until;
  }
  return soonest;
}

/**
 * When a snooze deadline is still in the future, schedule a wake that
 * refreshes item queries so Due reminders reappear without navigation.
 * Returns a "now" Date that advances when a snooze expires (for dueReminders).
 */
export function useSnoozeExpiryRefresh(items) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const wake = nextSnoozeWakeAt(items, now);
    if (!wake) return undefined;
    const delay = Math.max(50, wake.getTime() - Date.now() + 25);
    const id = window.setTimeout(() => {
      setNow(new Date());
      invalidateAll().catch(() => {});
    }, delay);
    return () => window.clearTimeout(id);
  }, [items, now]);

  return now;
}
