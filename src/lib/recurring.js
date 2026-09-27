// Recurring-event expansion.
// A single item with `recurring` + an anchor `date` is expanded virtually onto
// each matching calendar date — no duplicated records, one source of truth.
// `recurring_exceptions` (YYYY-MM-DD[]) skips individual days (skip-one).

import { toDayKey, parseDay, formatDate } from "@/lib/itemTypes";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// Parse a natural-language recurrence string into a descriptor.
// anchorDate is used to infer weekday / day-of-month for vague patterns.
export function parseRecurrence(text, anchorDate) {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  if (t === "none" || t === "does not repeat") return null;

  const dow = t.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (dow) return { kind: "weekly", dow: DAY_NAMES.indexOf(dow[1]) };

  const bare = t.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?$/);
  if (bare) return { kind: "weekly", dow: DAY_NAMES.indexOf(bare[1]) };

  if (/\bevery\s+weekday\b/.test(t) || t === "weekdays") return { kind: "weekdays" };

  if (/\bdaily\b/.test(t)) return { kind: "daily" };

  let m = t.match(/every\s+(\d+)\s+days?/);
  if (m) return { kind: "dailyN", n: parseInt(m[1], 10) };

  m = t.match(/every\s+(\d+)\s+weeks?/);
  if (m) return { kind: "weeklyN", n: parseInt(m[1], 10), dow: anchorDate ? anchorDate.getDay() : null };

  if (/\bbi-?weekly\b/.test(t) || t === "every 2 weeks") {
    return { kind: "weeklyN", n: 2, dow: anchorDate ? anchorDate.getDay() : null };
  }

  if (/\bweekly\b/.test(t)) return { kind: "weekly", dow: anchorDate ? anchorDate.getDay() : null };

  m = t.match(/every\s+(\d+)\s+months?/);
  if (m) return { kind: "monthlyN", n: parseInt(m[1], 10), dom: anchorDate ? anchorDate.getDate() : 1 };

  m = t.match(/on\s+the\s+(\d+)(?:st|nd|rd|th)?/);
  if (m) return { kind: "monthlyDom", dom: Math.min(parseInt(m[1], 10), 31) };

  if (/\bmonthly\b/.test(t)) return { kind: "monthlyDom", dom: anchorDate ? anchorDate.getDate() : 1 };

  if (/\byearly\b/.test(t) || /\bannually\b/.test(t)) {
    return {
      kind: "yearly",
      month: anchorDate ? anchorDate.getMonth() : 0,
      dom: anchorDate ? anchorDate.getDate() : 1,
    };
  }

  return null;
}

// Next occurrence Date strictly after `d` for the given recurrence.
function advance(rec, d) {
  const n = new Date(d);
  switch (rec.kind) {
    case "daily":
      n.setDate(n.getDate() + 1);
      break;
    case "dailyN":
      n.setDate(n.getDate() + rec.n);
      break;
    case "weekdays": {
      n.setDate(n.getDate() + 1);
      while (n.getDay() === 0 || n.getDay() === 6) n.setDate(n.getDate() + 1);
      break;
    }
    case "weekly": {
      const target = rec.dow == null ? n.getDay() : rec.dow;
      const diff = (target - n.getDay() + 7) % 7 || 7;
      n.setDate(n.getDate() + diff);
      break;
    }
    case "weeklyN":
      n.setDate(n.getDate() + 7 * (rec.n || 1));
      break;
    case "monthlyDom":
    case "monthlyN": {
      const step = rec.kind === "monthlyN" ? rec.n : 1;
      // Build the target month from day 1. setMonth() on the 31st overflows
      // (Jan 31 + 1 month becomes March) and skips a short month.
      const shifted = new Date(n.getFullYear(), n.getMonth() + step, 1);
      const dim = daysInMonth(shifted.getFullYear(), shifted.getMonth());
      const dom = Math.min(rec.dom || 1, dim);
      n.setFullYear(shifted.getFullYear(), shifted.getMonth(), dom);
      break;
    }
    case "yearly": {
      n.setFullYear(n.getFullYear() + 1);
      const dom = Math.min(rec.dom, daysInMonth(n.getFullYear(), rec.month));
      n.setMonth(rec.month, dom);
      break;
    }
    default:
      return null;
  }
  return n;
}

