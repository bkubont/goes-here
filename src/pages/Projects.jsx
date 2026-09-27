import React from "react";
import { Plus, Loader2, FolderKanban } from "lucide-react";
import { useProjects, useItems, invalidateAll } from "@/lib/queries";
import { entities } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import ItemList from "@/components/ItemList";

const COLORS = ["#4f46e5", "#0f766e", "#b45309", "#be123c", "#1d4ed8", "#7c3aed"];

export default function Projects() {
  const { toast } = useToast();
  const { data: projects } = useProjects();
  const { data: items } = useItems({});
  const [selected, setSelected] = React.useState(null);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const list = projects || [];
  const allItems = items || [];

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await entities.Project.create({
        name: name.trim(),
        description: desc.trim(),
        color: COLORS[list.length % COLORS.length],
      });
      await invalidateAll();
      setName(""); setDesc("");
    } catch (err) {
      toast({ title: "Couldn't add project", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    const proj = list.find((p) => p.id === selected);
    const theirs = allItems.filter((i) => i.project_name === proj?.name);
    const active = theirs.filter((i) => !i.completed);
    const done = theirs.filter((i) => i.completed);
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <button onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground mb-3">← All projects</button>
        <div className="flex items-center gap-3 mb-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: proj?.color }}><FolderKanban className="h-5 w-5" /></span>
          <div>
            <h1 className="font-display text-2xl font-semibold">{proj?.name}</h1>
            {proj?.description && <p className="text-sm text-muted-foreground">{proj.description}</p>}
          </div>
        </div>
        <ItemList items={active} emptyHint="No items in this project yet." />
        {done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground mb-2">{done.length} completed</summary>
            <ItemList items={done} />
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="font-display text-3xl font-semibold mb-1">Projects</h1>
      <p className="text-sm text-muted-foreground mb-6">Group tasks, shopping, research, notes & deadlines together.</p>

      <form onSubmit={add} className="space-y-2 mb-6">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name (e.g. Greenhouse build)" />
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description (optional)" rows={2} />
        <Button type="submit" disabled={saving || !name.trim()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} New project
        </Button>
      </form>

      {list.length ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((p) => {
            const c = allItems.filter((i) => i.project_name === p.name && !i.completed).length;
            return (
              <button key={p.id} onClick={() => setSelected(p.id)} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:shadow-sm transition">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: p.color }}><FolderKanban className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.description || "—"} · {c} active</p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No projects yet. Create one to group related work.
        </div>
      )}
    </div>
  );
}