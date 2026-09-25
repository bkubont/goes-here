// Recurring-event expansion.
// A single item with `recurring` + an anchor `date` is expanded virtually onto
// each matching calendar date — no duplicated records, one source of truth.

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Parse a natural-language recurrence string into a descriptor.
// anchorDate is used to infer weekday / day-of-month for vague patterns.
export function parseRecurrence(text, anchorDate) {
  if (!text) return null;
  const t = text.toLowerCase().trim();

  const dow = t.match(/every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/);
  if (dow) return { kind: "weekly", dow: DAY_NAMES.indexOf(dow[1]) };

  const bare = t.match(/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?$/);
  if (bare) return { kind: "weekly", dow: DAY_NAMES.indexOf(bare[1]) };

  if (/\bdaily\b/.test(t)) return { kind: "daily" };

  let m = t.match(/every\s+(\d+)\s+days?/);
  if (m) return { kind: "dailyN", n: parseInt(m[1], 10) };

  m = t.match(/every\s+(\d+)\s+weeks?/);
  if (m) return { kind: "weeklyN", n: parseInt(m[1], 10), dow: anchorDate ? anchorDate.getDay() : null };

  if (/\bweekly\b/.test(t)) return { kind: "weekly", dow: anchorDate ? anchorDate.getDay() : null };

  m = t.match(/every\s+(\d+)\s+months?/);
  if (m) return { kind: "monthlyN", n: parseInt(m[1], 10), dom: anchorDate ? anchorDate.getDate() : 1 };

  m = t.match(/on\s+the\s+(\d+)(?:st|nd|rd|th)?/);
  if (m) return { kind: "monthlyDom", dom: Math.min(parseInt(m[1], 10), 31) };

  if (/\bmonthly\b/.test(t)) return { kind: "monthlyDom", dom: anchorDate ? anchorDate.getDate() : 1 };

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
    case "weekly": {
      const diff = (rec.dow - n.getDay() + 7) % 7 || 7;
      n.setDate(n.getDate() + diff);
      break;
    }
    case "weeklyN":
      n.setDate(n.getDate() + 7 * rec.n);
      break;
    case "monthlyDom":
    case "monthlyN": {
      const step = rec.kind === "monthlyN" ? rec.n : 1;
      n.setMonth(n.getMonth() + step);
      const dom = Math.min(rec.dom, daysInMonth(n.getFullYear(), n.getMonth()));
      n.setDate(dom);
      break;
    }
    default:
      return null;
  }
  return n;
}

// All occurrence Dates within [start, end] inclusive, on/after the anchor.
export function occurrenceDates(rec, anchor, start, end, max = 500) {
  const out = [];
  if (!rec || !anchor) return out;
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(23, 59, 59, 999);
  let cur = new Date(anchor); cur.setHours(0, 0, 0, 0);
  let guard = 0;
  while (cur <= e && guard < max) {
    if (cur >= s) out.push(new Date(cur));
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

// Expand recurring items into virtual occurrence clones within [start, end].
// The anchor date itself is skipped (the original item already covers that day).
export function expandRecurring(items, start, end) {
  const out = [];
  (items || []).forEach((it) => {
    if (!isRecurring(it)) return;
    const anchor = new Date(it.date);
    if (Number.isNaN(anchor.getTime())) return;
    const rec = parseRecurrence(it.recurring, anchor);
    if (!rec) return;
    const aKey = anchor.toISOString().slice(0, 10);
    occurrenceDates(rec, anchor, start, end).forEach((d) => {
      const key = d.toISOString().slice(0, 10);
      if (key === aKey) return; // original record already on anchor day
      out.push({
        ...it,
        id: `${it.id}__${key}`,
        date: d.toISOString(),
        _recurringOccurrence: true,
        _originalId: it.id,
      });
    });
  });
  return out;
}