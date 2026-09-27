import React from "react";
import { Plus, Loader2, FolderKanban, Target, User, ListTodo } from "lucide-react";
import { useProjects, useItems, usePeople, invalidateAll } from "@/lib/queries";
import { entities } from "@/api/entities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import ItemList from "@/components/ItemList";
import { Link } from "react-router-dom";
import { ITEM_TYPES, ITEM_TYPE_MAP, formatDate } from "@/lib/itemTypes";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useDevicePerson } from "@/lib/devicePerson";

const COLORS = ["#0404A9", "#CFAB59", "#555D6D", "#0505C7", "#1d4ed8", "#0A0A0A"];

/** Notes and ideas don't count against incomplete progress. */
const NON_ACTIONABLE = new Set(["note", "idea"]);

function projectProgress(items) {
  const actionable = (items || []).filter((i) => !NON_ACTIONABLE.has(i.type));
  const total = actionable.length;
  const done = actionable.filter((i) => i.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, pct, open: total - done };
}

export default function Projects() {
  const { toast } = useToast();
  const { data: projects } = useProjects();
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const meName = useDevicePerson();
  const [selected, setSelected] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [owner, setOwner] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [nextAction, setNextAction] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [addOpen, setAddOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newType, setNewType] = React.useState("todo");
  const [editingMeta, setEditingMeta] = React.useState(false);
  const [metaForm, setMetaForm] = React.useState(null);

  const list = projects || [];
  const allItems = items || [];
  const peopleNames = (people || []).map((p) => p.name);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await entities.Project.create({
        name: name.trim(),
        description: desc.trim() || null,
        owner_name: owner.trim() || null,
        target_date: targetDate || null,
        next_action: nextAction.trim() || null,
        color: COLORS[list.length % COLORS.length],
      });
      await invalidateAll();
      setName(""); setDesc(""); setOwner(""); setTargetDate(""); setNextAction("");
      setAdding(false);
    } catch (err) {
      toast({ title: "Couldn't add project", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function saveMeta(e) {
    e.preventDefault();
    if (!metaForm?.id) return;
    setSaving(true);
    try {
      await entities.Project.update(metaForm.id, {
        description: metaForm.description?.trim() || null,
        owner_name: metaForm.owner_name?.trim() || null,
        target_date: metaForm.target_date || null,
        next_action: metaForm.next_action?.trim() || null,
      });
      await invalidateAll();
      setEditingMeta(false);
      toast({ title: "Project updated" });
    } catch (err) {
      toast({ title: "Couldn't update", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function addToProject(e, proj) {
    e.preventDefault();
    if (!newTitle.trim() || !proj) return;
    setSaving(true);
    try {
      await entities.Item.create({
        content: newTitle.trim(),
        type: newType,
        project_name: proj.name,
        responsible_name: meName || "",
        completed: false,
        board_status: "backlog",
        tags: [],
        inbox: false,
      });
      await invalidateAll();
      setNewTitle("");
      setAddOpen(false);
      toast({ title: "Added to project", description: proj.name });
    } catch (err) {
      toast({ title: "Couldn't add item", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (selected) {
    const proj = list.find((p) => p.id === selected);
    const theirs = allItems.filter((i) => i.project_name === proj?.name);
    const progress = projectProgress(theirs);
    const filtered = typeFilter === "all"
      ? theirs.filter((i) => !i.completed)
      : theirs.filter((i) => !i.completed && i.type === typeFilter);
    const done = theirs.filter((i) => i.completed);
    const typesPresent = [...new Set(theirs.map((i) => i.type).filter(Boolean))];

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <button type="button" onClick={() => { setSelected(null); setTypeFilter("all"); setAddOpen(false); setEditingMeta(false); }} className="text-sm text-muted-foreground hover:text-foreground mb-3 min-h-[44px]">
          ← All projects
        </button>
        <div className="flex items-start gap-3 mb-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl text-white shrink-0" style={{ background: proj?.color }}><FolderKanban className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="page-title">{proj?.name}</h1>
            {proj?.description ? (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">{proj.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">No description yet.</p>
            )}
          </div>
          <Button type="button" variant="outline" className="min-h-[44px] shrink-0" onClick={() => {
            setMetaForm({
              id: proj.id,
              description: proj.description || "",
              owner_name: proj.owner_name || "",
              target_date: proj.target_date || "",
              next_action: proj.next_action || "",
            });
            setEditingMeta(true);
          }}>
            Edit
          </Button>
        </div>

        {editingMeta && metaForm && (
          <form onSubmit={saveMeta} className="rounded-xl border border-border bg-card p-4 space-y-3 mb-6">
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea rows={2} value={metaForm.description} onChange={(e) => setMetaForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Input list="proj-people" value={metaForm.owner_name} onChange={(e) => setMetaForm((f) => ({ ...f, owner_name: e.target.value }))} placeholder="Who owns this" />
              </div>
              <div className="space-y-1.5">
                <Label>Target date</Label>
                <Input type="date" value={metaForm.target_date || ""} onChange={(e) => setMetaForm((f) => ({ ...f, target_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Next action</Label>
              <Input value={metaForm.next_action} onChange={(e) => setMetaForm((f) => ({ ...f, next_action: e.target.value }))} placeholder="Next concrete step" />
            </div>
            <datalist id="proj-people">
              {peopleNames.map((n) => <option key={n} value={n} />)}
            </datalist>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="min-h-[44px]">Save</Button>
              <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => setEditingMeta(false)}>Cancel</Button>
            </div>
          </form>
        )}

        <div className="grid gap-3 sm:grid-cols-3 mb-6">
          <div className="rounded-xl border border-border bg-card px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" /> Owner</p>
            <p className="text-sm font-medium mt-1">{proj?.owner_name || "Unassigned"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3" /> Target</p>
            <p className="text-sm font-medium mt-1">{proj?.target_date ? formatDate(proj.target_date) : "No target date"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><ListTodo className="h-3 w-3" /> Next action</p>
            <p className="text-sm font-medium mt-1">{proj?.next_action || "Not set"}</p>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Progress</p>
            <p className="text-xs text-muted-foreground">
              {progress.done}/{progress.total} actionable · notes & ideas excluded
            </p>
          </div>
          <Progress value={progress.pct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">{progress.pct}% complete</p>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          Items linked by project name. List type “Project items” is separate — see{" "}
          <Link to="/lists/project_item" className="text-primary hover:underline">Project items list</Link>.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={cn(
                "rounded-[6px] border px-2.5 min-h-[36px] text-xs font-medium",
                typeFilter === "all" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              )}
            >
              All types
            </button>
            {typesPresent.map((key) => {
              const TI = ITEM_TYPE_MAP[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={cn(
                    "rounded-[6px] border px-2.5 min-h-[36px] text-xs font-medium",
                    typeFilter === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  )}
                >
                  {TI?.plural || TI?.label || key}
                </button>
              );
            })}
          </div>
          <Button type="button" className="min-h-[44px]" onClick={() => setAddOpen((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> Add to this project
          </Button>
        </div>

        {addOpen && (
          <form onSubmit={(e) => addToProject(e, proj)} className="rounded-xl border border-border bg-card p-4 space-y-3 mb-4">
            <p className="text-xs text-muted-foreground">Project <span className="font-medium text-foreground">{proj?.name}</span> is preselected.</p>
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="What needs doing?" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="h-10 w-full rounded-[6px] border border-border bg-card px-2 text-sm"
              >
                {ITEM_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving || !newTitle.trim()} className="min-h-[44px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />} Add
              </Button>
              <Button type="button" variant="ghost" className="min-h-[44px]" onClick={() => setAddOpen(false)}>Cancel</Button>
            </div>
          </form>
        )}

        <ItemList items={filtered} emptyHint="No open items in this project yet. Add one above." />
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Owner</Label>
              <Input list="new-proj-people" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who owns this" />
            </div>
            <div className="space-y-1.5">
              <Label>Target date</Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>
          <datalist id="new-proj-people">
            {peopleNames.map((n) => <option key={n} value={n} />)}
          </datalist>
          <div className="space-y-1.5">
            <Label>Next action</Label>
            <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="First concrete step" />
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
            const theirs = allItems.filter((i) => i.project_name === p.name);
            const progress = projectProgress(theirs);
            return (
              <button key={p.id} type="button" onClick={() => setSelected(p.id)} className="flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-card p-4 text-left hover:shadow-sm transition">
                <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: p.color }}><FolderKanban className="h-[18px] w-[18px]" /></span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.owner_name ? `${p.owner_name} · ` : ""}
                    {progress.open} open · {progress.pct}%
                  </p>
                  {p.next_action && (
                    <p className="text-xs text-foreground/70 truncate mt-0.5">Next: {p.next_action}</p>
                  )}
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
