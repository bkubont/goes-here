import React from "react";
import { CheckCheck, X } from "lucide-react";
import { entities } from "@/api/entities";
import { completionPatch } from "@/lib/estimateDuration";
import { completionBoardPatch, sortByPosition } from "@/lib/boards";
import { invalidateAll, patchItemsCaches } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

/**
 * Toolbar for list multi-select: toggle select mode, complete selected, clear.
 */
export default function BulkCompleteBar({
  selectMode,
  selectedIds,
  items,
  onSelectModeChange,
  onSelectedIdsChange,
}) {
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const count = selected.size;
  const [busy, setBusy] = React.useState(false);

  function exitSelect() {
    onSelectModeChange(false);
    onSelectedIdsChange(new Set());
  }

  async function completeSelected() {
    const targets = (items || []).filter(
      (it) => selected.has(it.id) && !it.completed && !it._recurringOccurrence
    );
    if (!targets.length) {
      toast({ title: "Nothing to complete", description: "Select incomplete items first." });
      return;
    }
    setBusy(true);
    const columnsByBoard = new Map();
    async function colsFor(boardId) {
      if (!boardId) return [];
      if (!columnsByBoard.has(boardId)) {
        const rows = await entities.BoardColumn.filter({ board_id: boardId }, "position", 100);
        columnsByBoard.set(boardId, sortByPosition(rows));
      }
      return columnsByBoard.get(boardId);
    }

    try {
      const snapshots = [];
      for (const it of targets) {
        const cols = await colsFor(it.board_id);
        const patch = cols.length
          ? completionBoardPatch(it, true, cols)
          : completionPatch(it, true);
        if (it.type === "grocery" || it.type === "shopping") patch.purchased = true;
        if (it.type === "bill") patch.payment_status = "paid";
        snapshots.push({
          id: it.id,
          previous: {
            completed: !!it.completed,
            completed_date: it.completed_date ?? null,
            board_status: it.board_status || "backlog",
            board_column_id: it.board_column_id ?? null,
            actual_duration_minutes: it.actual_duration_minutes ?? null,
            purchased: it.purchased,
            payment_status: it.payment_status,
          },
          patch,
        });
      }

      const results = await Promise.all(
        snapshots.map(({ id, patch }) => entities.Item.update(id, patch))
      );
      const byId = Object.fromEntries(results.map((r) => [r.id, r]));
      patchItemsCaches((list) =>
        list.map((i) => (byId[i.id] ? { ...i, ...byId[i.id] } : i))
      );
      await invalidateAll();
      exitSelect();
      toast({
        title: `Completed ${snapshots.length} item${snapshots.length !== 1 ? "s" : ""}`,
        duration: 10000,
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              try {
                await Promise.all(
                  snapshots.map(({ id, previous }) => entities.Item.update(id, previous))
                );
                await invalidateAll();
                toast({ title: "Restored", description: "Batch undone." });
              } catch (err) {
                toast({ title: "Couldn't undo", description: err.message, variant: "destructive" });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
    } catch (e) {
      toast({ title: "Bulk complete failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (!selectMode) {
    return (
      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[40px]"
          onClick={() => onSelectModeChange(true)}
        >
          Select
        </Button>
      </div>
    );
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-sm text-muted-foreground flex-1 min-w-[8rem]">
        {count ? `${count} selected` : "Tap items to select"}
      </p>
      <Button
        type="button"
        size="sm"
        className="min-h-[40px]"
        disabled={busy || count === 0}
        onClick={completeSelected}
      >
        <CheckCheck className="h-4 w-4 mr-1" />
        Complete selected
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-[40px]"
        disabled={busy}
        onClick={exitSelect}
      >
        <X className="h-4 w-4 mr-1" />
        Cancel
      </Button>
    </div>
  );
}

export function useListSelection(resetKey) {
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState(() => new Set());

  React.useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [resetKey]);

  function toggleSelect(item) {
    if (!item?.id || item._recurringOccurrence) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  return {
    selectMode,
    selectedIds,
    setSelectMode,
    setSelectedIds,
    toggleSelect,
    listProps: {
      selectMode,
      selectedIds,
      onToggleSelect: toggleSelect,
    },
  };
}
