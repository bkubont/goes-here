import React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ITEM_TYPE_MAP, formatTime, toDayKey } from "@/lib/itemTypes";
import { formatDuration, DEFAULT_BLOCK_MINUTES } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";
import { personAccentStyle, resolvePersonColor } from "@/lib/personColor";
import {
  SNAP_MINUTES,
  nextFreeSlot,
  nudgeTimeString,
  overlappingItemIds,
  snapDurationMinutes,
} from "@/lib/calendarConflicts";
import { useIsMobile } from "@/hooks/use-mobile";

export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;
export { SNAP_MINUTES };
export const HOUR_HEIGHT = 64; // px per hour

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);
const DAY_START_MIN = DAY_START_HOUR * 60;
const DAY_END_MIN = DAY_END_HOUR * 60;

function pad(n) {
  return String(n).padStart(2, "0");
}

export function minutesFromMidnight(timeStr) {
  if (!timeStr) return DAY_START_MIN;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function snapMinutes(totalMins) {
  const snapped = Math.round(totalMins / SNAP_MINUTES) * SNAP_MINUTES;
  const max = DAY_END_MIN - SNAP_MINUTES;
  return Math.max(DAY_START_MIN, Math.min(max, snapped));
}

export function formatHHMM(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${pad(h)}:${pad(m)}`;
}

function yToMinutes(clientY, gridRect) {
  const y = clientY - gridRect.top;
  const minsFromStart = (y / HOUR_HEIGHT) * 60;
  return snapMinutes(DAY_START_HOUR * 60 + minsFromStart);
}

function nowMinutes() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

/**
 * Day hour grid with drag-to-schedule, move, and resize.
 * Pool items and inbox/to_schedule live in UnscheduledPool (sibling).
 */
export default function DayGrid({
  day,
  items,
  allItems,
  onOpenItem,
  onSchedule,
  onMove,
  onResize,
  poolItems = [],
  selectedPoolId,
  onSelectPoolItem,
  draggingPoolId = null,
  onDraggingPoolChange,
  people = [],
}) {
  const isMobile = useIsMobile();
  const scrollRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const [ghost, setGhost] = React.useState(null);
  const [selectedBlockId, setSelectedBlockId] = React.useState(null);
  const [nowMin, setNowMin] = React.useState(() => nowMinutes());
  const didScrollRef = React.useRef(false);

  const dayKey = toDayKey(day);
  const todayKey = toDayKey(new Date());
  const isToday = dayKey === todayKey;
  const scheduled = (items || []).filter((it) => toDayKey(it.date) === dayKey && it.time);

  const conflictIds = React.useMemo(
    () => overlappingItemIds(scheduled, (it) => resolveBlockMinutes(it, allItems)),
    [scheduled, allItems]
  );

  const conflictList = React.useMemo(
    () => scheduled.filter((it) => conflictIds.has(it.id)),
    [scheduled, conflictIds]
  );

  const activePoolItem = React.useMemo(() => {
    const id = draggingPoolId || (selectedPoolId && selectedPoolId !== "__pick__" ? selectedPoolId : null);
    if (!id) return null;
    return poolItems.find((p) => p.id === id) || null;
  }, [draggingPoolId, selectedPoolId, poolItems]);

  React.useEffect(() => {
    if (!isToday) return undefined;
    const tick = () => setNowMin(nowMinutes());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [isToday]);

  // Scroll Day open to "now" (today) or the first timed block.
  React.useEffect(() => {
    didScrollRef.current = false;
  }, [dayKey]);

  React.useEffect(() => {
    if (didScrollRef.current || !scrollRef.current) return;
    const scroller = scrollRef.current;
    let targetMin;
    if (isToday && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN) {
      targetMin = nowMin;
    } else if (scheduled.length) {
      targetMin = Math.min(...scheduled.map((it) => minutesFromMidnight(it.time)));
    } else {
      // Wait for timed items to arrive before settling on day start.
      return;
    }
    const top = ((targetMin - DAY_START_MIN) / 60) * HOUR_HEIGHT;
    const padY = HOUR_HEIGHT * 0.75;
    scroller.scrollTop = Math.max(0, top - padY);
    didScrollRef.current = true;
  }, [dayKey, isToday, nowMin, scheduled.length]); // eslint-disable-line react-hooks/exhaustive-deps -- scroll once per day open

  function blockStyle(it) {
    const start = minutesFromMidnight(it.time);
    const dur = resolveBlockMinutes(it, allItems);
    const top = ((start - DAY_START_MIN) / 60) * HOUR_HEIGHT;
    const height = Math.max((dur / 60) * HOUR_HEIGHT, 20);
    return { top, height, duration: dur };
  }

  function previewPoolGhost(mins) {
    const dur = activePoolItem
      ? resolveBlockMinutes(activePoolItem, allItems)
      : DEFAULT_BLOCK_MINUTES;
    const preview = {
      id: "__ghost__pool",
      time: formatHHMM(mins),
      duration_minutes: dur,
      duration_source: "manual",
    };
    const conflict = overlappingItemIds(
      [...scheduled, preview],
      (row) => (row.id === preview.id ? dur : resolveBlockMinutes(row, allItems))
    ).has(preview.id);
    setGhost({
      top: ((mins - DAY_START_MIN) / 60) * HOUR_HEIGHT,
      height: Math.max((dur / 60) * HOUR_HEIGHT, 20),
      label: formatHHMM(mins),
      content: activePoolItem?.content || "Drop to schedule",
      conflict,
      mode: "pool",
    });
  }

  function startMove(e, it) {
    if (isMobile) return;
    if (e.button != null && e.button !== 0) return;
    // Resize handle owns its own pointerdown.
    if (e.target?.dataset?.resizeHandle) return;
    if (e.target?.dataset?.nudgeBtn) return;
    e.stopPropagation();
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startMins = minutesFromMidnight(it.time);
    const offsetY = e.clientY - rect.top - ((startMins - DAY_START_MIN) / 60) * HOUR_HEIGHT;
    const originY = e.clientY;
    let moved = false;
    dragRef.current = { mode: "move", item: it, offsetY };
    setSelectedBlockId(it.id);
    const onMovePtr = (ev) => {
      if (!moved && Math.abs(ev.clientY - originY) < 6) return;
      moved = true;
      const r = gridRef.current?.getBoundingClientRect();
      if (!r || !dragRef.current) return;
      const mins = snapMinutes(DAY_START_MIN + ((ev.clientY - r.top - dragRef.current.offsetY) / HOUR_HEIGHT) * 60);
      const dur = resolveBlockMinutes(it, allItems);
      const preview = {
        ...it,
        id: `__ghost__${it.id}`,
        time: formatHHMM(mins),
      };
      const others = scheduled.filter((s) => s.id !== it.id);
      const conflict = overlappingItemIds(
        [...others, preview],
        (row) => resolveBlockMinutes(row.id === preview.id ? it : row, allItems)
      ).has(preview.id);
      setGhost({
        top: ((mins - DAY_START_MIN) / 60) * HOUR_HEIGHT,
        height: Math.max((dur / 60) * HOUR_HEIGHT, 20),
        label: formatHHMM(mins),
        content: it.content,
        conflict,
        mode: "move",
      });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
      const r = gridRef.current?.getBoundingClientRect();
      setGhost(null);
      if (moved && r && dragRef.current) {
        const mins = snapMinutes(DAY_START_MIN + ((ev.clientY - r.top - dragRef.current.offsetY) / HOUR_HEIGHT) * 60);
        onMove?.(it, formatHHMM(mins), dayKey);
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
  }

  function startResize(e, it) {
    if (isMobile) return;
    e.preventDefault();
    e.stopPropagation();
    const startMins = minutesFromMidnight(it.time);
    dragRef.current = { mode: "resize", item: it, startMins };
    setSelectedBlockId(it.id);
    const onMovePtr = (ev) => {
      const r = gridRef.current?.getBoundingClientRect();
      if (!r || !dragRef.current) return;
      const endMins = yToMinutes(ev.clientY, r);
      const dur = snapDurationMinutes(Math.max(SNAP_MINUTES, endMins - startMins));
      const preview = { ...it, id: `__ghost__${it.id}`, duration_minutes: dur, duration_source: "manual" };
      const others = scheduled.filter((s) => s.id !== it.id);
      const conflict = overlappingItemIds(
        [...others, { ...preview, time: it.time }],
        (row) => (row.id === preview.id ? dur : resolveBlockMinutes(row, allItems))
      ).has(preview.id);
      setGhost({
        top: ((startMins - DAY_START_MIN) / 60) * HOUR_HEIGHT,
        height: Math.max((dur / 60) * HOUR_HEIGHT, 20),
        label: formatDuration(dur),
        content: it.content,
        conflict,
        mode: "resize",
      });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
      const r = gridRef.current?.getBoundingClientRect();
      setGhost(null);
      if (r && dragRef.current) {
        const endMins = yToMinutes(ev.clientY, r);
        const dur = snapDurationMinutes(Math.max(SNAP_MINUTES, endMins - startMins));
        onResize?.(it, dur);
      }
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
  }

  function nudgeBlock(it, deltaMinutes) {
    if (!it?.time) return;
    const dur = resolveBlockMinutes(it, allItems);
    const next = nudgeTimeString(it.time, deltaMinutes, {
      dayStartMin: DAY_START_MIN,
      dayEndMin: DAY_END_MIN,
      durationMinutes: dur,
    });
    if (next !== it.time) onMove?.(it, next, dayKey);
  }

  function onGridClick(e) {
    if (e.target !== e.currentTarget && !e.target.dataset?.hourSlot) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mins = yToMinutes(e.clientY, rect);
    const time = formatHHMM(mins);
    if (selectedPoolId && selectedPoolId !== "__pick__") {
      const poolItem = poolItems.find((p) => p.id === selectedPoolId);
      if (poolItem) {
        onSchedule?.(poolItem, time, dayKey);
        onSelectPoolItem?.(null);
        return;
      }
    }
    if (isMobile && poolItems.length) {
      onSelectPoolItem?.("__pick__");
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mins = yToMinutes(e.clientY, rect);
    previewPoolGhost(mins);
  }

  function onDragLeave(e) {
    if (!gridRef.current?.contains(e.relatedTarget)) setGhost(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setGhost(null);
    const id = e.dataTransfer.getData("text/place-item-id");
    onDraggingPoolChange?.(null);
    if (!id) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mins = yToMinutes(e.clientY, rect);
    const poolItem = poolItems.find((p) => p.id === id) || items.find((p) => p.id === id);
    if (poolItem) onSchedule?.(poolItem, formatHHMM(mins), dayKey);
    onSelectPoolItem?.(null);
  }

  function onBlockKeyDown(e, it) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      nudgeBlock(it, -SNAP_MINUTES);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      nudgeBlock(it, SNAP_MINUTES);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenItem?.(it);
    }
  }

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;
  const conflictCount = conflictIds.size;
  const showNowLine = isToday && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN;
  const nowTop = ((nowMin - DAY_START_MIN) / 60) * HOUR_HEIGHT;
  const poolReady = selectedPoolId && selectedPoolId !== "__pick__";

  return (
    <div ref={scrollRef} className="relative overflow-auto rounded-2xl border border-border bg-card max-h-[70vh]">
      {poolReady && (
        <p className="sticky top-0 z-20 border-b border-border bg-brand/10 px-3 py-2 text-xs text-brand">
          {isMobile
            ? "Tap a time slot to schedule the selected item"
            : "Click a time slot (or drag) to schedule the selected item"}
        </p>
      )}
      {conflictCount > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b border-attention/40 bg-attention/15 px-3 py-2 text-xs text-attention-foreground">
          <span className="font-medium">
            {conflictCount} block{conflictCount === 1 ? "" : "s"} overlap
          </span>
          <span className="text-attention-foreground/80">— nudge or open to fix</span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="rounded-md border border-attention/50 bg-card/80 px-2 py-0.5 text-[11px] font-medium hover:bg-card"
              onClick={() => conflictList[0] && nudgeBlock(conflictList[0], -SNAP_MINUTES)}
            >
              −15m
            </button>
            <button
              type="button"
              className="rounded-md border border-attention/50 bg-card/80 px-2 py-0.5 text-[11px] font-medium hover:bg-card"
              onClick={() => conflictList[0] && nudgeBlock(conflictList[0], SNAP_MINUTES)}
            >
              +15m
            </button>
            <button
              type="button"
              className="rounded-md border border-attention/50 bg-attention/25 px-2 py-0.5 text-[11px] font-semibold hover:bg-attention/35"
              onClick={() => conflictList[0] && onOpenItem?.(conflictList[0])}
            >
              Open
            </button>
          </div>
        </div>
      )}
      <div
        ref={gridRef}
        className="relative grid"
        style={{ gridTemplateColumns: "52px 1fr", height: gridHeight }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={onGridClick}
      >
        <div className="relative border-r border-border">
          {HOURS.map((h) => (
            <div
              key={h}
              className="absolute right-2 text-[10px] text-muted-foreground -translate-y-1/2"
              style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT }}
            >
              {formatTime(`${pad(h)}:00`)}
            </div>
          ))}
        </div>
        <div className="relative" data-hour-slot="1">
          {HOURS.map((h) => (
            <React.Fragment key={h}>
              <div
                data-hour-slot="1"
                className={cn(
                  "absolute left-0 right-0 border-t border-border/60 transition-colors",
                  poolReady && "hover:bg-brand/5"
                )}
                style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              />
              {[1, 2, 3].map((q) => (
                <div
                  key={`${h}-${q}`}
                  data-hour-slot="1"
                  className="absolute left-0 right-0 border-t border-border/25 pointer-events-none"
                  style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT + (q * HOUR_HEIGHT) / 4 }}
                />
              ))}
            </React.Fragment>
          ))}

          {/* Drop-target hour wash under pool ghost */}
          {ghost?.mode === "pool" && (
            <div
              className={cn(
                "pointer-events-none absolute left-0 right-0 z-[5]",
                ghost.conflict ? "bg-attention/10" : "bg-brand/10"
              )}
              style={{
                top: Math.floor(ghost.top / HOUR_HEIGHT) * HOUR_HEIGHT,
                height: HOUR_HEIGHT,
              }}
            />
          )}

          {showNowLine && (
            <div
              className="pointer-events-none absolute left-0 right-0 z-[25]"
              style={{ top: nowTop }}
              aria-hidden
            >
              <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-destructive" />
              <div className="h-0.5 w-full bg-destructive shadow-sm" />
            </div>
          )}

          {scheduled.map((it) => {
            const { top, height, duration } = blockStyle(it);
            const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
            const accent = personAccentStyle(resolvePersonColor(it.responsible_name, people));
            const conflict = conflictIds.has(it.id);
            const selected = selectedBlockId === it.id;
            return (
              <div
                key={it.id}
                role="button"
                tabIndex={0}
                className={cn(
                  "absolute left-1 right-2 z-10 overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm cursor-grab active:cursor-grabbing text-foreground outline-none",
                  !accent.borderLeftColor && TI.tone,
                  conflict && "ring-2 ring-attention border-attention z-20",
                  selected && !conflict && "ring-2 ring-brand/60 z-20",
                  it.completed && "opacity-50"
                )}
                style={{ top, height, ...accent }}
                onPointerDown={(e) => startMove(e, it)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedBlockId(it.id);
                  onOpenItem?.(it);
                }}
                onKeyDown={(e) => onBlockKeyDown(e, it)}
                onFocus={() => setSelectedBlockId(it.id)}
                title={conflict ? "Overlaps another block — use ±15m or arrow keys" : "Drag to move · arrows nudge 15m"}
              >
                <div className="flex items-center gap-1 text-[10px] font-medium opacity-80">
                  <Clock className="h-3 w-3" />
                  {formatTime(it.time)} · {formatDuration(duration)}
                  {conflict && (
                    <span className="ml-auto shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide bg-attention/25 text-attention-foreground">
                      Overlap
                    </span>
                  )}
                </div>
                <div className="text-xs font-semibold truncate leading-tight">{it.content}</div>
                {it.responsible_name && (
                  <div className="text-[10px] opacity-70 truncate">{it.responsible_name}</div>
                )}
                {(selected || conflict) && !isMobile && height >= 36 && (
                  <div className="absolute right-1 top-1 flex gap-0.5">
                    <button
                      type="button"
                      data-nudge-btn="1"
                      className="rounded bg-background/90 px-1 text-[10px] font-semibold border border-border/80 hover:bg-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        nudgeBlock(it, -SNAP_MINUTES);
                      }}
                      aria-label="Nudge earlier 15 minutes"
                    >
                      −15
                    </button>
                    <button
                      type="button"
                      data-nudge-btn="1"
                      className="rounded bg-background/90 px-1 text-[10px] font-semibold border border-border/80 hover:bg-accent"
                      onClick={(e) => {
                        e.stopPropagation();
                        nudgeBlock(it, SNAP_MINUTES);
                      }}
                      aria-label="Nudge later 15 minutes"
                    >
                      +15
                    </button>
                  </div>
                )}
                {!isMobile && (
                  <div
                    data-resize-handle="1"
                    className="absolute bottom-0 left-0 right-0 flex h-3 cursor-ns-resize items-end justify-center pb-0.5 group/resize"
                    onPointerDown={(e) => startResize(e, it)}
                    title="Drag to resize (15-min snap)"
                  >
                    <div className="h-1 w-8 rounded-full bg-foreground/25 group-hover/resize:bg-foreground/45" />
                  </div>
                )}
              </div>
            );
          })}
          {ghost && (
            <div
              className={cn(
                "pointer-events-none absolute left-1 right-2 z-30 rounded-lg border-2 border-dashed px-2 py-1",
                ghost.conflict
                  ? "border-attention bg-attention/20"
                  : "border-brand bg-brand/20"
              )}
              style={{ top: ghost.top, height: ghost.height }}
            >
              <div className={cn("text-[10px] font-medium", ghost.conflict ? "text-attention-foreground" : "text-brand")}>
                {ghost.label}
                {ghost.mode === "pool" ? " · drop" : ""}
                {ghost.conflict ? " · overlap" : ""}
              </div>
              <div className="text-xs font-semibold truncate">{ghost.content}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function UnscheduledPool({
  items,
  allItems,
  scheduled = [],
  selectedId,
  onSelect,
  onOpenItem,
  onScheduleNextFree,
  onDraggingChange,
  isMobile,
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <h3 className="font-display text-sm font-semibold mb-1">Unscheduled</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        {isMobile
          ? "Select an item, then tap a time — or use Next free."
          : "Drag onto the day, select then click a slot, or Next free (15-min snap)."}
      </p>
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto scrollbar-thin">
        {(items || []).length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4 px-1 leading-relaxed">
            Nothing to schedule. Inbox items, to-schedule, undated todos, and things due or dated this day without a time show up here.
          </p>
        )}
        {(items || []).map((it) => {
          const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
          const Icon = TI.icon;
          const dur = resolveBlockMinutes(it, allItems);
          const selected = selectedId === it.id;
          const freeAt = nextFreeSlot(
            scheduled,
            (row) => resolveBlockMinutes(row, allItems),
            dur
          );
          return (
            <div
              key={it.id}
              draggable={!isMobile}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/place-item-id", it.id);
                e.dataTransfer.effectAllowed = "move";
                onSelect?.(it.id);
                onDraggingChange?.(it.id);
              }}
              onDragEnd={() => onDraggingChange?.(null)}
              className={cn(
                "w-full text-left rounded-lg border px-2.5 py-2 transition",
                !isMobile && "cursor-grab active:cursor-grabbing",
                selected ? "border-brand bg-brand/10 ring-1 ring-brand/30" : "border-border hover:bg-accent/40"
              )}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left"
                onClick={() => onSelect?.(selected ? null : it.id)}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{it.content}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {formatDuration(dur) || `${DEFAULT_BLOCK_MINUTES}m`}
                </span>
              </button>
              {(it.responsible_name || it.person_name || it.type === "to_schedule" || it.inbox) && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                  {[
                    it.responsible_name || it.person_name,
                    it.type === "to_schedule" ? "to schedule" : null,
                    it.inbox ? "inbox" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  disabled={!freeAt}
                  className={cn(
                    "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                    freeAt
                      ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/15"
                      : "border-border text-muted-foreground opacity-60 cursor-not-allowed"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (freeAt) onScheduleNextFree?.(it, freeAt);
                  }}
                  title={freeAt ? `Schedule at ${formatTime(freeAt)}` : "No free slot today"}
                >
                  {freeAt ? `Next free · ${formatTime(freeAt)}` : "Day full"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent/50"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenItem?.(it);
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
