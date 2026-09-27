/**
 * Light one-way .ics export (download only — not Google/Apple two-way sync).
 *
 * Time assumption: DTSTART/DTEND use *floating local* form (no Z, no TZID).
 * Values are taken from the item’s calendar date + `time` as shown on this
 * device (and optional duration_minutes). Calendar apps that open the file
 * treat those as local wall-clock times in the user’s current timezone.
 * All-day / date-only items use a DATE-valued DTSTART (VALUE=DATE).
 */

import { parseDay, toDayKey } from "@/lib/itemTypes";

function pad(n) {
  return String(n).padStart(2, "0");
}

/** Escape text per RFC 5545. */
export function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\n|\r/g, "\\n");
}

/** Fold long lines at 75 octets (approx chars; fine for ASCII summaries). */
function foldLine(line) {
  if (line.length <= 75) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 75));
  rest = rest.slice(75);
  while (rest.length) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  return parts.join("\r\n");
}

function stampUtcNow() {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Build floating local YYYYMMDD or YYYYMMDDTHHMMSS from item date/time.
 * @returns {{ dateValue: string, timed: boolean } | null}
 */
export function itemLocalStart(item) {
  const day = parseDay(item?.date);
  if (!day) return null;
  const y = day.getFullYear();
  const mo = day.getMonth() + 1;
  const da = day.getDate();
  const datePart = `${y}${pad(mo)}${pad(da)}`;

  const timeStr = item.time && String(item.time).trim();
  if (!timeStr) {
    // Prefer clock from timestamptz if present and not midnight-only ambiguity —
    // still treat as date-only when `time` is empty (Matches app “unscheduled clock”).
    return { dateValue: datePart, timed: false };
  }

  const [hh, mm] = timeStr.split(":");
  const h = Number(hh);
  const m = Number(mm || 0);
  if (Number.isNaN(h)) return { dateValue: datePart, timed: false };
  return {
    dateValue: `${datePart}T${pad(h)}${pad(m)}00`,
    timed: true,
  };
}

function addMinutesLocal(dateValueTimed, minutes) {
  // dateValueTimed: YYYYMMDDTHHMMSS
  const y = Number(dateValueTimed.slice(0, 4));
  const mo = Number(dateValueTimed.slice(4, 6)) - 1;
  const da = Number(dateValueTimed.slice(6, 8));
  const h = Number(dateValueTimed.slice(9, 11));
  const mi = Number(dateValueTimed.slice(11, 13));
  const d = new Date(y, mo, da, h, mi, 0);
  d.setMinutes(d.getMinutes() + minutes);
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function descriptionFor(item) {
  const bits = [];
  if (item.notes) bits.push(item.notes);
  if (item.responsible_name) bits.push(`Assigned to: ${item.responsible_name}`);
  if (item.person_name) bits.push(`About: ${item.person_name}`);
  if (item.project_name) bits.push(`Project: ${item.project_name}`);
  return bits.join("\n");
}

/**
 * One VEVENT block (without VCALENDAR wrapper).
 */
export function itemToVEvent(item, { uidSuffix = "" } = {}) {
  const start = itemLocalStart(item);
  if (!start) return null;

  const uid = `goeshere-${item._originalId || item.id}${uidSuffix}@goes-here`;
  const summary = icsEscape(item.content || "GoesHere item");
  const desc = icsEscape(descriptionFor(item));
  const loc = icsEscape(item.location || item.store || "");

  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stampUtcNow()}`,
  ];

  if (start.timed) {
    lines.push(`DTSTART:${start.dateValue}`);
    const mins = Number(item.duration_minutes);
    if (mins > 0) {
      lines.push(`DTEND:${addMinutesLocal(start.dateValue, Math.round(mins))}`);
    } else {
      // Default 1 hour when timed but no duration.
      lines.push(`DTEND:${addMinutesLocal(start.dateValue, 60)}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${start.dateValue}`);
  }

  lines.push(`SUMMARY:${summary}`);
  if (desc) lines.push(`DESCRIPTION:${desc}`);
  if (loc) lines.push(`LOCATION:${loc}`);
  lines.push("END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

export function buildCalendar(vevents, { calName = "GoesHere" } = {}) {
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//GoesHere//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
    ...vevents,
    "END:VCALENDAR",
  ];
  return `${body.join("\r\n")}\r\n`;
}

/** Download a .ics file in the browser. */
export function downloadIcs(filename, icsText) {
  const blob = new Blob([icsText], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".ics") ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Single-item export. Returns false if item has no date. */
export function downloadItemIcs(item) {
  const vevent = itemToVEvent(item);
  if (!vevent) return false;
  const slug = String(item.content || "item")
    .slice(0, 40)
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase() || "item";
  const day = toDayKey(item.date) || "undated";
  downloadIcs(`goeshere-${day}-${slug}.ics`, buildCalendar([vevent]));
  return true;
}

/** Export timed (or dated) items for one local day. */
export function downloadDayIcs(dayDate, items, { timedOnly = true } = {}) {
  const key = toDayKey(dayDate);
  if (!key) return 0;
  const list = (items || []).filter((it) => {
    if (toDayKey(it.date) !== key) return false;
    if (timedOnly) return !!(it.time && String(it.time).trim());
    return true;
  });
  const vevents = list.map((it, i) => itemToVEvent(it, { uidSuffix: `-${i}` })).filter(Boolean);
  if (!vevents.length) return 0;
  downloadIcs(`goeshere-${key}.ics`, buildCalendar(vevents, { calName: `GoesHere ${key}` }));
  return vevents.length;
}
