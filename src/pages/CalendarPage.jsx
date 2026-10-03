import React from "react";
import { ChevronLeft, ChevronRight, Repeat, Clock, Download } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useItems, usePeople, invalidateAll, patchItemsCaches } from "@/lib/queries";
import { entities } from "@/api/entities";
import { ITEM_TYPE_MAP, formatTime, toDayKey, formatDate } from "@/lib/itemTypes";
import { expandRecurring, exceptionSet, formatRecurrenceSummary } from "@/lib/recurring";
import { useToast } from "@/components/ui/use-toast";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import DayGrid, { UnscheduledPool } from "@/components/calendar/DayGrid";
import WeekView, { startOfWeek, endOfWeek, weekDays, matchesPersonFilter } from "@/components/calendar/WeekView";
import FamilyHubStrip from "@/components/calendar/FamilyHubStrip";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";
import { downloadDayIcs } from "@/lib/ics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWeekStartsOn, weekDayLabels, monthGridPad } from "@/lib/weekStart";
import {
  parseCalendarDateParam,
  parseCalendarPersonParam,
  resolveCalendarView,
} from "@/lib/calendarView";
import {
  personAccentStyle,
  personBarStyle,
  personChipDotStyle,
  personMonthChipStyle,
  resolvePersonColor,
} from "@/lib/personColor";
import { useDevicePerson } from "@/lib/devicePerson";

const POOL_TYPES = new Set([
  "todo", "to_schedule", "event", "errand", "household", "project_item", "research", "gift",
]);

/** Max titled chips per month cell before "+N" (Skylight-style wall glance). */
const MONTH_CHIP_MAX = 3;

/** Compact clock for month chips — e.g. 9a, 3:30p. */
function compactTime(t) {
  if (!t) return "";
  const [h, m] = String(t).split(":");
  if (!h) return "";
  const hr = parseInt(h, 10);
  if (Number.isNaN(hr)) return "";
  const ampm = hr >= 12 ? "p" : "a";
  const hr12 = hr % 12 || 12;
  if (m && m !== "00") return `${hr12}:${m}${ampm}`;
  return `${hr12}${ampm}`;
}

