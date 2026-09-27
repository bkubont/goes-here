import React from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, AlertCircle, CalendarClock, Receipt, Inbox as InboxIcon,
} from "lucide-react";
import { useItems } from "@/lib/queries";
import {
  ITEM_TYPE_MAP, PINNED_LIST_KEYS, isToday, isUpcoming, isOverdue, parseDay, toDayKey,
} from "@/lib/itemTypes";
import { expandRecurring } from "@/lib/recurring";
import ItemList from "@/components/ItemList";
import { cn } from "@/lib/utils";

function timeSortKey(it) {
  const t = it.time || "99:99";
  const d = parseDay(it.date || it.due_date);
  return `${d ? toDayKey(d) : "9999"}-${t}`;
}

export default function Home() {
  const { data: items } = useItems({});
  const all = items || [];

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const active = all.filter((i) => !i.completed);
  const withRepeats = [...active, ...expandRecurring(active, weekStart, weekEnd)];

  const today = withRepeats
    .filter((i) => isToday(i.date) || isToday(i.due_date))
    .sort((a, b) => timeSortKey(a).localeCompare(timeSortKey(b)));

  const upcoming = withRepeats
    .filter((i) => isUpcoming(i.date || i.due_date) && !isToday(i.date || i.due_date))
    .sort((a, b) => (parseDay(a.date || a.due_date)?.getTime() ?? 0) - (parseDay(b.date || b.due_date)?.getTime() ?? 0))
    .slice(0, 8);

  const overdue = active.filter((i) =>
    (i.date && isOverdue(i.date) && !isToday(i.date)) ||
    (i.due_date && isOverdue(i.due_date) && !isToday(i.due_date))
  );
  const unscheduled = active.filter((i) => i.type === "to_schedule" || (!i.date && !i.due_date && ["todo", "errand", "event", "household"].includes(i.type)));
  const needsReview = active.filter((i) => i.inbox);
  const billsDue = active.filter((i) => i.type === "bill" && i.payment_status !== "paid" && (isOverdue(i.due_date) || isToday(i.due_date) || isUpcoming(i.due_date) || !i.due_date));

  const attention = [
    overdue.length > 0 && {
      key: "overdue",
      label: "Overdue",
      count: overdue.length,
      hint: "Reschedule or complete",
      to: "/calendar",
      icon: AlertCircle,
    },
    unscheduled.length > 0 && {
      key: "unscheduled",
      label: "Unscheduled",
      count: unscheduled.length,
      hint: "Pick a day and time",
      to: "/calendar?tab=unscheduled",
      icon: CalendarClock,
    },
    needsReview.length > 0 && {
      key: "review",
      label: "Needs review",
      count: needsReview.length,
      hint: "Clarify and file",
      to: "/inbox",
      icon: InboxIcon,
    },
    billsDue.length > 0 && {
      key: "bills",
      label: "Bills due",
      count: billsDue.length,
      hint: "Pay or mark paid",
      to: "/lists/bill",
      icon: Receipt,
    },
  ].filter(Boolean);

  const pinned = PINNED_LIST_KEYS.map((key) => {
    const t = ITEM_TYPE_MAP[key];
    const count = all.filter((i) => i.type === key && !i.completed).length;
    return { ...t, count };
  }).filter((t) => t.count > 0 || ["todo", "grocery", "bill"].includes(t.key));

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8 space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <h1 className="page-title mt-1">Today</h1>
      </header>

      {attention.length > 0 && (
        <section>
          <h2 className="font-heading text-base font-semibold mb-3">Needs attention</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {attention.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.key}
                  to={a.to}
                  className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition hover:border-attention/60 hover:shadow-sm"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-[6px] bg-attention/15 text-attention-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {a.label} <span className="text-muted-foreground font-normal">· {a.count}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{a.hint}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Today&apos;s schedule</h2>
          <span className="text-xs text-muted-foreground">{today.length} item{today.length !== 1 ? "s" : ""}</span>
        </div>
        <ItemList items={today} emptyHint="Nothing scheduled for today. Enjoy the breathing room." />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Upcoming</h2>
          <Link to="/calendar" className="text-sm text-primary flex items-center gap-1 hover:underline min-h-[44px]">
            Calendar <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ItemList items={upcoming} emptyHint="Nothing coming up this week." />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Lists</h2>
          <Link to="/lists" className="text-sm text-primary flex items-center gap-1 hover:underline min-h-[44px]">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {pinned.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.key}
                to={`/lists/${t.key}`}
                className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition hover:shadow-sm"
              >
                <span className={cn("grid h-9 w-9 place-items-center rounded-[6px] border", t.tone)}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.plural || t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.count} active</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
