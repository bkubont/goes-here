import React from "react";
import { Button } from "@/components/ui/button";
import { SNOOZE_PRESETS } from "@/lib/reminders";
import { cn } from "@/lib/utils";

/** Clear + Snooze 1h / later today / tomorrow for Due reminder rows. */
export default function ReminderActions({ onDismiss, onSnooze, className, compact }) {
  return (
    <div className={cn("flex shrink-0 flex-col items-end gap-1", className)}>
      <div className="flex flex-wrap justify-end gap-1">
        {SNOOZE_PRESETS.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            size="sm"
            className={cn("text-xs", compact ? "min-h-[36px] px-2" : "min-h-[40px]")}
            onClick={() => onSnooze?.(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        className={cn("text-xs", compact ? "min-h-[36px]" : "min-h-[44px]")}
        onClick={onDismiss}
      >
        Clear
      </Button>
    </div>
  );
}
