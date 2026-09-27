import {
  CheckSquare, ShoppingCart, Receipt, CalendarClock, CalendarDays,
  Lightbulb, StickyNote, Search, Car, Gift, FolderKanban, Home, Package
} from "lucide-react";

/** Neutral type chips — status/attention use gold & labeled status, not rainbow. */
const TONE = "bg-muted text-muted-foreground border-border";

export const ITEM_TYPES = [
  { key: "todo", label: "To Do", plural: "To Dos", icon: CheckSquare, tone: TONE },
  { key: "grocery", label: "Grocery", plural: "Groceries", icon: ShoppingCart, tone: TONE },
  { key: "shopping", label: "Shopping", plural: "Shopping", icon: Package, tone: TONE },
  { key: "bill", label: "Bill", plural: "Bills", icon: Receipt, tone: TONE },
  { key: "event", label: "Event", plural: "Events", icon: CalendarDays, tone: TONE },
  { key: "to_schedule", label: "To Schedule", plural: "To Schedule", icon: CalendarClock, tone: TONE },
  { key: "idea", label: "Idea", plural: "Ideas", icon: Lightbulb, tone: TONE },
  { key: "note", label: "Note", plural: "Notes", icon: StickyNote, tone: TONE },
  { key: "research", label: "Research", plural: "Research", icon: Search, tone: TONE },
  { key: "errand", label: "Errand", plural: "Errands", icon: Car, tone: TONE },
  { key: "gift", label: "Gift", plural: "Gifts", icon: Gift, tone: TONE },
  { key: "project_item", label: "Project item", plural: "Project items", icon: FolderKanban, tone: TONE },
  { key: "household", label: "Household", plural: "Household", icon: Home, tone: TONE },
];

/**
 * Planning / list-type shortcuts (excludes grocery — shopping is its own surface).
 * Used on Home and the Lists hub “Lists” section.
 */
export const PINNED_LIST_KEYS = ["todo", "bill", "errand", "event", "shopping"];

/** Item types shown under Lists / All — grocery lives under Shopping instead. */
export const PLANNING_TYPES = ITEM_TYPES.filter((t) => t.key !== "grocery");
export const PLANNING_TYPE_KEYS = PLANNING_TYPES.map((t) => t.key);

export const STATUS_LABELS = {
  backlog: "Backlog",
  ready: "Ready",
  doing: "Doing",
  done: "Done",
  unpaid: "Unpaid",
  paid: "Paid",
  needs_review: "Needs review",
  overdue: "Overdue",
  unscheduled: "Unscheduled",
};

/** @deprecated Prefer RECURRENCE_CHOICES from @/lib/recurring — kept for callers. */
export const RECURRING_PRESETS = [
  { value: "", label: "Does not repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "every weekday", label: "Every weekday" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
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