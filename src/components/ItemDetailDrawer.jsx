import React from "react";
import { Trash2, Loader2, Save } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { entities } from "@/api/entities";
import { ITEM_TYPES, GROCERY_CATEGORIES, parseDay, toDayKey } from "@/lib/itemTypes";
import { completionPatch } from "@/lib/estimateDuration";
import { invalidateAll, patchItemsCaches, usePeople, useProjects } from "@/lib/queries";

export default function ItemDetailDrawer({ item, open, onOpenChange }) {
  const { toast } = useToast();
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const [form, setForm] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const peopleNames = (people || []).map((p) => p.name);
  const projectNames = (projects || []).map((p) => p.name);

  React.useEffect(() => {
    if (item) {
      // A calendar repeat edits the whole series, so start from the series' own date.
      const d = parseDay(item._recurringOccurrence ? item._originalDate : item.date);
      const pad = (n) => String(n).padStart(2, "0");
      setForm({
        ...item,
        date: d ? toDayKey(d) : "",
        time: item.time || (d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ""),
        duration_minutes: item.duration_minutes ?? "",
        board_status: item.board_status || (item.completed ? "done" : "backlog"),
      });
    }
  }, [item]);

  if (!form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const recordId = item._originalId || item.id;

  async function save() {
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
      const row = await entities.Item.update(recordId, payload);
      patchItemsCaches((list) => list.map((i) => (i.id === recordId ? { ...i, ...row } : i)));
      await invalidateAll();
      toast({ title: "Updated" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(item.recurring ? "Delete this repeating item and all its repeats?" : "Delete this item?")) return;
    setSaving(true);
    try {
      await entities.Item.delete(recordId);
      patchItemsCaches((list) => list.filter((i) => i.id !== recordId));
      await invalidateAll();
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const isGrocery = form.type === "grocery";
  const isBill = form.type === "bill";
  const isGift = form.type === "gift";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Edit item</DialogTitle>
          {item.recurring && (
            <p className="text-xs text-muted-foreground">Repeats {item.recurring}. Changes apply to every repeat.</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Content</Label>
            <Input value={form.content} onChange={(e) => set({ content: e.target.value })} />
          </div>

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
              <Select value={form.priority} onValueChange={(v) => set({ priority: v })}>
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
              <Label>Person (about)</Label>
              <Input
                list="place-people"
                value={form.person_name || ""}
                onChange={(e) => set({ person_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Responsible</Label>
              <Input
                list="place-people"
                value={form.responsible_name || ""}
                onChange={(e) => set({ responsible_name: e.target.value })}
              />
            </div>
          </div>
          <datalist id="place-people">
            {peopleNames.map((n) => <option key={n} value={n} />)}
          </datalist>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={form.date || ""} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Time</Label>
              <Input type="time" value={form.time || ""} onChange={(e) => set({ time: e.target.value })} />
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Input
                list="place-projects"
                value={form.project_name || ""}
                onChange={(e) => set({ project_name: e.target.value })}
              />
              <datalist id="place-projects">
                {projectNames.map((n) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label>Board</Label>
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
          </div>

          <div className="space-y-1.5">
            <Label>Recurring</Label>
            <Input value={form.recurring || ""} onChange={(e) => set({ recurring: e.target.value })} placeholder="e.g. every Tuesday" />
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
              <Select value={form.payment_status || "unpaid"} onValueChange={(v) => set({ payment_status: v })}>
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

          <Separator />
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.completed} onCheckedChange={(v) => set({ completed: v })} /> Completed</label>
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.purchased} onCheckedChange={(v) => set({ purchased: v })} /> Purchased</label>
            {isGift && <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.wrapped} onCheckedChange={(v) => set({ wrapped: v })} /> Wrapped</label>}
            <label className="flex items-center gap-2 text-sm"><Switch checked={!!form.inbox} onCheckedChange={(v) => set({ inbox: v })} /> Needs review</label>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" onClick={remove} disabled={saving} className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />} Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}