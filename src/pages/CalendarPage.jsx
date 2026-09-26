import React from "react";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useItems } from "@/lib/queries";
import { entities } from "@/api/entities";
import { ITEM_TYPE_MAP, formatTime, toDayKey } from "@/lib/itemTypes";
import { expandRecurring } from "@/lib/recurring";
import { invalidateAll } from "@/lib/queries";
import { useToast } from "@/components/ui/use-toast";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import DayGrid, { UnscheduledPool } from "@/components/calendar/DayGrid";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function recordId(it) {
  return it._originalId || it.id;
}

export default function CalendarPage() {
  const { data: items } = useItems({});
  const all = items || [];
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const view = viewParam === "month" ? "month" : "day"; // day default for plan-today

  const [cursor, setCursor] = React.useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = React.useState(() => new Date());
  const [active, setActive] = React.useState(null);
  const [poolSelected, setPoolSelected] = React.useState(null);
  const [workloadPerson, setWorkloadPerson] = React.useState("all");

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDayKey(new Date());

  const rangeStart = view === "month"
    ? new Date(year, month, 1)
    : (() => { const d = new Date(selected); d.setHours(0, 0, 0, 0); return d; })();
  const rangeEnd = view === "month"
    ? new Date(year, month, daysInMonth)
    : (() => { const d = new Date(selected); d.setHours(23, 59, 59, 999); return d; })();

  const byDay = React.useMemo(() => {
    const map = {};
    const expanded = expandRecurring(all, rangeStart, rangeEnd);
    [...all, ...expanded].forEach((it) => {
      const k = toDayKey(it.date);
      if (!k) return;
      (map[k] = map[k] || []).push(it);
    });
    return map;
  }, [all, rangeStart.getTime(), rangeEnd.getTime()]);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const selKey = toDayKey(selected);
  const selItems = (byDay[selKey] || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  // Unscheduled pool: to_schedule, inbox, or dated without time / due without time
  const poolItems = React.useMemo(() => {
    return all.filter((it) => {
      if (it.completed) return false;
      if (it.type === "to_schedule" || it.inbox) return true;
      if (it.date && !it.time) return true;
      if (it.due_date && !it.date && !it.time) return true;
      return false;
    });
  }, [all]);

  const responsibleNames = React.useMemo(() => {
    const set = new Set();
    all.forEach((it) => { if (it.responsible_name) set.add(it.responsible_name); });
    return [...set].sort();
  }, [all]);

  const dayForWorkload = selItems.filter((it) => !it.completed && it.time);
  const workload = React.useMemo(() => {
    const map = {};
    dayForWorkload.forEach((it) => {
      const who = it.responsible_name || "Unassigned";
      if (workloadPerson !== "all" && who !== workloadPerson) return;
      map[who] = (map[who] || 0) + resolveBlockMinutes(it, all);
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [dayForWorkload, workloadPerson, all]);

  function setView(v) {
    const next = new URLSearchParams(searchParams);
    if (v === "day") next.delete("view");
    else next.set("view", v);
    setSearchParams(next, { replace: true });
  }

  async function persistSchedule(it, time, dayKey) {
    const id = recordId(it);
    const dateISO = new Date(`${dayKey}T${time || "09:00"}:00`).toISOString();
    const patch = {
      date: dateISO,
      time: time || "",
      inbox: false,
    };
    // Booking a to_schedule turns it into an event when it gets a time.
    if (it.type === "to_schedule") patch.type = "event";
    try {
      await entities.Item.update(id, patch);
      invalidateAll();
      if (it.recurring) {
        toast({ title: "Scheduled", description: "Updates all repeats of this series." });
      }
    } catch (e) {
      toast({ title: "Could not schedule", description: e.message, variant: "destructive" });
    }
  }

  async function persistMove(it, time, dayKey) {
    await persistSchedule(it, time, dayKey);
  }

  async function persistResize(it, minutes) {
    const id = recordId(it);
    try {
      await entities.Item.update(id, {
        duration_minutes: Math.round(minutes),
        duration_source: "manual",
      });
      invalidateAll();
    } catch (e) {
      toast({ title: "Could not resize", description: e.message, variant: "destructive" });
    }
  }

  function shiftDay(delta) {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta);
    setSelected(d);
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {view === "day"
              ? selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
              : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h1>
          {view === "day" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan today — drag from the pool or resize blocks (device-local time).
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5">
            <button
              onClick={() => setView("day")}
              className={cn("rounded-md px-3 h-8 text-sm", view === "day" ? "bg-brand text-brand-foreground" : "hover:bg-accent")}
            >
              Day
            </button>
            <button
              onClick={() => setView("month")}
              className={cn("rounded-md px-3 h-8 text-sm", view === "month" ? "bg-brand text-brand-foreground" : "hover:bg-accent")}
            >
              Month
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => (view === "day" ? shiftDay(-1) : setCursor(new Date(year, month - 1, 1)))}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-accent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const now = new Date();
                setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelected(now);
              }}
              className="rounded-lg border border-border px-3 h-9 text-sm hover:bg-accent"
            >
              Today
            </button>
            <button
              onClick={() => (view === "day" ? shiftDay(1) : setCursor(new Date(year, month + 1, 1)))}
              className="grid h-9 w-9 place-items-center rounded-lg border border-border hover:bg-accent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {view === "day" ? (
        <div className="space-y-4">
          {/* Family workload differentiator */}
          <div className="rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h3 className="font-display text-sm font-semibold">Family workload</h3>
              <select
                value={workloadPerson}
                onChange={(e) => setWorkloadPerson(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="all">Everyone</option>
                {responsibleNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
                <option value="Unassigned">Unassigned</option>
              </select>
            </div>
            {workload.length === 0 ? (
              <p className="text-xs text-muted-foreground">No timed blocks yet for this filter.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {workload.map(([name, mins]) => (
                  <div key={name} className="min-w-[120px]">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{name}</span>
                      <span className="text-muted-foreground">{formatDuration(mins)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.min(100, (mins / 480) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid lg:grid-cols-[1fr_280px] gap-4">
            <DayGrid
              day={selected}
              items={selItems}
              allItems={all}
              poolItems={poolItems}
              selectedPoolId={poolSelected}
              onSelectPoolItem={setPoolSelected}
              onOpenItem={setActive}
              onSchedule={persistSchedule}
              onMove={persistMove}
              onResize={persistResize}
            />
            <UnscheduledPool
              items={poolItems}
              allItems={all}
              selectedId={poolSelected}
              onSelect={setPoolSelected}
              onOpenItem={setActive}
              isMobile={isMobile}
            />
          </div>
        </div>
      ) : (
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
                    onClick={() => {
                      setSelected(d);
                      setView("day");
                    }}
                    className={cn(
                      "aspect-square sm:aspect-auto sm:min-h-[64px] rounded-lg border p-1.5 text-left transition flex flex-col",
                      isSel ? "border-brand bg-brand/5" : "border-transparent hover:border-border hover:bg-accent/50"
                    )}
                  >
                    <span className={cn("text-xs font-medium", isToday && "grid h-5 w-5 place-items-center rounded-full bg-brand text-brand-foreground")}>
                      {d.getDate()}
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {dayItems.slice(0, 3).map((it) => (
                        <span
                          key={it.id}
                          className={cn("h-1.5 w-1.5 rounded-full", it.completed ? "bg-muted-foreground/30" : "bg-brand")}
                          title={it.content}
                        />
                      ))}
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
            <button
              onClick={() => setView("day")}
              className="mb-3 text-xs text-brand hover:underline"
            >
              Open day grid →
            </button>
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
      )}

      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}