function sortedDayItems(list, personFilter) {
  let items = (list || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  if (personFilter && personFilter !== "all") {
    items = items.filter((it) => matchesPersonFilter(it, personFilter));
  }
  return items;
}

function hasClockTime(it) {
  return !!(it.time && String(it.time).trim());
}

function isPoolCandidate(it, dayKey) {
  if (!it || it.completed) return false;
  if (hasClockTime(it)) return false;
  if (it.type === "to_schedule" || it.inbox) return true;
  const dateKey = toDayKey(it.date);
  const dueKey = toDayKey(it.due_date);
  if (dayKey && (dateKey === dayKey || dueKey === dayKey)) return true;
  if (!dateKey && !dueKey && POOL_TYPES.has(it.type)) return true;
  return false;
}

function recordId(it) {
  return it._originalId || it.id;
}

export default function CalendarPage() {
  const { data: items } = useItems({});
  const { data: peopleData, isSuccess: peopleReady } = usePeople();
  const people = peopleData || [];
  const meName = useDevicePerson();
  const all = items || [];
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const weekStartsOn = useWeekStartsOn();
  const dowLabels = weekDayLabels(weekStartsOn);
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = searchParams.get("view");
  const tabParam = searchParams.get("tab");
  const dateParam = searchParams.get("date");
  const personParam = searchParams.get("person");
  const dateFromUrl = React.useMemo(() => parseCalendarDateParam(dateParam), [dateParam]);
  // URL ?view= wins; otherwise Settings default; else agenda (mobile) / day (desktop).
  const view = resolveCalendarView(viewParam, { isMobile });
  const showUnscheduled = tabParam === "unscheduled" || (!isMobile && view === "day");

  const [cursor, setCursor] = React.useState(() => {
    const seed = dateFromUrl || new Date();
    return new Date(seed.getFullYear(), seed.getMonth(), 1);
  });
  const [selected, setSelected] = React.useState(() => dateFromUrl || new Date());
  const [active, setActive] = React.useState(null);
  const [poolSelected, setPoolSelected] = React.useState(null);
  const [workloadPerson, setWorkloadPerson] = React.useState("all");
  const [personFilter, setPersonFilter] = React.useState(() =>
    parseCalendarPersonParam(personParam, null) || "all"
  );
  const [myDayOnly, setMyDayOnly] = React.useState(false);
  const [scheduleTarget, setScheduleTarget] = React.useState(null);
  const [scheduleTime, setScheduleTime] = React.useState("09:00");
  const [scheduleDate, setScheduleDate] = React.useState(() => toDayKey(dateFromUrl || new Date()));

  // Deep link: ?date=YYYY-MM-DD wins when the URL changes.
  React.useEffect(() => {
    if (!dateFromUrl) return;
    const nextKey = toDayKey(dateFromUrl);
    if (nextKey === toDayKey(selected)) return;
    setSelected(dateFromUrl);
    setCursor(new Date(dateFromUrl.getFullYear(), dateFromUrl.getMonth(), 1));
  }, [dateParam]); // eslint-disable-line react-hooks/exhaustive-deps -- sync from URL only

  function writeDateParam(d, extra) {
    const next = new URLSearchParams(searchParams);
    const key = toDayKey(d);
    if (key) next.set("date", key);
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      });
    }
    setSearchParams(next, { replace: true });
  }

  function goToDate(d, extra) {
    const next = new Date(d);
    next.setHours(0, 0, 0, 0);
    setSelected(next);
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    writeDateParam(next, extra);
  }

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDayPad = monthGridPad(year, month, weekStartsOn);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = toDayKey(new Date());

  const rangeStart = view === "month"
    ? new Date(year, month, 1)
    : view === "week"
      ? startOfWeek(selected, weekStartsOn)
      : (() => { const d = new Date(selected); d.setHours(0, 0, 0, 0); return d; })();
  const rangeEnd = view === "month"
    ? new Date(year, month, daysInMonth)
    : view === "agenda"
      ? (() => { const d = new Date(selected); d.setDate(d.getDate() + 13); d.setHours(23, 59, 59, 999); return d; })()
      : view === "week"
        ? endOfWeek(selected, weekStartsOn)
        : (() => { const d = new Date(selected); d.setHours(23, 59, 59, 999); return d; })();

  const weekDayList = React.useMemo(
    () => (view === "week" ? weekDays(selected, weekStartsOn) : []),
    [view, selected.getTime(), weekStartsOn]
  );

  const byDay = React.useMemo(() => {
    const map = {};
    const expanded = expandRecurring(all, rangeStart, rangeEnd);
    [...all, ...expanded].forEach((it) => {
      const k = toDayKey(it.date);
      if (!k) return;
      // Hide series master (or any dated item) on skipped exception days.
      if (!it._recurringOccurrence && exceptionSet(it).has(k)) return;
      (map[k] = map[k] || []).push(it);
    });
    return map;
  }, [all, rangeStart.getTime(), rangeEnd.getTime()]);

  const cells = [];
  for (let i = 0; i < firstDayPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const selKey = toDayKey(selected);
  const selItems = React.useMemo(() => {
    let list = (byDay[selKey] || []).slice().sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    if (myDayOnly && meName) {
      list = list.filter((it) => it.responsible_name === meName);
    } else if (personFilter !== "all") {
      list = list.filter((it) => matchesPersonFilter(it, personFilter));
    }
    return list;
  }, [byDay, selKey, myDayOnly, meName, personFilter]);

  const poolItems = React.useMemo(() => {
    return all.filter((it) => isPoolCandidate(it, selKey));
  }, [all, selKey]);

  const responsibleNames = React.useMemo(() => {
    const set = new Set();
    people.forEach((p) => { if (p?.name) set.add(p.name); });
    all.forEach((it) => { if (it.responsible_name) set.add(it.responsible_name); });
    return [...set].sort();
  }, [all, people]);

  const filterPeople = React.useMemo(() => {
    return responsibleNames.map((name) => ({
      name,
      color: resolvePersonColor(name, people),
    }));
  }, [responsibleNames, people]);

  // People-table names only — used to validate ?person= after the people query succeeds.
  // Do not use item-derived responsibleNames (can omit someone with no assigned items).
  const peopleNames = React.useMemo(
    () => people.map((p) => p?.name).filter(Boolean),
    [people]
  );

  // Deep link: ?person=Name restores kitchen bookmarks; keep across views.
  React.useEffect(() => {
    if (!personParam) {
      if (personFilter !== "all") setPersonFilter("all");
      return;
    }
    // Optimistic restore while people are loading — never reject yet.
    if (!peopleReady) {
      const optimistic = parseCalendarPersonParam(personParam, null);
      if (optimistic && optimistic !== personFilter) setPersonFilter(optimistic);
      if (optimistic && optimistic !== "all") setMyDayOnly(false);
      return;
    }
    const resolved = parseCalendarPersonParam(personParam, peopleNames);
    if (!resolved) {
      // Unknown after a successful people fetch — drop stale bookmark.
      const next = new URLSearchParams(searchParams);
      next.delete("person");
      setSearchParams(next, { replace: true });
      setPersonFilter("all");
      return;
    }
    if (resolved !== personFilter) setPersonFilter(resolved);
    if (resolved !== "all") setMyDayOnly(false);
  }, [personParam, peopleReady, peopleNames.join("\0")]); // eslint-disable-line react-hooks/exhaustive-deps -- URL + people query only

  const dayAllDayItems = React.useMemo(
    () => selItems.filter((it) => !hasClockTime(it)),
    [selItems]
  );

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

  const agendaDays = React.useMemo(() => {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(selected);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      const k = toDayKey(d);
      let dayItems = (byDay[k] || []).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
      if (myDayOnly && meName) {
        dayItems = dayItems.filter((it) => it.responsible_name === meName);
      } else if (personFilter !== "all") {
        dayItems = dayItems.filter((it) => matchesPersonFilter(it, personFilter));
      }
      days.push({ date: d, key: k, items: dayItems });
    }
    return days;
  }, [selected, byDay, myDayOnly, meName, personFilter]);

  function writePersonParam(name, baseParams) {
    const next = new URLSearchParams(baseParams || searchParams);
    if (!name || name === "all") next.delete("person");
    else next.set("person", name);
    return next;
  }

  function applyPersonFilter(next) {
    setPersonFilter(next);
    // My Day takes precedence in agenda/day lists — clear it so person chips win.
    if (next !== "all") setMyDayOnly(false);
    setSearchParams(writePersonParam(next), { replace: true });
  }

  function toggleMyDayOnly() {
    if (!meName) {
      toast({
        title: "Pick “This device is” first",
        description: "Settings → This device is — choose your person name.",
      });
      return;
    }
    setMyDayOnly((prev) => {
      const on = !prev;
      if (on) {
        setPersonFilter("all");
        setSearchParams(writePersonParam("all"), { replace: true });
      }
      return on;
    });
  }

  function setView(v) {
    // Keep personFilter (+ ?person=) across Day/Week/Month/Agenda for kitchen bookmarks.
    const next = new URLSearchParams(searchParams);
    if (v === "day" && !isMobile) next.delete("view");
    else next.set("view", v);
    // Keep Unscheduled tab only on day / week / agenda (mobile Schedule|Unscheduled).
    if (v !== "day" && v !== "week" && v !== "agenda") next.delete("tab");
    const key = toDayKey(selected);
    if (key) next.set("date", key);
    setSearchParams(next, { replace: true });
  }

  function navStep() {
    if (view === "agenda" || view === "week") return 7;
    return 1;
  }

  function weekTitle() {
    if (!weekDayList.length) return "Week";
    const a = weekDayList[0];
    const b = weekDayList[6];
    const left = a.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const sameMonth = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
    const sameYear = a.getFullYear() === b.getFullYear();
    const right = b.toLocaleDateString(undefined, sameMonth
      ? { day: "numeric" }
      : sameYear
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" });
    const yearSuffix = sameYear ? `, ${a.getFullYear()}` : "";
    return `${left} – ${right}${yearSuffix}`;
  }

  function setTab(tab) {
    const next = new URLSearchParams(searchParams);
    if (tab === "schedule") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  }

  async function persistSchedule(it, time, dayKey) {
    const id = recordId(it);
    const dateISO = new Date(`${dayKey}T${time || "09:00"}:00`).toISOString();
    const patch = { date: dateISO, time: time || "", inbox: false };
    if (it.type === "to_schedule") patch.type = "event";
    try {
      const row = await entities.Item.update(id, patch);
      patchItemsCaches((list) => list.map((i) => (i.id === id ? { ...i, ...row } : i)));
      await invalidateAll();
      if (it.recurring) {
        toast({ title: "Scheduled", description: "Updates all repeats of this series." });
      } else {
        toast({ title: "Scheduled" });
      }
      setScheduleTarget(null);
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
      const row = await entities.Item.update(id, {
        duration_minutes: Math.round(minutes),
        duration_source: "manual",
      });
      patchItemsCaches((list) => list.map((i) => (i.id === id ? { ...i, ...row } : i)));
      await invalidateAll();
    } catch (e) {
      toast({ title: "Could not resize", description: e.message, variant: "destructive" });
    }
  }

  function shiftDay(delta) {
    const d = new Date(selected);
    d.setDate(d.getDate() + delta);
    goToDate(d);
  }

  function openSchedule(it) {
    setScheduleTarget(it);
    setScheduleTime(it.time || "09:00");
    setScheduleDate(toDayKey(it.date) || toDayKey(selected) || todayKey);
  }

  const weekRangeLabel = weekStartsOn === 1 ? "Mon–Sun" : "Sun–Sat";

  return (
    <div
      className={cn(
        "mx-auto px-4 py-6 md:px-8 md:py-8",
        view === "month" ? "max-w-7xl" : "max-w-6xl"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title">
            {view === "day"
              ? selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
              : view === "agenda"
                ? "Agenda"
                : view === "week"
                  ? weekTitle()
                  : cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h1>
          {view === "day" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Plan the day — drag or use Schedule without dragging.
            </p>
          )}
          {view === "week" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {weekRangeLabel} week · person colors · all-day strip · tap a day for the day grid
            </p>
          )}
          {view === "month" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Family wall glance · tap a day to focus that week · Open day from the side panel
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(view === "day" || view === "agenda") && (
            <button
              type="button"
              onClick={toggleMyDayOnly}
              className={cn(
                "inline-flex min-h-[40px] items-center rounded-[6px] border px-2.5 text-xs font-medium transition",
                myDayOnly && meName
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
              aria-pressed={myDayOnly && !!meName}
            >
              My Day{meName ? ` · ${meName}` : ""}
            </button>
          )}
          {view === "day" && (
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px]"
              onClick={() => {
                const n = downloadDayIcs(selected, selItems, { timedOnly: true });
                if (n) {
                  toast({
                    title: `Exported ${n} timed item${n === 1 ? "" : "s"}`,
                    description: "Downloaded .ics uses floating local times (device wall-clock).",
                  });
                } else {
                  toast({
                    title: "Nothing to export",
                    description: "Add a clock time to items on this day first.",
                  });
                }
              }}
            >
              <Download className="h-4 w-4 mr-1.5" />
              Export day
            </Button>
          )}
          <div className="flex rounded-[6px] border border-border p-0.5 bg-card">
            {isMobile && (
              <button
                type="button"
                onClick={() => setView("agenda")}
                className={cn("rounded-[4px] px-3 min-h-[40px] text-sm", view === "agenda" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
              >
                Agenda
              </button>
            )}
            <button
              type="button"
              onClick={() => setView("day")}
              className={cn("rounded-[4px] px-3 min-h-[40px] text-sm", view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              Day
            </button>
            <button
              type="button"
              onClick={() => setView("week")}
              className={cn("rounded-[4px] px-3 min-h-[40px] text-sm", view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              Week
            </button>
            <button
              type="button"
              onClick={() => setView("month")}
              className={cn("rounded-[4px] px-3 min-h-[40px] text-sm", view === "month" ? "bg-primary text-primary-foreground" : "hover:bg-accent")}
            >
              Month
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => (view === "month" ? goToDate(new Date(year, month - 1, 1)) : shiftDay(-navStep()))}
              className="grid h-11 w-11 place-items-center rounded-[6px] border border-border hover:bg-accent"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => goToDate(new Date())}
              className="rounded-[6px] border border-border px-3 min-h-[44px] text-sm hover:bg-accent"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => (view === "month" ? goToDate(new Date(year, month + 1, 1)) : shiftDay(navStep()))}
              className="grid h-11 w-11 place-items-center rounded-[6px] border border-border hover:bg-accent"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile tabs: Schedule | Unscheduled */}
      {(view === "day" || view === "agenda" || view === "week") && isMobile && (
        <div className="flex gap-1 mb-4 rounded-[6px] border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setTab("schedule")}
            className={cn("flex-1 min-h-[44px] rounded-[4px] text-sm font-medium", !showUnscheduled || tabParam !== "unscheduled" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            Schedule
          </button>
          <button
            type="button"
            onClick={() => setTab("unscheduled")}
            className={cn("flex-1 min-h-[44px] rounded-[4px] text-sm font-medium", tabParam === "unscheduled" ? "bg-primary text-primary-foreground" : "text-muted-foreground")}
          >
            Unscheduled{poolItems.length ? ` (${poolItems.length})` : ""}
          </button>
        </div>
      )}

      {view === "agenda" && tabParam !== "unscheduled" && (
        <div className="space-y-5">
          <PersonFilterBar
            people={filterPeople}
            personFilter={personFilter}
            onChange={applyPersonFilter}
          />
          {agendaDays.map(({ date, key, items: dayItems }) => (
            <section key={key}>
              <button
                type="button"
                onClick={() => goToDate(date, { view: "day" })}
                className="mb-2.5 flex items-baseline gap-2 text-left min-h-[40px]"
              >
                <h2 className="font-heading text-base font-semibold">
                  {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
                </h2>
                {key === todayKey && <span className="text-[11px] font-medium text-primary">Today</span>}
              </button>
              {dayItems.length === 0 ? (
                <p className="text-xs text-muted-foreground pl-1">Nothing scheduled</p>
              ) : (
                <div className="space-y-2.5">
                  {dayItems.map((it) => {
                    const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
                    const accent = personAccentStyle(resolvePersonColor(it.responsible_name, people));
                    const timeLabel = hasClockTime(it) ? formatTime(it.time) : null;
                    return (
                      <div
                        key={it.id}
                        className="flex items-stretch gap-3 rounded-2xl border border-border bg-card px-3.5 py-3.5 min-h-[68px] text-foreground shadow-sm"
                        style={accent}
                      >
                        <button type="button" className="min-w-0 flex-1 flex items-stretch gap-3 text-left" onClick={() => setActive(it)}>
                          <div className="w-[4.5rem] shrink-0 flex flex-col justify-center border-r border-border/60 pr-2">
                            {timeLabel ? (
                              <span className="text-sm font-semibold tabular-nums leading-tight text-foreground">
                                {timeLabel}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">
                                All day
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 flex flex-col justify-center">
                            <span className={cn("text-base font-semibold leading-snug line-clamp-2", it.completed && "line-through opacity-60")}>
                              {it.content}
                            </span>
                            <p className="text-xs text-muted-foreground mt-1">
                              {TI.label}{it.responsible_name ? ` · ${it.responsible_name}` : ""}
                            </p>
                          </div>
                        </button>
                        <Button type="button" variant="outline" size="sm" className="shrink-0 self-center min-h-[40px]" onClick={() => openSchedule(it)}>
                          Reschedule
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {view === "agenda" && tabParam === "unscheduled" && (
        <UnscheduledList items={poolItems} onOpen={setActive} onSchedule={openSchedule} />
      )}

      {view === "week" && tabParam !== "unscheduled" && (
        <div className={cn("grid gap-4", !isMobile && "lg:grid-cols-[1fr_280px]")}>
          <div>
            <PersonFilterBar
              people={filterPeople}
              personFilter={personFilter}
              onChange={applyPersonFilter}
            />
            {isMobile && (
              <FamilyHubStrip items={all} todayKey={todayKey} compact />
            )}
            <WeekView
              days={weekDayList}
              byDay={byDay}
              allItems={all}
              todayKey={todayKey}
              isMobile={isMobile}
              people={people}
              personFilter={personFilter}
              onSelectDay={(d) => goToDate(d, { view: "day" })}
              onOpenItem={setActive}
            />
          </div>
          {!isMobile && (
            <div className="space-y-3">
              <FamilyHubStrip items={all} todayKey={todayKey} compact className="mb-0" />
              <UnscheduledPool
                items={poolItems}
                allItems={all}
                selectedId={poolSelected}
                onSelect={setPoolSelected}
                onOpenItem={setActive}
                isMobile={false}
              />
              <UnscheduledList items={poolItems.slice(0, 8)} onOpen={setActive} onSchedule={openSchedule} compact />
            </div>
          )}
        </div>
      )}

      {view === "week" && tabParam === "unscheduled" && (
        <UnscheduledList items={poolItems} onOpen={setActive} onSchedule={openSchedule} />
      )}

      {view === "day" && (
        <div className="space-y-4">
          {(!isMobile || tabParam !== "unscheduled") && (
            <>
              <div className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="font-heading text-sm font-semibold">Family workload</h3>
                  <select
                    value={workloadPerson}
                    onChange={(e) => setWorkloadPerson(e.target.value)}
                    className="h-10 rounded-[6px] border border-border bg-background px-2 text-xs"
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
                            className={cn("h-full rounded-full", !resolvePersonColor(name, people) && "bg-primary")}
                            style={{
                              width: `${Math.min(100, (mins / 480) * 100)}%`,
                              ...personBarStyle(resolvePersonColor(name, people)),
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <PersonFilterBar
                people={filterPeople}
                personFilter={personFilter}
                onChange={applyPersonFilter}
              />

              {dayAllDayItems.length > 0 && (
                <AllDayStrip
                  items={dayAllDayItems}
                  people={people}
                  onOpen={setActive}
                />
              )}

              <div className={cn("grid gap-4", !isMobile && "lg:grid-cols-[1fr_280px]")}>
                <DayGrid
                  day={selected}
                  items={selItems}
                  allItems={all}
                  people={people}
                  poolItems={poolItems}
                  selectedPoolId={poolSelected}
                  onSelectPoolItem={setPoolSelected}
                  onOpenItem={setActive}
                  onSchedule={persistSchedule}
                  onMove={persistMove}
                  onResize={persistResize}
                />
                {!isMobile && (
                  <div className="space-y-3">
                    <UnscheduledPool
                      items={poolItems}
                      allItems={all}
                      selectedId={poolSelected}
                      onSelect={setPoolSelected}
                      onOpenItem={setActive}
                      isMobile={false}
                    />
                    <UnscheduledList items={poolItems.slice(0, 8)} onOpen={setActive} onSchedule={openSchedule} compact />
                  </div>
                )}
              </div>
            </>
          )}
          {isMobile && tabParam === "unscheduled" && (
            <UnscheduledList items={poolItems} onOpen={setActive} onSchedule={openSchedule} />
          )}
        </div>
      )}

      {view === "month" && (
        <div className="space-y-4">
          <PersonFilterBar
            people={filterPeople}
            personFilter={personFilter}
            onChange={applyPersonFilter}
          />
          {/* Mobile: hubs under filter. Desktop: hubs live in the day sidebar. */}
          <div className="lg:hidden">
            <FamilyHubStrip items={all} todayKey={todayKey} compact />
          </div>
          <div className="grid lg:grid-cols-[1fr_300px] gap-6">
            <div className="rounded-xl border border-border bg-card p-3 md:p-4">
              <div className="grid grid-cols-7 mb-2">
                {dowLabels.map((d) => (
                  <div key={d} className="text-center text-[11px] font-medium text-muted-foreground py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1 md:gap-1.5">
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const k = toDayKey(d);
                  const dayItems = sortedDayItems(byDay[k], personFilter);
                  const visible = dayItems.slice(0, MONTH_CHIP_MAX);
                  const overflow = dayItems.length - visible.length;
                  const isToday = k === todayKey;
                  const isSel = k === selKey;
                  return (
                    <div
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => goToDate(d, { view: "week" })}
                      onKeyDown={(e) => {
                        // Nested chip buttons must keep Enter/Space — only handle cell focus.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          goToDate(d, { view: "week" });
                        }
                      }}
                      className={cn(
                        "rounded-[6px] border p-1 md:p-1.5 text-left transition flex flex-col cursor-pointer",
                        "min-h-[72px] md:min-h-[100px] lg:min-h-[112px]",
                        isSel ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-accent/50"
                      )}
                      aria-label={`${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}${dayItems.length ? `, ${dayItems.length} items` : ""}. Open week.`}
                      aria-pressed={isSel}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium leading-none",
                          isToday && "grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"
                        )}
                      >
                        {d.getDate()}
                      </span>
                      <div className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                        {visible.map((it) => {
                          const color = resolvePersonColor(it.responsible_name, people);
                          const chipStyle = personMonthChipStyle(color);
                          const timeLabel = compactTime(it.time);
                          return (
                            <button
                              key={it.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActive(it);
                              }}
                              className={cn(
                                "w-full min-w-0 rounded-[3px] border border-transparent px-1 py-0.5 text-left leading-tight",
                                it.completed && "opacity-50",
                                !chipStyle && "bg-primary/10"
                              )}
                              style={chipStyle}
                              title={[it.content, it.responsible_name, formatTime(it.time)].filter(Boolean).join(" · ")}
                            >
                              <span className="flex min-w-0 items-baseline gap-0.5">
                                {timeLabel && (
                                  <span className="shrink-0 text-[9px] font-semibold tabular-nums text-foreground/80 md:text-[10px]">
                                    {timeLabel}
                                  </span>
                                )}
                                <span className="truncate text-[9px] font-medium text-foreground md:text-[10px]">
                                  {it.content}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                        {overflow > 0 && (
                          <span className="px-0.5 text-[9px] font-medium text-muted-foreground md:text-[10px]">
                            +{overflow}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-4">
              <div className="hidden lg:block">
                <FamilyHubStrip items={all} todayKey={todayKey} compact />
              </div>
              <h3 className="font-heading text-lg font-semibold">
                {selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                {selItems.length} item{selItems.length !== 1 ? "s" : ""}
                {" · "}
                Tap a day on the grid to focus that week
              </p>
              <div className="mb-3 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => goToDate(selected, { view: "week" })}
                  className="text-sm font-medium text-primary hover:underline min-h-[44px] text-left"
                >
                  Focus week →
                </button>
                <button
                  type="button"
                  onClick={() => goToDate(selected, { view: isMobile ? "day" : null })}
                  className="text-xs text-muted-foreground hover:text-primary hover:underline min-h-[40px] text-left"
                >
                  Open day grid →
                </button>
              </div>
              {selItems.length ? (
                <div className="space-y-2">
                  {selItems.map((it) => {
                    const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
                    const Icon = TI.icon;
                    const accent = personAccentStyle(resolvePersonColor(it.responsible_name, people));
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => setActive(it)}
                        className="w-full text-left rounded-[6px] border border-border px-3 py-2.5 hover:shadow-sm transition min-h-[44px]"
                        style={accent}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          {it.time && (
                            <span className="text-xs font-medium text-primary shrink-0">{formatTime(it.time)}</span>
                          )}
                          <span className={cn("text-sm font-medium truncate", it.completed && "line-through opacity-60")}>
                            {it.content}
                          </span>
                        </div>
                        {it.responsible_name && (
                          <p className="text-[11px] text-muted-foreground mt-0.5">{it.responsible_name}</p>
                        )}
                        {it.recurring && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <Repeat className="h-3 w-3" />{" "}
                            {formatRecurrenceSummary(it.recurring, it._originalDate || it.date) || it.recurring}
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
        </div>
      )}

      {scheduleTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-lg space-y-3">
            <h3 className="font-heading font-semibold">Schedule</h3>
            <p className="text-sm text-muted-foreground truncate">{scheduleTarget.content}</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Date</label>
                <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Time</label>
                <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setScheduleTarget(null)}>Cancel</Button>
              <Button onClick={() => persistSchedule(scheduleTarget, scheduleTime, scheduleDate)}>
                <Clock className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </div>
        </div>
      )}

      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

/** Day header strip for dated items without a clock time. */
function AllDayStrip({ items, people, onOpen }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          All day
        </h3>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {items.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const accent = personAccentStyle(resolvePersonColor(it.responsible_name, people));
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => onOpen?.(it)}
              className={cn(
                "min-h-[40px] max-w-full rounded-[6px] border border-border px-3 py-2 text-left text-sm font-medium truncate",
                it.completed && "opacity-60 line-through"
              )}
              style={accent}
              title={[it.content, it.responsible_name].filter(Boolean).join(" · ")}
            >
              {it.content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PersonFilterBar({ people, personFilter, onChange }) {
  if (!people?.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-4">
      <span className="text-[11px] font-medium text-muted-foreground mr-1">People</span>
      <button
        type="button"
        onClick={() => onChange("all")}
        className={cn(
          "inline-flex min-h-[32px] items-center rounded-[6px] border px-2.5 text-xs font-medium transition",
          personFilter === "all"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-accent"
        )}
        aria-pressed={personFilter === "all"}
      >
        Everyone
      </button>
      {people.map(({ name, color }) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(personFilter === name ? "all" : name)}
          className={cn(
            "inline-flex min-h-[32px] items-center gap-1.5 rounded-[6px] border px-2.5 text-xs font-medium transition",
            personFilter === name
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          )}
          aria-pressed={personFilter === name}
        >
          <span
            className="h-2 w-2 rounded-full shrink-0 bg-muted-foreground/40"
            style={personChipDotStyle(color)}
            aria-hidden
          />
          {name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(personFilter === "Unassigned" ? "all" : "Unassigned")}
        className={cn(
          "inline-flex min-h-[32px] items-center rounded-[6px] border px-2.5 text-xs font-medium transition",
          personFilter === "Unassigned"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-accent"
        )}
        aria-pressed={personFilter === "Unassigned"}
      >
        Unassigned
      </button>
    </div>
  );
}

function UnscheduledList({ items, onOpen, onSchedule, compact }) {
  if (!items?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
        Nothing waiting to be scheduled.
      </div>
    );
  }
  return (
    <div className={cn("space-y-2", compact && "mt-2")}>
      {!compact && <h3 className="font-heading text-sm font-semibold mb-2">Unscheduled</h3>}
      {items.map((it) => {
        const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
        return (
          <div key={it.id} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(it)}>
              <p className="text-sm font-medium truncate">{it.content}</p>
              <p className="text-[11px] text-muted-foreground">
                {TI.label}
                {it.due_date ? ` · due ${formatDate(it.due_date)}` : ""}
              </p>
            </button>
            <Button type="button" size="sm" variant="outline" onClick={() => onSchedule(it)} className="shrink-0">
              Schedule
            </Button>
          </div>
        );
      })}
    </div>
  );
}
