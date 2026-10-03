import React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ITEM_TYPE_MAP, formatTime, toDayKey } from "@/lib/itemTypes";
import { formatDuration, DEFAULT_BLOCK_MINUTES } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";
import { personAccentStyle, resolvePersonColor } from "@/lib/personColor";
import { overlappingItemIds, snapDurationMinutes } from "@/lib/calendarConflicts";
import { useIsMobile } from "@/hooks/use-mobile";

export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 22;
export const SNAP_MINUTES = 15;
export const HOUR_HEIGHT = 64; // px per hour

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i);

function pad(n) {
  return String(n).padStart(2, "0");
}

export function minutesFromMidnight(timeStr) {
  if (!timeStr) return DAY_START_HOUR * 60;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function snapMinutes(totalMins) {
  const snapped = Math.round(totalMins / SNAP_MINUTES) * SNAP_MINUTES;
  const min = DAY_START_HOUR * 60;
  const max = DAY_END_HOUR * 60 - SNAP_MINUTES;
  return Math.max(min, Math.min(max, snapped));
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
  people = [],
}) {
  const isMobile = useIsMobile();
  const gridRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const [ghost, setGhost] = React.useState(null);

  const dayKey = toDayKey(day);
  const scheduled = (items || []).filter((it) => toDayKey(it.date) === dayKey && it.time);

  const conflictIds = React.useMemo(
    () => overlappingItemIds(scheduled, (it) => resolveBlockMinutes(it, allItems)),
    [scheduled, allItems]
  );

  function blockStyle(it) {
    const start = minutesFromMidnight(it.time);
    const dur = resolveBlockMinutes(it, allItems);
    const top = ((start - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max((dur / 60) * HOUR_HEIGHT, 20);
    return { top, height, duration: dur };
  }

  function startMove(e, it) {
    if (isMobile) return;
    if (e.button != null && e.button !== 0) return;
    e.stopPropagation();
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startMins = minutesFromMidnight(it.time);
    const offsetY = e.clientY - rect.top - ((startMins - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const originY = e.clientY;
    let moved = false;
    dragRef.current = { mode: "move", item: it, offsetY };
    const onMovePtr = (ev) => {
      if (!moved && Math.abs(ev.clientY - originY) < 6) return;
      moved = true;
      const r = gridRef.current?.getBoundingClientRect();
      if (!r || !dragRef.current) return;
      const mins = snapMinutes(DAY_START_HOUR * 60 + ((ev.clientY - r.top - dragRef.current.offsetY) / HOUR_HEIGHT) * 60);
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
        top: ((mins - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT,
        height: Math.max((dur / 60) * HOUR_HEIGHT, 20),
        label: formatHHMM(mins),
        content: it.content,
        conflict,
      });
    };
    const onUp = (ev) => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
      const r = gridRef.current?.getBoundingClientRect();
      setGhost(null);
      if (moved && r && dragRef.current) {
        const mins = snapMinutes(DAY_START_HOUR * 60 + ((ev.clientY - r.top - dragRef.current.offsetY) / HOUR_HEIGHT) * 60);
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
        top: ((startMins - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT,
        height: Math.max((dur / 60) * HOUR_HEIGHT, 20),
        label: formatDuration(dur),
        content: it.content,
        conflict,
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

  function onGridClick(e) {
    if (e.target !== e.currentTarget && !e.target.dataset?.hourSlot) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mins = yToMinutes(e.clientY, rect);
    const time = formatHHMM(mins);
    if (selectedPoolId) {
      const poolItem = poolItems.find((p) => p.id === selectedPoolId);
      if (poolItem) {
        onSchedule?.(poolItem, time, dayKey);
        onSelectPoolItem?.(null);
        return;
      }
    }
    if (isMobile && poolItems.length) {
      // Tap-slot fallback: pick first selected or prompt via selection
      onSelectPoolItem?.("__pick__");
    }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mins = yToMinutes(e.clientY, rect);
    const id = e.dataTransfer.types?.includes?.("text/place-item-id")
      ? null
      : null;
    // Live ghost while dragging from pool (HTML5 DnD does not expose id until drop in some browsers).
    void id;
    setGhost({
      top: ((mins - DAY_START_HOUR * 60) / 60) * HOUR_HEIGHT,
      height: Math.max((DEFAULT_BLOCK_MINUTES / 60) * HOUR_HEIGHT, 20),
      label: formatHHMM(mins),
      content: "Drop to schedule",
      conflict: false,
    });
  }

  function onDragLeave(e) {
    if (!gridRef.current?.contains(e.relatedTarget)) setGhost(null);
  }

  function onDrop(e) {
    e.preventDefault();
    setGhost(null);
    const id = e.dataTransfer.getData("text/place-item-id");
    if (!id) return;
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mins = yToMinutes(e.clientY, rect);
    const poolItem = poolItems.find((p) => p.id === id) || items.find((p) => p.id === id);
    if (poolItem) onSchedule?.(poolItem, formatHHMM(mins), dayKey);
  }

  const gridHeight = (DAY_END_HOUR - DAY_START_HOUR) * HOUR_HEIGHT;
  const conflictCount = conflictIds.size;

  return (
    <div className="relative overflow-auto rounded-2xl border border-border bg-card max-h-[70vh]">
      {isMobile && selectedPoolId && selectedPoolId !== "__pick__" && (
        <p className="sticky top-0 z-20 border-b border-border bg-brand/10 px-3 py-2 text-xs text-brand">
          Tap a time slot to schedule the selected item
        </p>
      )}
      {conflictCount > 0 && (
        <p className="sticky top-0 z-20 border-b border-attention/40 bg-attention/10 px-3 py-2 text-xs text-attention-foreground">
          {conflictCount} block{conflictCount === 1 ? "" : "s"} overlap — adjust times or durations
        </p>
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
                className="absolute left-0 right-0 border-t border-border/60"
                style={{ top: (h - DAY_START_HOUR) * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              />
              {/* 15-min guide lines for denser snap feedback */}
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
          {scheduled.map((it) => {
            const { top, height, duration } = blockStyle(it);
            const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
            const accent = personAccentStyle(resolvePersonColor(it.responsible_name, people));
            const conflict = conflictIds.has(it.id);
            return (
              <div
                key={it.id}
                className={cn(
                  "absolute left-1 right-2 z-10 overflow-hidden rounded-lg border px-2 py-1 text-left shadow-sm cursor-grab active:cursor-grabbing text-foreground",
                  !accent.borderLeftColor && TI.tone,
                  conflict && "ring-2 ring-attention border-attention z-20",
                  it.completed && "opacity-50"
                )}
                style={{ top, height, ...accent }}
                onPointerDown={(e) => startMove(e, it)}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenItem?.(it);
                }}
                title={conflict ? "Overlaps another block" : undefined}
              >
                <div className="flex items-center gap-1 text-[10px] font-medium opacity-80">
                  <Clock className="h-3 w-3" />
                  {formatTime(it.time)} · {formatDuration(duration)}
                  {conflict && (
                    <span className="ml-auto shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wide bg-attention/20 text-attention-foreground">
                      Overlap
                    </span>
                  )}
                </div>
                <div className="text-xs font-semibold truncate leading-tight">{it.content}</div>
                {it.responsible_name && (
                  <div className="text-[10px] opacity-70 truncate">{it.responsible_name}</div>
                )}
                {!isMobile && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize"
                    onPointerDown={(e) => startResize(e, it)}
                  />
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
                {ghost.label}{ghost.conflict ? " · overlap" : ""}
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
  selectedId,
  onSelect,
  onOpenItem,
  isMobile,
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <h3 className="font-display text-sm font-semibold mb-1">Unscheduled</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        {isMobile
          ? "Select an item, then tap a time on the day grid."
          : "Drag onto the day grid to set a time (15-min snap)."}
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
          return (
            <div
              key={it.id}
              draggable={!isMobile}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/place-item-id", it.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              onClick={() => {
                if (isMobile) onSelect?.(selected ? null : it.id);
                else onOpenItem?.(it);
              }}
              className={cn(
                "w-full text-left rounded-lg border px-2.5 py-2 transition cursor-grab active:cursor-grabbing",
                selected ? "border-brand bg-brand/10" : "border-border hover:bg-accent/40"
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate flex-1">{it.content}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{formatDuration(dur) || `${DEFAULT_BLOCK_MINUTES}m`}</span>
              </div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
