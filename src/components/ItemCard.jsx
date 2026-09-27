import React from "react";
import { entities } from "@/api/entities";
import { ITEM_TYPE_MAP, formatDate, formatTime, isOverdue, STATUS_LABELS } from "@/lib/itemTypes";
import { formatDuration } from "@/lib/durationDefaults";
import { completionPatch } from "@/lib/estimateDuration";
import { invalidateAll, patchItemsCaches } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Check, CalendarDays, UserCheck, FolderKanban, AlertCircle, Repeat, Clock } from "lucide-react";

export default function ItemCard({ item, onOpen }) {
  const TI = ITEM_TYPE_MAP[item.type] || ITEM_TYPE_MAP.todo;
  const overdue = !item.completed && (isOverdue(item.date) || isOverdue(item.due_date));
  const durationLabel = formatDuration(item.duration_minutes);
  const timeLine = item.date
    ? `${formatDate(item.date)}${item.time ? ` · ${formatTime(item.time)}` : ""}`
    : item.due_date
      ? `Due ${formatDate(item.due_date)}`
      : null;

  async function toggle(e) {
    e.stopPropagation();
    if (item._recurringOccurrence) return;
    const patch = completionPatch(item, !item.completed);
    try {
      const row = await entities.Item.update(item.id, patch);
      patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
      await invalidateAll();
    } catch {
      /* bubble */
    }
  }

  function openDetails(e) {
    e?.stopPropagation?.();
    onOpen?.(item);
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:shadow-sm",
        item.completed && "opacity-55"
      )}
    >
      {item._recurringOccurrence ? (
        <span title="Repeats" className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-dashed border-border text-muted-foreground">
          <Repeat className="h-4 w-4" />
        </span>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
          className={cn(
            "mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-full border transition",
            item.completed
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border hover:border-primary"
          )}
        >
          {item.completed && <Check className="h-4 w-4" />}
        </button>
      )}

      <button
        type="button"
        onClick={openDetails}
        className="min-w-0 flex-1 text-left"
      >
        <p className={cn("text-sm font-medium leading-snug", item.completed && "line-through")}>
          {item.content}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
          {timeLine && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
              <CalendarDays className="h-3.5 w-3.5" />
              {timeLine}
              {overdue && (
                <span className="ml-1 rounded-[4px] bg-attention/20 px-1.5 py-0.5 text-[10px] font-semibold text-attention-foreground">
                  {STATUS_LABELS.overdue}
                </span>
              )}
            </span>
          )}
          {item.responsible_name && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground/80">
              <UserCheck className="h-3.5 w-3.5 text-primary" /> {item.responsible_name}
            </span>
          )}
          {durationLabel && (
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {durationLabel}</span>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {(item.type || item.project_name) && (
            <>
              <span className={cn("inline-flex items-center gap-1 rounded-[4px] border px-1.5 py-0.5", TI.tone)}>
                {TI.label}
              </span>
              {item.project_name && (
                <span className="inline-flex items-center gap-1 rounded-[4px] border border-border px-1.5 py-0.5">
                  <FolderKanban className="h-3 w-3" /> {item.project_name}
                </span>
              )}
            </>
          )}
          {item.recurring && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Repeat className="h-3 w-3" /> {item.recurring}
            </span>
          )}
          {item.inbox && (
            <span className="inline-flex items-center gap-1 rounded-[4px] bg-attention/15 px-1.5 py-0.5 font-medium text-attention-foreground">
              <AlertCircle className="h-3 w-3" /> {STATUS_LABELS.needs_review}
            </span>
          )}
          {item.type === "bill" && item.amount != null && (
            <span className="font-medium">${Number(item.amount).toFixed(2)}</span>
          )}
          {item.type === "bill" && item.payment_status && (
            <span className="rounded-[4px] border border-border px-1.5 py-0.5">
              {STATUS_LABELS[item.payment_status] || item.payment_status}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}
