import React from "react";
import { Trash2, Loader2, Save, ChevronDown, Bell, Repeat, SkipForward, Split, CalendarPlus, Copy } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { entities } from "@/api/entities";
import {
  ITEM_TYPES, GROCERY_CATEGORIES, parseDay, toDayKey,
} from "@/lib/itemTypes";
import { completionPatch } from "@/lib/estimateDuration";
import { boardColumnPatch, columnForItem, sortByPosition } from "@/lib/boards";
import {
  invalidateAll, usePeople, useProjects, useBoards, useBoardColumns, patchItemsCaches,
} from "@/lib/queries";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  RECURRENCE_CHOICES,
  formatRecurrenceSummary,
  formatNextOccurrence,
  recurrencePresetValue,
  weeklyStringForDate,
  withSkippedDay,
  oneOffFromOccurrence,
} from "@/lib/recurring";
import { REMINDER_OPTIONS, formatReminderState } from "@/lib/reminders";
import { downloadItemIcs } from "@/lib/ics";
import ItemAttachments from "@/components/ItemAttachments";

function buildForm(item) {
  if (!item) return null;
  const d = parseDay(item._recurringOccurrence ? item._originalDate : item.date);
  const pad = (n) => String(n).padStart(2, "0");
  return {
    ...item,
    date: d ? toDayKey(d) : "",
    time: item.time || (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ""),
    duration_minutes: item.duration_minutes ?? "",
    board_status: item.board_status || (item.completed ? "done" : "backlog"),
    reminder_offset: item.reminder_offset || "",
    recurring_exceptions: item.recurring_exceptions || [],
  };
}

function completionLabel(type) {
  if (type === "grocery" || type === "shopping") return "Purchased";
  if (type === "bill") return "Paid";
  return "Completed";
}

function resolveRecurringWrite(form) {
  const raw = form.recurring || "";
  if (!raw) return "";
  // When user picks "weekly", store weekday-specific string from scheduled date.
  if (raw === "weekly" && form.date) {
    return weeklyStringForDate(form.date);
  }
  return raw;
}

