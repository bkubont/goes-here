import {
  CheckSquare, ShoppingCart, Receipt, CalendarClock, CalendarDays,
  Lightbulb, StickyNote, Search, Car, Gift, FolderKanban, Home, Package
} from "lucide-react";

export const ITEM_TYPES = [
  { key: "todo", label: "To Do", icon: CheckSquare, tone: "bg-blue-50 text-blue-700 border-blue-200" },
  { key: "grocery", label: "Grocery", icon: ShoppingCart, tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "shopping", label: "Shopping", icon: Package, tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "bill", label: "Bill", icon: Receipt, tone: "bg-rose-50 text-rose-700 border-rose-200" },
  { key: "event", label: "Event", icon: CalendarDays, tone: "bg-violet-50 text-violet-700 border-violet-200" },
  { key: "to_schedule", label: "To Schedule", icon: CalendarClock, tone: "bg-orange-50 text-orange-700 border-orange-200" },
  { key: "idea", label: "Idea", icon: Lightbulb, tone: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  { key: "note", label: "Note", icon: StickyNote, tone: "bg-slate-50 text-slate-700 border-slate-200" },
  { key: "research", label: "Research", icon: Search, tone: "bg-cyan-50 text-cyan-700 border-cyan-200" },
  { key: "errand", label: "Errand", icon: Car, tone: "bg-teal-50 text-teal-700 border-teal-200" },
  { key: "gift", label: "Gift", icon: Gift, tone: "bg-pink-50 text-pink-700 border-pink-200" },
  { key: "project_item", label: "Project", icon: FolderKanban, tone: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { key: "household", label: "Household", icon: Home, tone: "bg-lime-50 text-lime-700 border-lime-200" },
];

export const ITEM_TYPE_MAP = Object.fromEntries(ITEM_TYPES.map((t) => [t.key, t]));

// Duration defaults live in durationDefaults.js. Quick Add AI optional duration_minutes
// must stay in sync with supabase/functions/quick-add/index.ts TYPE_ENUM above.

export const GROCERY_CATEGORIES = [
  "Produce", "Meat", "Dairy", "Bakery", "Frozen", "Canned", "Snacks", "Beverages", "Household", "Other",
];

export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Date-only strings ("2026-09-25", e.g. due_date) are read as local midnight.
// new Date() would read them as UTC midnight, which is the previous evening in
// the Americas and shifts them back a day.
export function parseDay(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Local calendar day as "YYYY-MM-DD" (toISOString() would give the UTC day).
export function toDayKey(value) {
  const d = value instanceof Date ? value : parseDay(value);
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso) {
  const d = parseDay(iso);
  if (!d) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatTime(t) {
  if (!t) return "";
  const [h, m] = t.split(":");
  if (!h) return t;
  const hr = parseInt(h, 10);
  const ampm = hr >= 12 ? "PM" : "AM";
  const hr12 = hr % 12 || 12;
  return `${hr12}:${m || "00"} ${ampm}`;
}

export function isToday(iso) {
  const d = parseDay(iso);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function isUpcoming(iso) {
  const d = parseDay(iso);
  if (!d) return false;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return d >= start && d < end;
}

export function isOverdue(iso) {
  const d = parseDay(iso);
  if (!d) return false;
  const now = new Date();
  d.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return d < now;
}