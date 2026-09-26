import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useSearchParams } from "react-router-dom";
import { Clock, User, FolderKanban } from "lucide-react";
import { useItems, usePeople, useProjects, invalidateAll } from "@/lib/queries";
import { entities } from "@/api/entities";
import { ITEM_TYPES, ITEM_TYPE_MAP } from "@/lib/itemTypes";
import { formatDuration } from "@/lib/durationDefaults";
import { boardStatusPatch, resolveBlockMinutes } from "@/lib/estimateDuration";
import { useToast } from "@/components/ui/use-toast";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "backlog", label: "Backlog" },
  { key: "ready", label: "Ready" },
  { key: "doing", label: "Doing" },
  { key: "done", label: "Done" },
];

function statusOf(item) {
  if (item.board_status) return item.board_status;
  return item.completed ? "done" : "backlog";
}

export default function Board() {
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = React.useState(null);

  const filterResponsible = searchParams.get("responsible") || "all";
  const filterPerson = searchParams.get("person") || "all";
  const filterProject = searchParams.get("project") || "all";
  const filterType = searchParams.get("type") || "all";

  const all = items || [];

  const filtered = React.useMemo(() => {
    return all.filter((it) => {
      // Show incomplete + recently done (done within ~14 days or still on board)
      if (it.completed && statusOf(it) === "done") {
        if (it.completed_date) {
          const age = Date.now() - new Date(it.completed_date).getTime();
          if (age > 14 * 24 * 60 * 60 * 1000) return false;
        }
      }
      if (filterResponsible !== "all" && it.responsible_name !== filterResponsible) {
        return false;
      }
      if (filterPerson !== "all" && it.person_name !== filterPerson) return false;
      if (filterProject !== "all" && it.project_name !== filterProject) return false;
      if (filterType !== "all" && it.type !== filterType) return false;
      return true;
    });
  }, [all, filterResponsible, filterPerson, filterProject, filterType]);

  const byColumn = React.useMemo(() => {
    const map = { backlog: [], ready: [], doing: [], done: [] };
    filtered.forEach((it) => {
      const s = statusOf(it);
      (map[s] || map.backlog).push(it);
    });
    return map;
  }, [filtered]);

  const responsibleNames = React.useMemo(() => {
    const s = new Set();
    all.forEach((it) => { if (it.responsible_name) s.add(it.responsible_name); });
    (people || []).forEach((p) => s.add(p.name));
    return [...s].sort();
  }, [all, people]);

  function setFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  async function onDragEnd(result) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const item = all.find((i) => i.id === draggableId);
    if (!item) return;
    const newStatus = destination.droppableId;
    if (statusOf(item) === newStatus) return;
    try {
      const patch = boardStatusPatch(newStatus);
      if (newStatus === "done" && item.duration_minutes != null && item.actual_duration_minutes == null) {
        patch.actual_duration_minutes = Number(item.duration_minutes);
      }
      await entities.Item.update(item.id, patch);
      invalidateAll();
    } catch (e) {
      toast({ title: "Move failed", description: e.message, variant: "destructive" });
    }
  }

  // Workload by responsible across doing + ready
  const workload = React.useMemo(() => {
    const map = {};
    filtered
      .filter((it) => !it.completed && (statusOf(it) === "doing" || statusOf(it) === "ready"))
      .forEach((it) => {
        const who = it.responsible_name || "Unassigned";
        map[who] = (map[who] || 0) + resolveBlockMinutes(it, all);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered, all]);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10 h-full flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Board</h1>
          <p className="text-sm text-muted-foreground">One family-shared workflow — backlog → ready → doing → done.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <FilterSelect
          label="Responsible"
          value={filterResponsible}
          onChange={(v) => setFilter("responsible", v)}
          options={[
            { value: "all", label: "All" },
            ...responsibleNames.map((n) => ({ value: n, label: n })),
          ]}
        />
        <FilterSelect
          label="Person"
          value={filterPerson}
          onChange={(v) => setFilter("person", v)}
          options={[
            { value: "all", label: "All people" },
            ...(people || []).map((p) => ({ value: p.name, label: p.name })),
          ]}
        />
        <FilterSelect
          label="Project"
          value={filterProject}
          onChange={(v) => setFilter("project", v)}
          options={[
            { value: "all", label: "All projects" },
            ...(projects || []).map((p) => ({ value: p.name, label: p.name })),
          ]}
        />
        <FilterSelect
          label="Type"
          value={filterType}
          onChange={(v) => setFilter("type", v)}
          options={[
            { value: "all", label: "All types" },
            ...ITEM_TYPES.map((t) => ({ value: t.key, label: t.label })),
          ]}
        />
      </div>

      {workload.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card px-3 py-2 flex flex-wrap gap-4">
          <span className="text-xs font-medium text-muted-foreground self-center">Workload (ready + doing)</span>
          {workload.map(([name, mins]) => (
            <span key={name} className="text-xs">
              <span className="font-medium">{name}</span>{" "}
              <span className="text-muted-foreground">{formatDuration(mins)}</span>
            </span>
          ))}
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin flex-1 min-h-0">
          {COLUMNS.map((col) => (
            <Droppable droppableId={col.key} key={col.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    "w-[260px] sm:w-[280px] shrink-0 flex flex-col rounded-2xl border border-border bg-muted/30 max-h-[calc(100vh-220px)]",
                    snapshot.isDraggingOver && "border-brand bg-brand/5"
                  )}
                >
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                    <h2 className="text-sm font-semibold">{col.label}</h2>
                    <span className="text-[11px] text-muted-foreground tabular-nums">{byColumn[col.key].length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                    {byColumn[col.key].map((it, index) => {
                      const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
                      const Icon = TI.icon;
                      const dur = it.duration_minutes != null ? formatDuration(it.duration_minutes) : null;
                      return (
                        <Draggable key={it.id} draggableId={it.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                              onClick={() => setActive(it)}
                              className={cn(
                                "rounded-xl border border-border bg-card p-2.5 cursor-grab active:cursor-grabbing shadow-sm",
                                dragSnapshot.isDragging && "shadow-md ring-2 ring-brand/30"
                              )}
                            >
                              <div className="flex items-start gap-2">
                                <span className={cn("mt-0.5 grid h-6 w-6 place-items-center rounded-md border shrink-0", TI.tone)}>
                                  <Icon className="h-3.5 w-3.5" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className={cn("text-sm font-medium leading-snug", it.completed && "line-through opacity-60")}>
                                    {it.content}
                                  </p>
                                  <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                    {dur && (
                                      <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{dur}</span>
                                    )}
                                    {it.responsible_name && (
                                      <span className="inline-flex items-center gap-0.5"><User className="h-3 w-3" />{it.responsible_name}</span>
                                    )}
                                    {it.project_name && (
                                      <span className="inline-flex items-center gap-0.5"><FolderKanban className="h-3 w-3" />{it.project_name}</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>

      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="sr-only sm:not-sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
