import React from "react";
import { Plus, Loader2, FolderKanban } from "lucide-react";
import { useProjects, useItems, invalidateAll } from "@/lib/queries";
import { entities } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import ItemList from "@/components/ItemList";
import { Link } from "react-router-dom";

const COLORS = ["#0404A9", "#CFAB59", "#555D6D", "#0505C7", "#1d4ed8", "#0A0A0A"];

export default function Projects() {
  const { toast } = useToast();
  const { data: projects } = useProjects();
  const { data: items } = useItems({});
  const [selected, setSelected] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [context, setContext] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const list = projects || [];
  const allItems = items || [];

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const notes = [desc.trim(), context.trim() ? `Context: ${context.trim()}` : ""].filter(Boolean).join("\n\n");
      await entities.Project.create({
        name: name.trim(),
        description: notes,
        color: COLORS[list.length % COLORS.length],
      });
      await invalidateAll();
      setName(""); setDesc(""); setContext("");
      setAdding(false);
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
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <button type="button" onClick={() => setSelected(null)} className="text-sm text-muted-foreground hover:text-foreground mb-3 min-h-[44px]">
          ← All projects
        </button>
        <div className="flex items-center gap-3 mb-2">
          <span className="grid h-11 w-11 place-items-center rounded-xl text-white" style={{ background: proj?.color }}><FolderKanban className="h-5 w-5" /></span>
          <div>
            <h1 className="page-title">{proj?.name}</h1>
            {proj?.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proj.description}</p>}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mb-6">
          Items linked by project name. List type “Project items” is separate — see{" "}
          <Link to="/lists/project_item" className="text-primary hover:underline">Project items list</Link>.
        </p>
        <ItemList items={active} emptyHint="No items in this project yet." />
        {done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground mb-2 min-h-[44px] flex items-center">{done.length} completed</summary>
            <ItemList items={done} />
          </details>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title mb-1">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Group tasks, shopping, research & deadlines. Different from the Project items list type.
          </p>
        </div>
        <Button type="button" onClick={() => setAdding((v) => !v)} className="min-h-[44px]">
          <Plus className="h-4 w-4 mr-1" /> New project
        </Button>
      </div>

      {adding && (
        <form onSubmit={add} className="rounded-xl border border-border bg-card p-4 space-y-3 mb-6">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Greenhouse build" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Short description (optional)" rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Context</Label>
            <Input value={context} onChange={(e) => setContext(e.target.value)} placeholder="Why this matters / where it happens" />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={saving || !name.trim()} className="min-h-[44px]">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} Create
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)} className="min-h-[44px]">Cancel</Button>
          </div>
        </form>
      )}

      {list.length ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((p) => {
            const c = allItems.filter((i) => i.project_name === p.name && !i.completed).length;
            return (
              <button key={p.id} type="button" onClick={() => setSelected(p.id)} className="flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:shadow-sm transition">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: p.color }}><FolderKanban className="h-[18px] w-[18px]" /></span>
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
