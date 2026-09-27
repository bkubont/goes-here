import React from "react";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const EXPAND_KEY = "goeshere.lists.expand";

function loadExpandMap() {
  try {
    const raw = localStorage.getItem(EXPAND_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveExpand(key, open) {
  try {
    const map = loadExpandMap();
    map[key] = open;
    localStorage.setItem(EXPAND_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function usePersistedOpen(storageKey, defaultOpen = false) {
  const [open, setOpen] = React.useState(() => {
    const map = loadExpandMap();
    if (storageKey in map) return !!map[storageKey];
    return defaultOpen;
  });

  const onOpenChange = React.useCallback(
    (next) => {
      setOpen(next);
      saveExpand(storageKey, next);
    },
    [storageKey]
  );

  return [open, onOpenChange];
}

/**
 * Collapsible list/type or aisle section. Expand state persists in localStorage
 * under `goeshere.lists.expand` keyed by `storageKey`.
 */
export default function CollapsibleListSection({
  storageKey,
  label,
  count,
  icon,
  defaultOpen = false,
  children,
  className,
  headerClassName,
}) {
  const [open, onOpenChange] = usePersistedOpen(storageKey, defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
      <CollapsibleTrigger
        type="button"
        className={cn(
          "flex w-full min-h-[44px] items-center gap-2 rounded-[6px] px-1 py-1.5 text-left transition hover:bg-accent/60",
          headerClassName
        )}
        aria-expanded={open}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90"
          )}
          aria-hidden
        />
        {icon}
        <span className="flex-1 min-w-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {typeof count === "number" && (
          <span className="text-xs font-normal normal-case tracking-normal text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-1.5 pb-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
