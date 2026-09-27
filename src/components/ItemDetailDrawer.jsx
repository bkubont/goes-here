import React from "react";
import { Trash2, Loader2, Save, ChevronDown } from "lucide-react";
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
import { entities } from "@/api/entities";
import {
  ITEM_TYPES, GROCERY_CATEGORIES, RECURRING_PRESETS, parseDay, toDayKey,
} from "@/lib/itemTypes";
import { completionPatch } from "@/lib/estimateDuration";
import { invalidateAll, usePeople, useProjects } from "@/lib/queries";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

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
  };
}

function completionLabel(type) {
  if (type === "grocery" || type === "shopping") return "Purchased";
  if (type === "bill") return "Paid";
  return "Completed";
}

export default function ItemDetailDrawer({ item, open, onOpenChange }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const [form, setForm] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const peopleNames = (people || []).map((p) => p.name);
  const projectNames = (projects || []).map((p) => p.name);

  React.useEffect(() => {
    if (open && item) {
      setForm(buildForm(item));
      setMoreOpen(false);
    }
    if (!open) {
      // Clear after close animation so Cancel never reads a null item with stale form.
      const t = setTimeout(() => setForm(null), 200);
      return () => clearTimeout(t);
    }
  }, [item, open]);

  const handleOpenChange = React.useCallback((next) => {
    if (!next) onOpenChange?.(false);
    else onOpenChange?.(true);
  }, [onOpenChange]);

  // Guard: never access item fields when closed or item cleared (Cancel / X / Escape).
  if (!open || !item || !form) {
    return isMobile ? (
      <Sheet open={false} onOpenChange={handleOpenChange} />
    ) : (
      <Dialog open={false} onOpenChange={handleOpenChange} />
    );
  }

  const set = (patch) => setForm((f) => (f ? { ...f, ...patch } : f));
  const recordId = item._originalId || item.id;

  async function save() {
    if (!form || !item) return;
    setSaving(true);
    try {
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
        recurring: form.recurring,
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
      };
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
        if (form.completed && form.board_status !== "done") payload.board_status = "done";
        if (!form.completed && form.board_status === "done") payload.board_status = "backlog";
      }
      await entities.Item.update(recordId, payload);
      invalidateAll();
      toast({ title: "Updated" });
      handleOpenChange(false);
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!item) return;
    if (!confirm(item.recurring ? "Delete this repeating item and all its repeats?" : "Delete this item?")) return;
    setSaving(true);
    try {
      await entities.Item.delete(recordId);
      invalidateAll();
      handleOpenChange(false);
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const isGrocery = form.type === "grocery";
  const isBill = form.type === "bill";
  const isGift = form.type === "gift";
  const doneLabel = completionLabel(form.type);
  const recurringRaw = form.recurring || "";
  const recurringValue = !recurringRaw
    ? "none"
    : RECURRING_PRESETS.some((p) => p.value === recurringRaw)
      ? recurringRaw
      : "__custom__";

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
        <Select value={form.board_status || "backlog"} onValueChange={(v) => set({ board_status: v, completed: v === "done" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="backlog">Backlog</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="doing">Doing</SelectItem>
            <SelectItem value="done">Done</SelectItem>
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

          <div className="space-y-1.5">
            <Label>Repeats</Label>
            <Select
              value={recurringValue}
              onValueChange={(v) => {
                if (v === "none") set({ recurring: "" });
                else if (v === "__custom__") set({ recurring: form.recurring || "custom" });
                else set({ recurring: v });
              }}
            >
              <SelectTrigger><SelectValue placeholder="Does not repeat" /></SelectTrigger>
              <SelectContent>
                {RECURRING_PRESETS.map((p) => (
                  <SelectItem key={p.value || "none"} value={p.value || "none"}>{p.label}</SelectItem>
                ))}
                <SelectItem value="__custom__">Custom…</SelectItem>
              </SelectContent>
            </Select>
            {recurringValue === "__custom__" && (
              <Input
                className="mt-2"
                value={form.recurring || ""}
                onChange={(e) => set({ recurring: e.target.value })}
                placeholder="e.g. every Tuesday"
              />
            )}
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
                <Input type="number" value={form.budget ?? ""} onChange={(e) => set({ budget: e.target.value })} />
              </div>
              <div className="space-y-1.5">
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
    </div>
  );

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <Button variant="ghost" onClick={remove} disabled={saving} className="text-destructive hover:text-destructive min-h-[44px]">
        <Trash2 className="h-4 w-4 mr-1" /> Delete
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => handleOpenChange(false)} className="min-h-[44px]">Cancel</Button>
        <Button onClick={save} disabled={saving} className="min-h-[44px]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Save
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="flex h-[92vh] flex-col rounded-t-xl p-0 gap-0">
          <SheetHeader className="border-b border-border px-4 py-3 text-left">
            <SheetTitle className="font-heading text-lg">Edit item</SheetTitle>
            <SheetDescription className="sr-only">Edit item details</SheetDescription>
            {item.recurring && (
              <p className="text-xs text-muted-foreground">Repeats {item.recurring}. Changes apply to every repeat.</p>
            )}
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
          <DialogTitle className="font-heading text-lg">Edit item</DialogTitle>
          <DialogDescription className="sr-only">Edit item details</DialogDescription>
          {item.recurring && (
            <p className="text-xs text-muted-foreground">Repeats {item.recurring}. Changes apply to every repeat.</p>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-thin">{fields}</div>
        <DialogFooter className="sticky bottom-0 border-t border-border bg-card px-6 py-3 sm:justify-between">
          {footer}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