export function exceptionSet(item) {
  const raw = item?.recurring_exceptions;
  if (!raw) return new Set();
  if (Array.isArray(raw)) return new Set(raw.filter(Boolean));
  return new Set();
}

// All occurrence Dates within [start, end] inclusive, on/after the anchor.
export function occurrenceDates(rec, anchor, start, end, max = 500, exceptions = null) {
  const out = [];
  if (!rec || !anchor) return out;
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(23, 59, 59, 999);
  let cur = new Date(anchor); cur.setHours(0, 0, 0, 0);

  // If weekdays and anchor is weekend, nudge to next weekday for expansion start.
  if (rec.kind === "weekdays" && (cur.getDay() === 0 || cur.getDay() === 6)) {
    const nudged = advance(rec, new Date(cur.getTime() - 86400000));
    if (nudged) cur = nudged;
  }

  let guard = 0;
  while (cur <= e && guard < max) {
    const key = toDayKey(cur);
    const skipped = exceptions && exceptions.has(key);
    if (cur >= s && !skipped) out.push(new Date(cur));
    const next = advance(rec, cur);
    if (!next || next <= cur) break;
    cur = next;
    guard++;
  }
  return out;
}

export function isRecurring(item) {
  return !!(item && item.recurring && item.date);
}

/** Human-readable summary, e.g. "Every Monday", "Daily", "Monthly on the 15th". */
export function formatRecurrenceSummary(text, anchorDate) {
  if (!text) return "";
  const anchor = anchorDate instanceof Date
    ? anchorDate
    : parseDay(anchorDate);
  const rec = parseRecurrence(text, anchor);
  if (!rec) return capitalize(String(text).trim());

  switch (rec.kind) {
    case "daily":
      return "Daily";
    case "dailyN":
      return rec.n === 1 ? "Daily" : `Every ${rec.n} days`;
    case "weekdays":
      return "Every weekday";
    case "weekly": {
      const dow = rec.dow != null ? rec.dow : (anchor ? anchor.getDay() : null);
      return dow != null ? `Every ${DAY_LABELS[dow]}` : "Weekly";
    }
    case "weeklyN": {
      const dow = rec.dow != null ? rec.dow : (anchor ? anchor.getDay() : null);
      const day = dow != null ? ` on ${DAY_LABELS[dow]}` : "";
      if (rec.n === 2) return `Every 2 weeks${day}`;
      return `Every ${rec.n} weeks${day}`;
    }
    case "monthlyDom":
    case "monthlyN": {
      const dom = rec.dom || (anchor ? anchor.getDate() : null);
      const dayBit = dom ? ` on the ${ordinal(dom)}` : "";
      if (rec.kind === "monthlyN" && rec.n !== 1) return `Every ${rec.n} months${dayBit}`;
      return `Monthly${dayBit}`;
    }
    case "yearly": {
      if (anchor) {
        return `Yearly on ${anchor.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
      }
      return "Yearly";
    }
    default:
      return capitalize(String(text).trim());
  }
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Next occurrence on or after `from` (defaults today), skipping exceptions. */
export function nextOccurrence(item, from = new Date()) {
  if (!isRecurring(item)) return null;
  const anchor = parseDay(item.date);
  if (!anchor) return null;
  const rec = parseRecurrence(item.recurring, anchor);
  if (!rec) return null;
  const exceptions = exceptionSet(item);
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 800);
  const dates = occurrenceDates(rec, anchor, start, end, 400, exceptions);
  return dates[0] || null;
}

export function formatNextOccurrence(item, from = new Date()) {
  const d = nextOccurrence(item, from);
  if (!d) return null;
  return formatDate(toDayKey(d));
}

// Expand recurring items into virtual occurrence clones within [start, end].
// The anchor date itself is skipped (the original item already covers that day)
// unless the anchor is in exceptions (then neither shows).
export function expandRecurring(items, start, end) {
  const out = [];
  (items || []).forEach((it) => {
    if (!isRecurring(it)) return;
    // date may be a date-only string. new Date("YYYY-MM-DD") is UTC midnight
    // and lands on the previous local day in the Americas.
    const anchor = parseDay(it.date);
    if (!anchor) return;
    const rec = parseRecurrence(it.recurring, anchor);
    if (!rec) return;
    const exceptions = exceptionSet(it);
    const aKey = toDayKey(anchor);
    occurrenceDates(rec, anchor, start, end, 500, exceptions).forEach((d) => {
      const key = toDayKey(d);
      if (key === aKey) return; // original record already on anchor day
      const when = new Date(d);
      when.setHours(anchor.getHours(), anchor.getMinutes(), 0, 0);
      out.push({
        ...it,
        id: `${it.id}__${key}`,
        date: when.toISOString(),
        _recurringOccurrence: true,
        _originalId: it.id,
        _originalDate: it.date,
        _occurrenceDay: key,
      });
    });
  });
  return out;
}

/** Preset values written to `items.recurring` — keep parseRecurrence-compatible. */
export const RECURRENCE_CHOICES = [
  { value: "", label: "Does not repeat", group: "none" },
  { value: "daily", label: "Daily", group: "simple" },
  { value: "weekly", label: "Weekly", group: "simple" },
  { value: "every weekday", label: "Every weekday", group: "simple" },
  { value: "monthly", label: "Monthly", group: "simple" },
  { value: "biweekly", label: "Every 2 weeks", group: "simple" },
  { value: "yearly", label: "Yearly", group: "simple" },
];

/** Build a concrete weekly string from anchor weekday, e.g. "every Monday". */
export function weeklyStringForDate(date) {
  const d = date instanceof Date ? date : parseDay(date);
  if (!d) return "weekly";
  return `every ${DAY_NAMES[d.getDay()]}`;
}

export function recurrencePresetValue(text) {
  if (!text) return "none";
  const t = text.toLowerCase().trim();
  if (RECURRENCE_CHOICES.some((c) => c.value && c.value === t)) return t;
  // Treat "every monday" style as weekly custom display
  if (/^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(t)) {
    return "__weekday__";
  }
  if (RECURRENCE_CHOICES.some((c) => c.value === t)) return t;
  return "__custom__";
}

/** Append a YYYY-MM-DD key to exceptions (immutable). */
export function withSkippedDay(item, dayKey) {
  const key = dayKey || item._occurrenceDay || toDayKey(item.date);
  if (!key) throw new Error("No occurrence date to skip");
  const prev = exceptionSet(item);
  prev.add(key);
  return { recurring_exceptions: [...prev], _skippedDay: key };
}

/** Payload for a one-off item detached from a virtual occurrence. */
export function oneOffFromOccurrence(item, patch = {}) {
  const dayKey = item._occurrenceDay || toDayKey(item.date);
  if (!dayKey) throw new Error("No occurrence date to edit");
  const time = item.time || "";
  const dateISO = new Date(`${dayKey}T${time || "09:00"}:00`).toISOString();
  return {
    content: patch.content ?? item.content,
    type: patch.type ?? item.type,
    person_name: patch.person_name ?? item.person_name ?? "",
    responsible_name: patch.responsible_name ?? item.responsible_name ?? "",
    project_name: patch.project_name ?? item.project_name ?? "",
    date: dateISO,
    due_date: patch.due_date !== undefined ? patch.due_date : item.due_date,
    time,
    recurring: "",
    recurring_exceptions: [],
    priority: patch.priority ?? item.priority ?? "medium",
    category: patch.category ?? item.category ?? "",
    amount: patch.amount !== undefined ? patch.amount : item.amount,
    budget: patch.budget !== undefined ? patch.budget : item.budget,
    store: patch.store ?? item.store ?? "",
    location: patch.location ?? item.location ?? "",
    notes: patch.notes ?? item.notes ?? "",
    tags: patch.tags ?? item.tags ?? [],
    inbox: false,
    completed: false,
    board_status: patch.board_status ?? item.board_status ?? "backlog",
    duration_minutes: patch.duration_minutes !== undefined ? patch.duration_minutes : item.duration_minutes,
    duration_source: patch.duration_source !== undefined ? patch.duration_source : item.duration_source,
    reminder_offset: patch.reminder_offset !== undefined ? patch.reminder_offset : item.reminder_offset,
    reminder_dismissed_at: null,
    reminder_snooze_until: null,
    purchased: false,
    wrapped: !!item.wrapped,
    payment_status: item.payment_status,
  };
}
