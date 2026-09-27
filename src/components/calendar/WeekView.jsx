import React from "react";
import { ITEM_TYPE_MAP, formatTime, toDayKey } from "@/lib/itemTypes";
import { formatDuration } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";
import { cn } from "@/lib/utils";

/** Sunday-start by default; callers pass weekStartsOn from Settings preference. */
export const WEEK_STARTS_ON = 0;

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

function WeekItemRow({ it, allItems, onOpen }) {
  const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
  const dur = resolveBlockMinutes(it, allItems);
  return (
    <button
      type="button"
      onClick={() => onOpen?.(it)}
      className={cn(
        "w-full text-left rounded-[6px] border border-border px-2 py-1.5 hover:bg-accent/40 transition min-h-[40px]",
        it.completed && "opacity-60"
      )}
    >
      <div className="flex items-center gap-1.5">
        {it.time && (
          <span className="text-[10px] font-semibold text-primary shrink-0 tabular-nums">
            {formatTime(it.time)}
          </span>
        )}
        <span className={cn("text-xs font-medium truncate", it.completed && "line-through")}>
          {it.content}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
        {[formatDuration(dur), it.responsible_name || it.person_name, TI.label]
          .filter(Boolean)
          .join(" · ")}
      </p>
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
}) {
  const key = toDayKey(date);
  const isToday = key === todayKey;
  const timed = timedForDay(dayItems);

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
            weekday: compact ? "short" : "short",
            month: "short",
            day: "numeric",
          })}
        </span>
        {isToday && (
          <span className="text-[11px] font-medium text-primary">Today</span>
        )}
        {unscheduledCount > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
            {unscheduledCount} unscheduled
          </span>
        )}
      </button>

      {timed.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-0.5">Nothing timed</p>
      ) : (
        <div className={cn("space-y-1.5", !compact && "flex-1 min-h-0 overflow-y-auto")}>
          {timed.map((it) => (
            <WeekItemRow key={it.id} it={it} allItems={allItems} onOpen={onOpenItem} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Week calendar: stacked day sections on narrow screens; 7 columns on desktop.
 */
export default function WeekView({
  days,
  byDay,
  allItems,
  todayKey,
  isMobile,
  onSelectDay,
  onOpenItem,
}) {
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
              compact
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
                compact={false}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
