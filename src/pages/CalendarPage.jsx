import React from "react";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { useItems } from "@/lib/queries";
import { ITEM_TYPE_MAP, formatTime, toDayKey } from "@/lib/itemTypes";
import { expandRecurring } from "@/lib/recurring";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { cn } from "@/lib/utils";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { data: items } = useItems({});
  const all = items || [];
  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = React.useState(() => new Date());
  const [active, setActive] = React.useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDayKey(new Date());

  const rangeStart = new Date(year, month, 1);
  const rangeEnd = new Date(year, month, daysInMonth);

  const byDay = React.useMemo(() => {
    const map = {};
    const expanded = expandRecurring(all, rangeStart, rangeEnd);
    [...all, ...expanded].forEach((it) => {
      const k = toDayKey(it.date);
      if (!k) return;
      (map[k] = map[k] || []).push(it);
    });
    return map;
  }, [all, rangeStart, rangeEnd]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const selKey = toDayKey(selected);
  const selItems = (byDay[selKey] || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-3xl font-semibold">
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-accent">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => { setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setSelected(new Date()); }} className="rounded-lg border border-border px-3 h-9 text-sm hover:bg-accent">Today</button>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-accent">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6">
        <div className="rounded-2xl border border-border bg-card p-3">
          <div className="grid grid-cols-7 mb-2">
            {DOW.map((d) => <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const k = toDayKey(d);
              const dayItems = byDay[k] || [];
              const isToday = k === todayKey;
              const isSel = k === selKey;
              return (
                <button
                  key={i}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "aspect-square sm:aspect-auto sm:min-h-[64px] rounded-lg border p-1.5 text-left transition flex flex-col",
                    isSel ? "border-brand bg-brand/5" : "border-transparent hover:border-border hover:bg-accent/50"
                  )}
                >
                  <span className={cn("text-xs font-medium", isToday && "grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground")}>
                    {isToday ? "" : d.getDate()}
                    {isToday && d.getDate()}
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {dayItems.slice(0, 3).map((it) => {
                      const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
                      return <span key={it.id} className={cn("h-1.5 w-1.5 rounded-full", it.completed ? "bg-muted-foreground/30" : "bg-brand")} title={it.content} />;
                    })}
                    {dayItems.length > 3 && <span className="text-[9px] text-muted-foreground">+{dayItems.length - 3}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4">
          <h3 className="font-display text-lg font-semibold">
            {selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">{selItems.length} item{selItems.length !== 1 ? "s" : ""}</p>
          {selItems.length ? (
            <div className="space-y-2">
              {selItems.map((it) => {
                const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
                const Icon = TI.icon;
                return (
                  <button key={it.id} onClick={() => setActive(it)} className="w-full text-left rounded-lg border border-border px-3 py-2 hover:shadow-sm transition">
                    <div className="flex items-center gap-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      {it.time && <span className="text-xs font-medium text-brand">{formatTime(it.time)}</span>}
                      <span className={cn("text-sm font-medium truncate", it.completed && "line-through opacity-60")}>{it.content}</span>
                    </div>
                    {it.person_name && <p className="text-[11px] text-muted-foreground mt-0.5">{it.person_name}</p>}
                    {it.recurring && (
                      <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Repeat className="h-3 w-3" /> {it.recurring}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-6 text-center">Nothing scheduled.</p>
          )}
        </div>
      </div>

      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}