import React from "react";
import { Link } from "react-router-dom";
import { Inbox as InboxIcon, ArrowRight, Sparkles, CalendarDays, Columns3 } from "lucide-react";
import { useItems } from "@/lib/queries";
import { ITEM_TYPES, isToday, isUpcoming, parseDay } from "@/lib/itemTypes";
import { expandRecurring } from "@/lib/recurring";
import ItemList from "@/components/ItemList";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Home() {
  const { data: items } = useItems({});
  const all = items || [];

  // Include this week's repeats of recurring items alongside the real records.
  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const active = all.filter((i) => !i.completed);
  const withRepeats = [...active, ...expandRecurring(active, weekStart, weekEnd)];

  const today = withRepeats.filter((i) => isToday(i.date) || isToday(i.due_date));
  const upcoming = withRepeats
    .filter((i) => isUpcoming(i.date || i.due_date) && !isToday(i.date || i.due_date))
    .sort((a, b) => (parseDay(a.date || a.due_date)?.getTime() ?? 0) - (parseDay(b.date || b.due_date)?.getTime() ?? 0))
    .slice(0, 8);
  const inboxCount = active.filter((i) => i.inbox || i.type === "to_schedule").length;
  const ideasCount = all.filter((i) => i.type === "idea" && !i.completed).length;

  const counts = {};
  ITEM_TYPES.forEach((t) => {
    counts[t.key] = all.filter((i) => i.type === t.key && !i.completed).length;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10 space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1 className="font-display text-3xl md:text-4xl font-semibold mt-1">{greeting()}.</h1>
        </div>
        <Link to="/inbox" className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <InboxIcon className="h-4 w-4" /> {inboxCount} need review
        </Link>
      </header>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold">Today</h2>
          <span className="text-xs text-muted-foreground">{today.length} item{today.length !== 1 ? "s" : ""}</span>
        </div>
        <ItemList items={today} emptyHint="Nothing scheduled for today. Enjoy the breathing room." />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-xl font-semibold">Upcoming</h2>
          <Link to="/calendar" className="text-sm text-brand flex items-center gap-1 hover:underline">
            Calendar <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ItemList items={upcoming} emptyHint="Nothing coming up this week." />
      </section>

      <section>
        <h2 className="font-display text-xl font-semibold mb-3">Lists</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {ITEM_TYPES.map((t) => {
            const Icon = t.icon;
            const c = counts[t.key];
            return (
              <Link
                key={t.key}
                to={`/lists/${t.key}`}
                className="group rounded-xl border border-border bg-card p-4 transition hover:shadow-sm hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between">
                  <span className={`grid h-9 w-9 place-items-center rounded-lg border ${t.tone}`}>
                    <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                  </span>
                  <span className="text-2xl font-display font-semibold text-muted-foreground/70">{c}</span>
                </div>
                <p className="mt-3 text-sm font-medium">{t.label}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/calendar" className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition">
          <div className="flex items-center gap-2 text-brand mb-1"><CalendarDays className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">Plan</span></div>
          <h3 className="font-display text-lg font-semibold">Plan today</h3>
          <p className="text-sm text-muted-foreground mt-1">Day grid, unscheduled pool, and family workload.</p>
        </Link>
        <Link to="/board" className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition">
          <div className="flex items-center gap-2 text-brand mb-1"><Columns3 className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">Flow</span></div>
          <h3 className="font-display text-lg font-semibold">Board</h3>
          <p className="text-sm text-muted-foreground mt-1">Shared backlog → ready → doing → done.</p>
        </Link>
        <Link to="/people" className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition">
          <h3 className="font-display text-lg font-semibold">People</h3>
          <p className="text-sm text-muted-foreground mt-1">Tasks, schedules & activities by family member.</p>
        </Link>
        <Link to="/projects" className="rounded-xl border border-border bg-card p-5 hover:shadow-sm transition">
          <h3 className="font-display text-lg font-semibold">Projects</h3>
          <p className="text-sm text-muted-foreground mt-1">Tasks, shopping, research & notes in one place.</p>
        </Link>
      </section>

      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground pt-2">
        <Sparkles className="h-3.5 w-3.5 text-brand" /> Capture once. Organize automatically. Find anything.
      </p>
    </div>
  );
}