export default function ItemDetailDrawer({ item, open, onOpenChange }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const { data: boards } = useBoards();
  const boardId = item?.board_id || (boards && boards.length ? sortByPosition(boards)[0]?.id : null);
  const { data: boardColumnsRaw } = useBoardColumns(open ? boardId : null);
  const boardColumns = React.useMemo(() => sortByPosition(boardColumnsRaw), [boardColumnsRaw]);
  const [form, setForm] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const peopleNames = (people || []).map((p) => p.name);
  const projectNames = (projects || []).map((p) => p.name);

  React.useEffect(() => {
    if (open && item) {
      setForm(buildForm(item));
      setMoreOpen(!!item.recurring || !!item.reminder_offset || !!item.notes);
    }
    if (!open) {
      const t = setTimeout(() => setForm(null), 200);
      return () => clearTimeout(t);
    }
  }, [item, open]);

  const handleOpenChange = React.useCallback((next) => {
    if (!next) onOpenChange?.(false);
    else onOpenChange?.(true);
  }, [onOpenChange]);

  if (!open || !item || !form) {
    return isMobile ? (
      <Sheet open={false} onOpenChange={handleOpenChange} />
    ) : (
      <Dialog open={false} onOpenChange={handleOpenChange} />
    );
  }

  const set = (patch) => setForm((f) => (f ? { ...f, ...patch } : f));
  const isDraft = !!item._draft;
  const recordId = isDraft ? null : (item._originalId || item.id);
  const isVirtual = !isDraft && !!item._recurringOccurrence;
  const recurringText = resolveRecurringWrite(form);
  const summary = form.recurring
    ? formatRecurrenceSummary(recurringText || form.recurring, form.date || item.date)
    : "";
  const nextLabel = form.recurring
    ? formatNextOccurrence({
      ...item,
      ...form,
      recurring: recurringText || form.recurring,
      date: form.date
        ? new Date(`${form.date}T${form.time || "09:00"}:00`).toISOString()
        : item.date,
    })
    : null;

  const preset = recurrencePresetValue(form.recurring || "");

  async function save({ series = true } = {}) {
    if (!form || !item) return;
    setSaving(true);
    try {
      if (isVirtual && !series) {
        const skip = withSkippedDay(item);
        await entities.Item.update(recordId, { recurring_exceptions: skip.recurring_exceptions });
        const oneOff = oneOffFromOccurrence(item, {
          content: form.content,
          type: form.type,
          person_name: form.person_name,
          responsible_name: form.responsible_name,
          project_name: form.project_name,
          due_date: form.due_date || null,
          priority: form.priority,
          category: form.category,
          notes: form.notes,
          reminder_offset: form.reminder_offset || null,
          board_status: form.board_status || "backlog",
          duration_minutes: form.duration_minutes === "" || form.duration_minutes == null
            ? null
            : Number(form.duration_minutes),
        });
        await entities.Item.create(oneOff);
        await invalidateAll();
        toast({
          title: "Saved this occurrence only",
          description: "The rest of the series is unchanged.",
        });
        handleOpenChange(false);
        return;
      }

      const dateISO = form.date
        ? new Date(`${form.date}T${form.time || "09:00"}:00`).toISOString()
        : null;
      const durationRaw = form.duration_minutes === "" || form.duration_minutes == null
        ? null
        : Number(form.duration_minutes);
      const durationChanged =
        durationRaw !== (item.duration_minutes == null ? null : Number(item.duration_minutes));
      const completedChanged = !!form.completed !== !!item.completed;
      const payload = {
        content: form.content,
        type: form.type,
        person_name: form.person_name,
        responsible_name: form.responsible_name,
        project_name: form.project_name,
        date: dateISO,
        due_date: form.due_date || null,
        time: form.time || "",
        recurring: resolveRecurringWrite(form),
        priority: form.priority,
        category: form.category,
        amount: form.amount === "" || form.amount == null ? null : Number(form.amount),
        budget: form.budget === "" || form.budget == null ? null : Number(form.budget),
        store: form.store,
        location: form.location,
        notes: form.notes,
        inbox: !!form.inbox,
        purchased: !!form.purchased,
        wrapped: !!form.wrapped,
        payment_status: form.payment_status,
        board_status: form.board_status || "backlog",
        reminder_offset: form.reminder_offset || null,
      };
      if (boardId) payload.board_id = boardId;
      if (boardColumns.length) {
        const col =
          boardColumns.find((c) => c.status_key === (form.board_status || "backlog")) ||
          columnForItem({ ...item, ...form }, boardColumns);
        if (col) Object.assign(payload, boardColumnPatch(col, { boardId }));
      }
      if (durationRaw != null && !Number.isNaN(durationRaw) && durationRaw > 0) {
        payload.duration_minutes = Math.round(durationRaw);
        if (durationChanged) payload.duration_source = "manual";
        else if (form.duration_source) payload.duration_source = form.duration_source;
      } else if (durationRaw === null) {
        payload.duration_minutes = null;
        payload.duration_source = null;
      }
      if (completedChanged) {
        Object.assign(payload, completionPatch({ ...item, ...form }, !!form.completed));
      } else {
        payload.completed = !!form.completed;
        if (form.completed && form.board_status !== "done") {
          const doneCol = boardColumns.find((c) => c.is_done);
          payload.board_status = doneCol?.status_key || "done";
          if (doneCol) Object.assign(payload, boardColumnPatch(doneCol, { boardId }));
        }
        if (!form.completed && (form.board_status === "done" || boardColumns.find((c) => c.status_key === form.board_status)?.is_done)) {
          const openCol = boardColumns.find((c) => !c.is_done) || boardColumns[0];
          payload.board_status = openCol?.status_key || "backlog";
          if (openCol) Object.assign(payload, boardColumnPatch(openCol, { boardId }));
        }
      }

      if (isDraft) {
        if (!String(form.content || "").trim()) {
          toast({ title: "Title required", description: "Give this item a name.", variant: "destructive" });
          setSaving(false);
          return;
        }
        const created = await entities.Item.create({
          ...payload,
          tags: form.tags || [],
          purchased: !!form.purchased,
          wrapped: !!form.wrapped,
        });
        if (created) patchItemsCaches((list) => [created, ...list]);
        await invalidateAll();
        toast({ title: "Created", description: form.content });
        handleOpenChange(false);
        return;
      }

      await entities.Item.update(recordId, payload);
      await invalidateAll();
      if (completedChanged && payload.completed) {
        const previous = {
          completed: !!item.completed,
          completed_date: item.completed_date ?? null,
          board_status: item.board_status || "backlog",
          actual_duration_minutes: item.actual_duration_minutes ?? null,
          purchased: item.purchased,
          payment_status: item.payment_status,
        };
        toast({
          title: "Completed",
          description: form.content,
          duration: 8000,
          action: (
            <ToastAction
              altText="Undo"
              onClick={async () => {
                try {
                  const row = await entities.Item.update(recordId, previous);
                  patchItemsCaches((list) =>
                    list.map((i) => (i.id === recordId ? { ...i, ...row } : i))
                  );
                  await invalidateAll();
                  toast({ title: "Restored", description: "Marked incomplete again." });
                } catch (err) {
                  toast({ title: "Couldn't undo", description: err.message, variant: "destructive" });
                }
              }}
            >
              Undo
            </ToastAction>
          ),
        });
      } else if (item.recurring || payload.recurring) {
        toast({
          title: "Series updated",
          description: "Edits apply to every repeat unless you choose This occurrence only.",
        });
      } else {
        toast({ title: "Updated" });
      }
      handleOpenChange(false);
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function skipThisOne() {
    if (!isVirtual) return;
    setSaving(true);
    try {
      const skip = withSkippedDay(item);
      await entities.Item.update(recordId, { recurring_exceptions: skip.recurring_exceptions });
      await invalidateAll();
      toast({ title: "Skipped this occurrence", description: "Other repeats stay on the calendar." });
      handleOpenChange(false);
    } catch (e) {
      toast({ title: "Could not skip", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!confirm(item.recurring || isVirtual
      ? "Move this repeating item (and all its repeats) to trash? You can restore it from Settings → Completed & archive."
      : "Move this item to trash? You can restore it from Settings → Completed & archive.")) return;
    setSaving(true);
    try {
      await entities.Item.delete(recordId);
      patchItemsCaches((list) => list.filter((i) => i.id !== recordId));
      await invalidateAll();
      toast({
        title: "Moved to trash",
        description: "Restore anytime from Settings → Completed & archive.",
        duration: 8000,
        action: (
          <ToastAction
            altText="Undo"
            onClick={async () => {
              try {
                const row = await entities.Item.restore(recordId);
                patchItemsCaches((list) => [row, ...list.filter((i) => i.id !== recordId)]);
                await invalidateAll();
                toast({ title: "Restored" });
              } catch (err) {
                toast({ title: "Couldn't restore", description: err.message, variant: "destructive" });
              }
            }}
          >
            Undo
          </ToastAction>
        ),
      });
      handleOpenChange(false);
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function duplicate() {
    if (!form || !item || isDraft) return;
    setSaving(true);
    try {
      const baseTitle = String(form.content || item.content || "Item").trim();
      const title = / \(copy\)$/i.test(baseTitle) ? baseTitle : `${baseTitle} (copy)`;
      const dateISO = form.date
        ? new Date(`${form.date}T${form.time || "09:00"}:00`).toISOString()
        : item.date || null;
      const durationRaw = form.duration_minutes === "" || form.duration_minutes == null
        ? null
        : Number(form.duration_minutes);
      const payload = {
        content: title,
        type: form.type || "todo",
        person_name: form.person_name || null,
        responsible_name: form.responsible_name || null,
        project_name: form.project_name || null,
        date: dateISO,
        due_date: form.due_date || null,
        time: form.time || "",
        recurring: resolveRecurringWrite(form) || "",
        priority: form.priority || "medium",
        category: form.category || null,
        amount: form.amount === "" || form.amount == null ? null : Number(form.amount),
        budget: form.budget === "" || form.budget == null ? null : Number(form.budget),
        store: form.store || null,
        location: form.location || null,
        notes: form.notes || null,
        inbox: !!form.inbox,
        tags: form.tags || [],
        completed: false,
        completed_date: null,
        purchased: false,
        wrapped: !!form.wrapped,
        payment_status: form.type === "bill" ? "unpaid" : (form.payment_status || "unpaid"),
        board_status: "backlog",
        reminder_offset: form.reminder_offset || null,
        duration_minutes: durationRaw != null && !Number.isNaN(durationRaw) && durationRaw > 0
          ? Math.round(durationRaw)
          : null,
        duration_source: form.duration_source || null,
        recurring_exceptions: [],
      };
      const created = await entities.Item.create(payload);
      if (created) patchItemsCaches((list) => [created, ...list]);
      await invalidateAll();
      toast({ title: "Duplicated", description: title });
      handleOpenChange(false);
    } catch (e) {
      toast({ title: "Duplicate failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const isGrocery = form.type === "grocery";
  const isBill = form.type === "bill";
  const isGift = form.type === "gift";
  const doneLabel = completionLabel(form.type);
  const reminderState = formatReminderState({
    ...form,
    date: form.date ? `${form.date}T${form.time || "09:00"}:00` : null,
  });

  const fields = (
    <div className="space-y-4 pb-4">
      <div className="space-y-1.5">
        <Label htmlFor="item-title">Title</Label>
        <Input id="item-title" value={form.content} onChange={(e) => set({ content: e.target.value })} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Scheduled date</Label>
          <Input type="date" value={form.date || ""} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>Time</Label>
          <Input type="time" value={form.time || ""} onChange={(e) => set({ time: e.target.value })} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Assigned to</Label>
          <Input
            list="goes-people"
            value={form.responsible_name || ""}
            onChange={(e) => set({ responsible_name: e.target.value })}
            placeholder="Who owns this"
          />
        </div>
        <div className="space-y-1.5">
          <Label>About</Label>
          <Input
            list="goes-people"
            value={form.person_name || ""}
            onChange={(e) => set({ person_name: e.target.value })}
            placeholder="For whom"
          />
        </div>
      </div>
      <datalist id="goes-people">
        {peopleNames.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select
          value={form.board_status || (boardColumns[0]?.status_key) || "backlog"}
          onValueChange={(v) => {
            const col = boardColumns.find((c) => c.status_key === v);
            set({
              board_status: v,
              completed: col ? !!col.is_done : v === "done",
              board_column_id: col?.id,
            });
          }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {boardColumns.length > 0 ? (
              boardColumns.map((c) => (
                <SelectItem key={c.id} value={c.status_key}>{c.name}</SelectItem>
              ))
            ) : (
              <>
                <SelectItem value="backlog">Backlog</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="doing">Doing</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-4">
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <Switch
            checked={isBill ? form.payment_status === "paid" : (isGrocery || form.type === "shopping" ? !!form.purchased || !!form.completed : !!form.completed)}
            onCheckedChange={(v) => {
              if (isBill) set({ payment_status: v ? "paid" : "unpaid", completed: v });
              else if (isGrocery || form.type === "shopping") set({ purchased: v, completed: v });
              else set({ completed: v });
            }}
          />
          {doneLabel}
        </label>
        <label className="flex min-h-[44px] items-center gap-2 text-sm">
          <Switch checked={!!form.inbox} onCheckedChange={(v) => set({ inbox: v })} />
          Needs review
        </label>
        {isGift && (
          <label className="flex min-h-[44px] items-center gap-2 text-sm">
            <Switch checked={!!form.wrapped} onCheckedChange={(v) => set({ wrapped: v })} />
            Wrapped
          </label>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        className="flex w-full min-h-[44px] items-center justify-between rounded-[6px] border border-border bg-muted/40 px-3 text-sm font-medium"
      >
        More details
        <ChevronDown className={cn("h-4 w-4 transition", moreOpen && "rotate-180")} />
      </button>

      {moreOpen && (
        <div className="space-y-4 rounded-xl border border-border bg-card p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ITEM_TYPES.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority || "medium"} onValueChange={(v) => set({ priority: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={form.due_date || ""} onChange={(e) => set({ due_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={5}
                step={5}
                value={form.duration_minutes ?? ""}
                onChange={(e) => set({ duration_minutes: e.target.value, duration_source: "manual" })}
                placeholder="e.g. 25"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <Input
              list="goes-projects"
              value={form.project_name || ""}
              onChange={(e) => set({ project_name: e.target.value })}
            />
            <datalist id="goes-projects">
              {projectNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            <p className="text-[11px] text-muted-foreground">Links to a Project destination, not the “Project item” list type.</p>
          </div>

          <div className="space-y-2 rounded-[6px] border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <Label className="mb-0">Repeats</Label>
            </div>
            <Select
              value={preset === "__weekday__" ? "weekly" : preset === "none" ? "none" : preset}
              onValueChange={(v) => {
                if (v === "none") set({ recurring: "" });
                else if (v === "__custom__") set({ recurring: form.recurring && preset === "__custom__" ? form.recurring : "every 3 days" });
                else if (v === "weekly" && form.date) set({ recurring: weeklyStringForDate(form.date) });
                else set({ recurring: v });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Does not repeat" /></SelectTrigger>
              <SelectContent>
                {RECURRENCE_CHOICES.map((p) => (
                  <SelectItem key={p.value || "none"} value={p.value || "none"}>{p.label}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {(preset === "__custom__" || preset === "__weekday__") && (
              <Input
                value={form.recurring || ""}
                onChange={(e) => set({ recurring: e.target.value })}
                placeholder="e.g. every Tuesday, every 3 months"
              />
            )}
            {form.recurring && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p className="font-medium text-foreground/80">{summary || form.recurring}</p>
                {nextLabel && <p>Next: {nextLabel}</p>}
              </div>
            )}
            {isVirtual && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={skipThisOne} disabled={saving}>
                  <SkipForward className="h-3.5 w-3.5 mr-1" /> Skip this one
                </Button>
                <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => save({ series: false })} disabled={saving}>
                  <Split className="h-3.5 w-3.5 mr-1" /> Edit this occurrence only
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-[6px] border border-border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <Label className="mb-0">Reminder</Label>
            </div>
            <Select
              value={form.reminder_offset || "none"}
              onValueChange={(v) => set({ reminder_offset: v === "none" ? "" : v })}
            >
              <SelectTrigger><SelectValue placeholder="No reminder" /></SelectTrigger>
              <SelectContent>
                {REMINDER_OPTIONS.map((o) => (
                  <SelectItem key={o.value || "none"} value={o.value || "none"}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reminderState && (
              <p className="text-xs text-muted-foreground">{reminderState}</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Shown in Due reminders on Home and Inbox. No push or email yet.
            </p>
          </div>

          {isGrocery && (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category || ""} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger><SelectValue placeholder="Aisle" /></SelectTrigger>
                <SelectContent>
                  {GROCERY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="space-y-1.5 pt-1">
                <Label>Store</Label>
                <Input
                  value={form.store || ""}
                  onChange={(e) => set({ store: e.target.value })}
                  placeholder="Optional — filters Shopping mode"
                />
              </div>
            </div>
          )}

          {(isBill || form.type === "shopping" || form.type === "errand") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{isBill ? "Amount" : "Budget"}</Label>
                <Input type="number" value={form.amount ?? ""} onChange={(e) => set({ amount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Store</Label>
                <Input value={form.store || ""} onChange={(e) => set({ store: e.target.value })} />
              </div>
            </div>
          )}

          {isBill && (
            <div className="space-y-1.5">
              <Label>Payment status</Label>
              <Select value={form.payment_status || "unpaid"} onValueChange={(v) => set({ payment_status: v, completed: v === "paid" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {isGift && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Budget</Label>
                <Input type="number" value={form.budget ?? ""} onChange={(e) => set({ budget: e.target.value })} placeholder="Planned" />
              </div>
              <div className="space-y-1.5">
                <Label>Spent</Label>
                <Input type="number" value={form.amount ?? ""} onChange={(e) => set({ amount: e.target.value })} placeholder="Optional" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Store</Label>
                <Input value={form.store || ""} onChange={(e) => set({ store: e.target.value })} />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input value={form.location || ""} onChange={(e) => set({ location: e.target.value })} />
          </div>

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes || ""} onChange={(e) => set({ notes: e.target.value })} />
          </div>
        </div>
      )}

      {!isVirtual && !isDraft && (
        <ItemAttachments itemId={recordId} disabled={saving} />
      )}
      {isDraft && (
        <p className="text-xs text-muted-foreground">Save to attach photos or files.</p>
      )}

      {(form.date || item.date) && (
        <div className="pt-1">
          <Button
            type="button"
            variant="outline"
            className="w-full min-h-[44px]"
            onClick={() => {
              const snapshot = {
                ...item,
                ...form,
                id: recordId,
                content: form.content,
                date: form.date
                  ? new Date(`${form.date}T${form.time || "09:00"}:00`).toISOString()
                  : item.date,
                time: form.time || item.time || "",
                duration_minutes: form.duration_minutes === "" || form.duration_minutes == null
                  ? item.duration_minutes
                  : Number(form.duration_minutes),
                location: form.location || item.location,
                notes: form.notes || item.notes,
                store: form.store || item.store,
              };
              const ok = downloadItemIcs(snapshot);
              if (ok) {
                toast({
                  title: "Calendar file downloaded",
                  description: "Open the .ics file to add it to your device calendar. Times are local wall-clock (floating).",
                });
              } else {
                toast({
                  title: "Needs a date",
                  description: "Set a scheduled date before exporting to calendar.",
                  variant: "destructive",
                });
              }
            }}
          >
            <CalendarPlus className="h-4 w-4 mr-2" />
            Add to calendar
          </Button>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Downloads a .ics file (one-way). Not two-way Google/Apple sync.
          </p>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="flex w-full flex-col gap-2">
      {isVirtual && (
        <p className="text-[11px] text-muted-foreground">
          Save updates the whole series. Use “Edit this occurrence only” under Repeats to detach this day.
        </p>
      )}
      <div className="flex w-full items-center justify-between gap-2">
        {isDraft ? (
          <span />
        ) : (
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" onClick={remove} disabled={saving} className="text-destructive hover:text-destructive min-h-[44px]">
              <Trash2 className="h-4 w-4 mr-1" /> Delete
            </Button>
            <Button variant="ghost" onClick={duplicate} disabled={saving} className="min-h-[44px]">
              <Copy className="h-4 w-4 mr-1" /> Duplicate
            </Button>
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={() => handleOpenChange(false)} className="min-h-[44px]">Cancel</Button>
          <Button onClick={() => save({ series: true })} disabled={saving} className="min-h-[44px]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            {isDraft ? "Create" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );

  const seriesNote = (item.recurring || isVirtual) && (
    <p className="text-xs text-muted-foreground">
      {summary ? `${summary}.` : `Repeats ${item.recurring}.`}{" "}
      {isVirtual
        ? "You are viewing one occurrence."
        : "Changes apply to every repeat unless you edit one occurrence only."}
      {nextLabel ? ` Next: ${nextLabel}.` : ""}
    </p>
  );

  const drawerTitle = isDraft
    ? (form.type === "gift" ? "New gift" : "New item")
    : "Edit item";

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="flex h-[92vh] flex-col rounded-t-xl p-0 gap-0">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="font-heading text-lg">{drawerTitle}</SheetTitle>
            <SheetDescription className="sr-only">{drawerTitle}</SheetDescription>
            {seriesNote}
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 py-3 scrollbar-thin">{fields}</div>
          <SheetFooter className="sticky bottom-0 border-t border-border bg-card px-4 py-3">
            {footer}
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle className="font-heading text-lg">{drawerTitle}</DialogTitle>
          <DialogDescription className="sr-only">{drawerTitle}</DialogDescription>
          {seriesNote}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">{fields}</div>
        <DialogFooter className="sticky bottom-0 border-t border-border bg-card px-6 py-3 sm:justify-between">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
