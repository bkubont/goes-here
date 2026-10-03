import React from "react";
import { ITEM_TYPE_MAP, formatTime, toDayKey } from "@/lib/itemTypes";
import { formatDuration } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";
import { personAccentStyle, personChipDotStyle, resolvePersonColor } from "@/lib/personColor";
import { cn } from "@/lib/utils";

/** Sunday-start by default; callers pass weekStartsOn from Settings preference. */
export const WEEK_STARTS_ON = 0;

/** Max timed rows shown per day column before "+N more" (keeps 2–5 people readable). */
const MAX_VISIBLE_TIMED = 6;

export function startOfWeek(date, weekStartsOn = WEEK_STARTS_ON) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function endOfWeek(date, weekStartsOn = WEEK_STARTS_ON) {
  const d = startOfWeek(date, weekStartsOn);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function weekDays(anchor, weekStartsOn = WEEK_STARTS_ON) {
  const start = startOfWeek(anchor, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function hasClockTime(it) {
  return !!(it.time && String(it.time).trim());
}

/** Timed items for a day, sorted by time. */
export function timedForDay(dayItems) {
  return (dayItems || [])
    .filter((it) => hasClockTime(it))
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
}

/**
 * Dated items without a clock time (all-day / no-time strip).
 * Prefer `date` match; include due-only when not also listed by date elsewhere.
 */
export function allDayForDay(dayItems) {
  return (dayItems || [])
    .filter((it) => it && !hasClockTime(it))
    .sort((a, b) => String(a.content || "").localeCompare(String(b.content || "")));
}

/** Unscheduled / due that day (dated or due, no clock time). */
export function unscheduledDueCount(all, dayKey) {
  return (all || []).filter((it) => {
    if (!it || it.completed) return false;
    if (hasClockTime(it)) return false;
    const dateKey = toDayKey(it.date);
    const dueKey = toDayKey(it.due_date);
    return dateKey === dayKey || dueKey === dayKey;
  }).length;
}

export function matchesPersonFilter(it, personFilter) {
  if (!personFilter || personFilter === "all") return true;
  const who = it.responsible_name || "Unassigned";
  return who === personFilter;
}

function WeekItemRow({ it, allItems, onOpen, people, dense }) {
  const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
  const dur = resolveBlockMinutes(it, allItems);
  const color = resolvePersonColor(it.responsible_name, people);
  const accent = personAccentStyle(color);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(it);
      }}
      className={cn(
        "w-full text-left rounded-[6px] border border-border hover:bg-accent/40 transition text-foreground",
        dense ? "px-1.5 py-1 min-h-[32px]" : "px-2 py-1.5 min-h-[40px]",
        it.completed && "opacity-60"
      )}
      style={accent}
      title={[it.content, it.responsible_name, formatTime(it.time)].filter(Boolean).join(" · ")}
    >
      <div className="flex items-center gap-1 min-w-0">
        {color && (
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={personChipDotStyle(color)}
            aria-hidden
          />
        )}
        {it.time && (
          <span className={cn(
            "font-semibold text-primary shrink-0 tabular-nums",
            dense ? "text-[9px]" : "text-[10px]"
          )}>
            {formatTime(it.time)}
          </span>
        )}
        <span className={cn(
          "font-medium truncate",
          dense ? "text-[11px] leading-tight" : "text-xs",
          it.completed && "line-through"
        )}>
          {it.content}
        </span>
      </div>
      {!dense && (
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {[formatDuration(dur), it.responsible_name || it.person_name, TI.label]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
    </button>
  );
}

function AllDayChip({ it, people, onOpen, dense }) {
  const color = resolvePersonColor(it.responsible_name, people);
  const accent = personAccentStyle(color);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(it);
      }}
      className={cn(
        "w-full text-left rounded-[4px] border border-border/80 hover:bg-accent/40 transition text-foreground truncate",
        dense ? "px-1 py-0.5 text-[10px] min-h-[22px]" : "px-1.5 py-1 text-[11px] min-h-[28px]",
        it.completed && "opacity-60 line-through"
      )}
      style={accent}
      title={[it.content, it.responsible_name, "All day"].filter(Boolean).join(" · ")}
    >
      <span className="font-medium">{it.content}</span>
    </button>
  );
}

