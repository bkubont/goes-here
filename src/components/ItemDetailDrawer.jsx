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
import { ITEM_TYPES, GROCERY_CATEGORIES } from "@/lib/itemTypes";
import { invalidateAll } from "@/lib/queries";

export default function ItemDetailDrawer({ item, open, onOpenChange }) {
  const { toast } = useToast();
  const [form, setForm] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (item) {
      const d = item.date ? new Date(item.date) : null;
      setForm({
        ...item,
        date: d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "",
        time: item.time || (d ? d.toISOString().slice(11, 16) : ""),
      });
    }
  }, [item]);

  if (!form) return null;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  async function save() {
    setSaving(true);
    try {
      const dateISO = form.date
        ? new Date(`${form.date}T${form.time || "09:00"}:00`).toISOString()
        : null;
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
        completed: !!form.completed,
        purchased: !!form.purchased,
        wrapped: !!form.wrapped,
        payment_status: form.payment_status,
      };
      await entities.Item.update(item.id, payload);
      invalidateAll();
      toast({ title: "Updated" });
      onOpenChange(false);
    } catch (e) {
      toast({ title: "Update failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this item?")) return;
    setSaving(true);
    try {
      await entities.Item.delete(item.id);
      invalidateAll();
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
              <Input value={form.person_name || ""} onChange={(e) => set({ person_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsible</Label>
              <Input value={form.responsible_name || ""} onChange={(e) => set({ responsible_name: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Input value={form.project_name || ""} onChange={(e) => set({ project_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Recurring</Label>
              <Input value={form.recurring || ""} onChange={(e) => set({ recurring: e.target.value })} placeholder="e.g. every Tuesday" />
            </div>
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