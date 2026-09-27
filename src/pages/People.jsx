import React from "react";
import { Plus, Loader2, Pencil } from "lucide-react";
import { usePeople, useItems, invalidateAll, patchPeopleCaches, patchItemsCaches } from "@/lib/queries";
import { entities } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import ItemList from "@/components/ItemList";

const COLORS = ["#0404A9", "#CFAB59", "#555D6D", "#0A0A0A", "#0505C7", "#1d4ed8", "#15803d"];

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
  const [saving, setSaving] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [editForm, setEditForm] = React.useState({
    name: "",
    role: "",
    color: COLORS[0],
    birthday: "",
    notes: "",
  });
  const [editSaving, setEditSaving] = React.useState(false);

  const list = people || [];
  const allItems = items || [];

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const row = await entities.Person.create({
        name: name.trim(),
        role: role.trim(),
        color: COLORS[list.length % COLORS.length],
      });
      if (row) patchPeopleCaches((people) => [...people, row].sort((a, b) => a.name.localeCompare(b.name)));
      await invalidateAll();
      setName(""); setRole("");
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
      color: person?.color || COLORS[0],
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
        color: editForm.color || COLORS[0],
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
    const overdueAssigned = responsible.filter((i) => {
      if (!i.due_date && !i.date) return false;
      const d = new Date(i.due_date || i.date);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      d.setHours(0, 0, 0, 0);
      return d < now;
    });
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <button
          type="button"
          onClick={() => { setSelected(null); setEditing(false); }}
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
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex flex-wrap gap-2 pt-1">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditForm((f) => ({ ...f, color: c }))}
                      className="h-8 w-8 rounded-full border-2 transition"
                      style={{ background: c, borderColor: editForm.color === c ? "#0404A9" : "transparent" }}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
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
                <p><span className="text-muted-foreground">Birthday:</span> {birthdayInputValue(person.birthday)}</p>
              )}
              {person.notes && <p className="whitespace-pre-wrap">{person.notes}</p>}
            </div>
          )
        )}

        {overdueAssigned.length > 0 && (
          <section className="mb-6">
            <h2 className="font-heading text-base font-semibold mb-2 text-attention-foreground">Priority — overdue</h2>
            <ItemList items={overdueAssigned} />
          </section>
        )}
        {about.length > 0 && (
          <section className="mb-6">
            <h2 className="font-heading text-base font-semibold mb-2">About {person?.name}</h2>
            <ItemList items={about} />
          </section>
        )}
        <section>
          <h2 className="font-heading text-base font-semibold mb-2">Assigned to {person?.name}</h2>
          <ItemList items={responsible} emptyHint="Nothing assigned right now." />
        </section>
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
