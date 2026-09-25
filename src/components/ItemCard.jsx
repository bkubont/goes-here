import React from "react";
import { entities } from "@/api/entities";
import { ITEM_TYPE_MAP, formatDate, formatTime, isOverdue } from "@/lib/itemTypes";
import { invalidateAll } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Check, CalendarDays, User, FolderKanban, AlertCircle } from "lucide-react";

export default function ItemCard({ item, onOpen }) {
  const TI = ITEM_TYPE_MAP[item.type] || ITEM_TYPE_MAP.todo;
  const Icon = TI.icon;
  const overdue = !item.completed && (isOverdue(item.date) || isOverdue(item.due_date));

  async function toggle(e) {
    e.stopPropagation();
    try {
      await entities.Item.update(item.id, {
        completed: !item.completed,
        completed_date: !item.completed ? new Date().toISOString() : null,
      });
      invalidateAll();
    } catch (e2) { /* bubble */ }
  }

  return (
    <div
      onClick={() => onOpen?.(item)}
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition hover:shadow-sm cursor-pointer",
        item.completed && "opacity-55"
      )}
    >
      <button
        onClick={toggle}
        className={cn(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition",
          item.completed
            ? "bg-brand border-brand text-brand-foreground"
            : "border-border hover:border-brand"
        )}
      >
        {item.completed && <Check className="h-3 w-3" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className={cn("text-sm font-medium leading-snug truncate", item.completed && "line-through")}>
            {item.content}
          </p>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium", TI.tone)}>
            <Icon className="h-3 w-3" /> {TI.label}
          </span>
          {item.person_name && (
            <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> {item.person_name}</span>
          )}
          {item.date && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
              <CalendarDays className="h-3 w-3" /> {formatDate(item.date)}{item.time ? ` · ${formatTime(item.time)}` : ""}
            </span>
          )}
          {item.due_date && !item.date && (
            <span className={cn("inline-flex items-center gap-1", overdue && "text-destructive font-medium")}>
              due {formatDate(item.due_date)}
            </span>
          )}
          {item.project_name && (
            <span className="inline-flex items-center gap-1"><FolderKanban className="h-3 w-3" /> {item.project_name}</span>
          )}
          {item.recurring && <span className="text-violet-600">↻ {item.recurring}</span>}
          {item.inbox && <span className="inline-flex items-center gap-1 text-orange-600"><AlertCircle className="h-3 w-3" /> review</span>}
          {item.type === "bill" && item.amount != null && <span>${Number(item.amount).toFixed(2)}</span>}
        </div>
      </div>
    </div>
  );
}