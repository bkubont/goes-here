import React from "react";
import { Plus, Loader2 } from "lucide-react";
import { usePeople, useItems, invalidateAll } from "@/lib/queries";
import { entities } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import ItemList from "@/components/ItemList";

const COLORS = ["#0f766e", "#4f46e5", "#b45309", "#be123c", "#1d4ed8", "#7c3aed", "#15803d"];

export default function People() {
  const { toast } = useToast();
  const { data: people } = usePeople();
  const { data: items } = useItems({});
  const [selected, setSelected] = React.useState(null);
  const [name, setName] = React.useState("");
  const [role, setRole] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const list = people || [];
  const allItems = items || [];

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await entities.Person.create({
        name: name.trim(),
        role: role.trim(),
        color: COLORS[list.length % COLORS.length],
      });
      invalidateAll();
      setName(""); setRole("");
    } catch (err) {
      toast({ title: "Couldn't add person", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    const person = list.find((p) => p.id === selected);
    const theirs = allItems.filter((i) => i.person_name === person?.name || i.responsible_name === person?.name);
    const about = theirs.filter((i) => i.person_name === person?.name && !i.completed);
    const responsible = theirs.filter((i) => i.responsible_name === person?.name && !i.completed);
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground mb-3">← All people</button>
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-12 w-12 place-items-center rounded-full text-white font-semibold" style={{ background: person?.color }}>{person?.name?.[0]}</span>
          <div>
            <h1 className="font-display text-2xl font-semibold">{person?.name}</h1>
            <p className="text-sm text-muted-foreground">{person?.role || "—"}</p>
          </div>
        </div>
        {about.length > 0 && (
          <section className="mb-6">
            <h2 className="font-display text-lg font-semibold mb-2">About {person?.name}</h2>
            <ItemList items={about} />
          </section>
        )}
        <section>
          <h2 className="font-display text-lg font-semibold mb-2">Responsible for</h2>
          <ItemList items={responsible} emptyHint="Nothing assigned right now." />
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="font-display text-3xl font-semibold mb-1">People</h1>
      <p className="text-sm text-muted-foreground mb-6">Profiles for family members — what's theirs and what they're responsible for.</p>

      <form onSubmit={add} className="flex gap-2 mb-6">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Riley)" />
        <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. son)" className="max-w-[160px]" />
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </form>

      {list.length ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((p) => {
            const c = allItems.filter((i) => (i.person_name === p.name || i.responsible_name === p.name) && !i.completed).length;
            return (
              <button key={p.id} onClick={() => setSelected(p.id)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:shadow-sm transition">
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