function DayColumn({
  date,
  todayKey,
  dayItems,
  allItems,
  unscheduledCount,
  onSelectDay,
  onOpenItem,
  compact,
  people,
  personFilter,
  dense,
}) {
  const key = toDayKey(date);
  const isToday = key === todayKey;
  const timed = timedForDay(dayItems).filter((it) => matchesPersonFilter(it, personFilter));
  const allDay = allDayForDay(dayItems).filter((it) => matchesPersonFilter(it, personFilter));
  const visible = timed.slice(0, MAX_VISIBLE_TIMED);
  const overflow = timed.length - visible.length;
  const visibleAllDay = allDay.slice(0, dense ? 2 : 4);
  const allDayOverflow = allDay.length - visibleAllDay.length;

  return (
    <section
      className={cn(
        "flex flex-col min-w-0",
        compact ? "rounded-xl border border-border bg-card p-3" : "min-h-0"
      )}
    >
      <button
        type="button"
        onClick={() => onSelectDay?.(date)}
        className="mb-2 flex items-baseline gap-2 text-left w-full min-h-[40px]"
      >
        <span
          className={cn(
            "font-heading text-sm font-semibold",
            isToday && "text-primary"
          )}
        >
          {date.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
        {isToday && (
          <span className="text-[11px] font-medium text-primary">Today</span>
        )}
        {unscheduledCount > allDay.length && (
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {unscheduledCount - allDay.length} unscheduled
          </span>
        )}
      </button>

      {allDay.length > 0 && (
        <div className={cn("mb-2 space-y-0.5 rounded-[6px] bg-muted/40 p-1", dense && "p-0.5")}>
          <p className="px-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            All day
          </p>
          {visibleAllDay.map((it) => (
            <AllDayChip
              key={it.id}
              it={it}
              people={people}
              onOpen={onOpenItem}
              dense={dense}
            />
          ))}
          {allDayOverflow > 0 && (
            <button
              type="button"
              onClick={() => onSelectDay?.(date)}
              className="w-full text-left text-[10px] font-medium text-primary hover:underline px-1 py-0.5"
            >
              +{allDayOverflow} more
            </button>
          )}
        </div>
      )}

      {timed.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-0.5">
          {allDay.length > 0 ? "Nothing timed" : "Nothing scheduled"}
        </p>
      ) : (
        <div className={cn("space-y-1", !compact && "flex-1 min-h-0 overflow-y-auto")}>
          {visible.map((it) => (
            <WeekItemRow
              key={it.id}
              it={it}
              allItems={allItems}
              onOpen={onOpenItem}
              people={people}
              dense={dense}
            />
          ))}
          {overflow > 0 && (
            <button
              type="button"
              onClick={() => onSelectDay?.(date)}
              className="w-full text-left text-[10px] font-medium text-primary hover:underline px-1 py-1 min-h-[28px]"
            >
              +{overflow} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Week calendar: stacked day sections on narrow screens; 7 columns on desktop.
 * Person-colored blocks; optional personFilter for family focus.
 */
export default function WeekView({
  days,
  byDay,
  allItems,
  todayKey,
  isMobile,
  onSelectDay,
  onOpenItem,
  people = [],
  personFilter = "all",
}) {
  const dense = !isMobile;

  if (isMobile) {
    return (
      <div className="space-y-4">
        {days.map((date) => {
          const key = toDayKey(date);
          return (
            <DayColumn
              key={key}
              date={date}
              todayKey={todayKey}
              dayItems={byDay[key] || []}
              allItems={allItems}
              unscheduledCount={unscheduledDueCount(allItems, key)}
              onSelectDay={onSelectDay}
              onOpenItem={onOpenItem}
              people={people}
              personFilter={personFilter}
              compact
              dense={false}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 overflow-x-auto">
      <div className="grid grid-cols-7 gap-2 min-w-[720px] divide-x divide-border/60">
        {days.map((date) => {
          const key = toDayKey(date);
          return (
            <div key={key} className="pl-2 first:pl-0 min-w-0">
              <DayColumn
                date={date}
                todayKey={todayKey}
                dayItems={byDay[key] || []}
                allItems={allItems}
                unscheduledCount={unscheduledDueCount(allItems, key)}
                onSelectDay={onSelectDay}
                onOpenItem={onOpenItem}
                people={people}
                personFilter={personFilter}
                compact={false}
                dense={dense}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
