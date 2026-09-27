import React from "react";
import { Link } from "react-router-dom";
import { Plus, Loader2, Pencil, Gift } from "lucide-react";
import { usePeople, useItems, invalidateAll, patchPeopleCaches, patchItemsCaches } from "@/lib/queries";
import { entities } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import ItemList from "@/components/ItemList";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { giftBudgetRollup, formatMoney } from "@/lib/giftBudget";
import {
  nextBirthdayDate, formatBirthdayCountdown, formatBirthdayShort,
} from "@/lib/birthdays";
import { COLOR_PALETTE, normalizeToPalette } from "@/lib/colorPalette";
import ColorPicker from "@/components/ColorPicker";

function birthdayInputValue(value) {
  if (!value) return "";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return "";
}

async function cascadePersonRename(oldName, newName, items) {
  if (!oldName || !newName || oldName === newName) return 0;
  const matches = (items || []).filter(
    (i) => i.person_name === oldName || i.responsible_name === oldName
  );
  await Promise.all(
    matches.map((it) => {
      const patch = {};
      if (it.person_name === oldName) patch.person_name = newName;
      if (it.responsible_name === oldName) patch.responsible_name = newName;
      return entities.Item.update(it.id, patch);
    })
  );
  return matches.length;
}

export default function People() {
  const { toast } = useToast();
  const { data: people } = usePeople();
  const { data: items } = useItems({});
  const [selected, setSelected] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [addColor, setAddColor] = React.useState(COLOR_PALETTE[0]);
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    name: "",
    role: "",
    color: COLOR_PALETTE[0],
    birthday: "",
    notes: "",
  });
  const [editSaving, setEditSaving] = React.useState(false);
  const [giftDraft, setGiftDraft] = React.useState(null);
  const migratedRef = React.useRef(false);

  const list = people || [];
  const allItems = items || [];

  // One-shot: snap legacy off-palette people.color to nearest swatch.
  React.useEffect(() => {
    if (migratedRef.current || !people?.length) return;
    migratedRef.current = true;
    const stale = people.filter((p) => {
      if (!p.color) return false;
      return normalizeToPalette(p.color).toLowerCase() !== String(p.color).toLowerCase();
    });
    if (!stale.length) return;
    (async () => {
      try {
        await Promise.all(
          stale.map((p) =>
            entities.Person.update(p.id, { color: normalizeToPalette(p.color) })
          )
        );
        patchPeopleCaches((rows) =>
          rows.map((p) => {
            const hit = stale.find((s) => s.id === p.id);
            return hit ? { ...p, color: normalizeToPalette(hit.color) } : p;
          })
        );
        await invalidateAll();
      } catch {
        /* non-blocking */
      }
    })();
  }, [people]);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const row = await entities.Person.create({
        name: name.trim(),
        role: role.trim(),
        color: normalizeToPalette(addColor, COLOR_PALETTE[list.length % COLOR_PALETTE.length]),
      });
      if (row) patchPeopleCaches((people) => [...people, row].sort((a, b) => a.name.localeCompare(b.name)));
      await invalidateAll();
      setName(""); setRole("");
      setAddColor(COLOR_PALETTE[(list.length + 1) % COLOR_PALETTE.length]);
      setAdding(false);
    } catch (err) {
      toast({ title: "Couldn't add person", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(person) {
    setEditForm({
      name: person?.name || "",
      role: person?.role || "",
      color: normalizeToPalette(person?.color, COLOR_PALETTE[0]),
      birthday: birthdayInputValue(person?.birthday),
      notes: person?.notes || "",
    });
    setEditing(true);
  }

  async function saveEdit(e) {
    e.preventDefault();
    const person = list.find((p) => p.id === selected);
    if (!person || !editForm.name.trim()) return;
    setEditSaving(true);
    const nextName = editForm.name.trim();
    const oldName = person.name;
    try {
      const row = await entities.Person.update(person.id, {
        name: nextName,
        role: editForm.role.trim(),
        color: normalizeToPalette(editForm.color, COLOR_PALETTE[0]),
        birthday: editForm.birthday || null,
        notes: editForm.notes.trim(),
      });
      if (row) {
        patchPeopleCaches((people) =>
          people.map((p) => (p.id === person.id ? { ...p, ...row } : p))
        );
      }
      if (oldName !== nextName) {
        await cascadePersonRename(oldName, nextName, allItems);
        patchItemsCaches((items) =>
          items.map((it) => {
            const next = { ...it };
            if (it.person_name === oldName) next.person_name = nextName;
            if (it.responsible_name === oldName) next.responsible_name = nextName;
            return next;
          })
        );
      }
      await invalidateAll();
      setEditing(false);
      toast({ title: "Person updated" });
    } catch (err) {
      toast({ title: "Couldn't update person", description: err.message, variant: "destructive" });
    } finally {
      setEditSaving(false);
    }
  }

  if (selected) {
    const person = list.find((p) => p.id === selected);
    const about = allItems.filter((i) => i.person_name === person?.name && !i.completed);
    const responsible = allItems.filter((i) => i.responsible_name === person?.name && !i.completed);
    const giftsRollup = giftBudgetRollup(allItems, person?.name);
    const nextBday = person?.birthday ? nextBirthdayDate(person.birthday) : null;
    const daysUntilBday = (() => {
      if (!nextBday) return null;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return Math.round((nextBday - start) / (24 * 60 * 60 * 1000));
    })();
    const overdueAssigned = responsible.filter((i) => {
      if (!i.due_date && !i.date) return false;
      const d = new Date(i.due_date || i.date);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      return d < now;
    });

    function openGiftDraft() {
      setGiftDraft({
        _draft: true,
        id: `draft-gift-${person?.name}`,
        content: "",
        type: "gift",
        person_name: person?.name || "",
        completed: false,
        board_status: "backlog",
        tags: [],
        inbox: false,
        wrapped: false,
        priority: "medium",
      });
    }

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <button
          type="button"
          onClick={() => { setSelected(null); setEditing(false); setGiftDraft(null); }}
          className="text-sm text-muted-foreground hover:text-foreground mb-3 min-h-[44px]"
        >
          ← All people
        </button>
        <div className="flex items-center gap-3 mb-4">
          <span className="grid h-12 w-12 place-items-center rounded-full text-white font-semibold" style={{ background: person?.color }}>{person?.name?.[0]}</span>
          <div className="flex-1 min-w-0">
            <h1 className="page-title">{person?.name}</h1>
            <p className="text-sm text-muted-foreground">{person?.role || "—"}</p>
          </div>
          {!editing && (
            <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => startEdit(person)}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
            </Button>
          )}
        </div>

        {editing ? (
          <form onSubmit={saveEdit} className="rounded-xl border border-border bg-card p-4 space-y-3 mb-6">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="person-name">Name</Label>
                <Input id="person-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="person-role">Role</Label>
                <Input id="person-role" value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))} placeholder="e.g. son" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="person-birthday">Birthday</Label>
                <Input id="person-birthday" type="date" value={editForm.birthday} onChange={(e) => setEditForm((f) => ({ ...f, birthday: e.target.value }))} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Color</Label>
                <ColorPicker
                  value={editForm.color}
                  onChange={(c) => setEditForm((f) => ({ ...f, color: c }))}
                  label={`Color for ${editForm.name || "person"}`}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="person-notes">Notes</Label>
              <Textarea id="person-notes" rows={3} value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Allergies, preferences, reminders…" />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" disabled={editSaving || !editForm.name.trim()} className="min-h-[44px]">
                {editSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Save
              </Button>
              <Button type="button" variant="ghost" disabled={editSaving} onClick={() => setEditing(false)} className="min-h-[44px]">
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          (person?.birthday || person?.notes) && (
            <div className="rounded-xl border border-border bg-card p-4 mb-6 space-y-1 text-sm">
              {person.birthday && (
                <p>
                  <span className="text-muted-foreground">Birthday:</span>{" "}
                  {birthdayInputValue(person.birthday)}
                  {nextBday && daysUntilBday != null && daysUntilBday <= 30 && (
                    <span className="text-muted-foreground">
                      {" "}· next {formatBirthdayShort(nextBday)} ({formatBirthdayCountdown(daysUntilBday)})
                    </span>
                  )}
                </p>
              )}
              {person.notes && <p className="whitespace-pre-wrap">{person.notes}</p>}
            </div>
          )
        )}

        <section className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h2 className="font-heading text-base font-semibold flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" /> Gifts
            </h2>
            <div className="flex flex-wrap gap-1.5">
              <Button asChild type="button" variant="outline" size="sm" className="min-h-[40px]">
                <Link to={`/lists/gift?person=${encodeURIComponent(person?.name || "")}`}>
                  View list
                </Link>
              </Button>
              <Button type="button" size="sm" className="min-h-[40px]" onClick={openGiftDraft}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add gift
              </Button>
            </div>
          </div>
          {(giftsRollup.budgetTotal != null || giftsRollup.spentTotal != null) && (
            <p className="text-sm text-muted-foreground mb-2">
              {giftsRollup.budgetTotal != null && (
                <span>Budget {formatMoney(giftsRollup.budgetTotal)}</span>
              )}
              {giftsRollup.budgetTotal != null && giftsRollup.spentTotal != null && <span> · </span>}
              {giftsRollup.spentTotal != null && (
                <span>Spent {formatMoney(giftsRollup.spentTotal)}</span>
              )}
              {giftsRollup.budgetTotal != null && giftsRollup.spentTotal != null && (
                <span>
                  {" "}· Left {formatMoney(giftsRollup.remaining)}
                </span>
              )}
            </p>
          )}
          <ItemList
            items={giftsRollup.gifts}
            emptyHint={`No open gifts for ${person?.name || "them"} yet.`}
          />
        </section>

        {overdueAssigned.length > 0 && (
          <section className="mb-6">
            <h2 className="font-heading text-base font-semibold mb-2 text-attention-foreground">Priority — overdue</h2>
            <ItemList items={overdueAssigned} />
          </section>
        )}
        {about.filter((i) => i.type !== "gift").length > 0 && (
          <section className="mb-6">
            <h2 className="font-heading text-base font-semibold mb-2">About {person?.name}</h2>
            <ItemList items={about.filter((i) => i.type !== "gift")} />
          </section>
        )}
        <section>
          <h2 className="font-heading text-base font-semibold mb-2">Assigned to {person?.name}</h2>
          <ItemList items={responsible} emptyHint="Nothing assigned right now." />
        </section>

        <ItemDetailDrawer
          item={giftDraft}
          open={!!giftDraft}
          onOpenChange={(o) => !o && setGiftDraft(null)}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title mb-1">People</h1>
          <p className="text-sm text-muted-foreground">Family members — what&apos;s about them and what they&apos;re assigned.</p>
        </div>
        <Button type="button" onClick={() => setAdding((v) => !v)} className="min-h-[44px]">
          <Plus className="h-4 w-4 mr-1" /> Add person
        </Button>
      </div>

      {adding && (
        <form onSubmit={add} className="rounded-xl border border-border bg-card p-4 space-y-3 mb-6">
          <div className="grid sm:grid-cols-2 gap-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Riley)" autoFocus />
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. son)" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker
              value={addColor}
              onChange={setAddColor}
              label="Color for new person"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !name.trim()} className="min-h-[44px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} Save
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} className="min-h-[44px]">Cancel</Button>
          </div>
        </form>
      )}

      {list.length ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((p) => {
            const c = allItems.filter((i) => (i.person_name === p.name || i.responsible_name === p.name) && !i.completed).length;
            return (
              <button key={p.id} type="button" onClick={() => setSelected(p.id)} className="flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:shadow-sm transition">
                <span className="grid h-11 w-11 place-items-center rounded-full text-white font-semibold" style={{ background: p.color }}>{p.name[0]}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.role || "—"} · {c} active</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No people yet. Add family members to organize by person.
        </div>
      )}
    </div>
  );
}
