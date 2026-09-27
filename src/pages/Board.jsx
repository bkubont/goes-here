import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useSearchParams } from "react-router-dom";
import {
  Clock, User, FolderKanban, Filter, MoreVertical, Plus, ChevronDown,
  Settings2, Trash2, Pencil, GripVertical, Columns3,
} from "lucide-react";
import {
  useItems, usePeople, useProjects, useBoards, useBoardColumns, useBoardSwimlanes,
  invalidateAll, patchItemsCaches,
} from "@/lib/queries";
import { entities } from "@/api/entities";
import { ITEM_TYPES, ITEM_TYPE_MAP } from "@/lib/itemTypes";
import { formatDuration } from "@/lib/durationDefaults";
import { resolveBlockMinutes } from "@/lib/estimateDuration";
import {
  BOARD_TEMPLATES, SWIMLANE_MODES, boardColumnPatch, columnForItem,
  createBoardFromTemplate, ensureDefaultBoard, filterItemsForBoard,
  itemSwimlaneKey, loadLastBoardId, resolveSwimlanes, saveLastBoardId,
  sortByPosition, statusKeyOf,
} from "@/lib/boards";
import { useToast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { loadBoardFilters, saveBoardFilters, SAVED_FILTERS_HINT } from "@/lib/savedFilters";
import { resolvePersonColor, personChipDotStyle } from "@/lib/personColor";

function slugStatusKey(name, used) {
  let base = String(name || "column")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || "column";
  let key = base;
  let n = 2;
  while (used.has(key)) {
    key = `${base}_${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

export default function Board() {
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const { data: boards, isLoading: boardsLoading } = useBoards();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = React.useState(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [restored, setRestored] = React.useState(false);
  const [ensuring, setEnsuring] = React.useState(false);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createTemplate, setCreateTemplate] = React.useState("task_workflow");
  const [createProjectId, setCreateProjectId] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const [renameOpen, setRenameOpen] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState("");
  const [columnsOpen, setColumnsOpen] = React.useState(false);
  const [deleteBoardTarget, setDeleteBoardTarget] = React.useState(null);
  const [deletingBoard, setDeletingBoard] = React.useState(false);

  const boardIdFromUrl = searchParams.get("board") || "";
  const sortedBoards = React.useMemo(() => sortByPosition(boards), [boards]);

  const activeBoard = React.useMemo(() => {
    if (!sortedBoards.length) return null;
    if (boardIdFromUrl) {
      const found = sortedBoards.find((b) => b.id === boardIdFromUrl);
      if (found) return found;
    }
    const last = loadLastBoardId();
    if (last) {
      const found = sortedBoards.find((b) => b.id === last);
      if (found) return found;
    }
    return sortedBoards[0];
  }, [sortedBoards, boardIdFromUrl]);

  const { data: columnsRaw } = useBoardColumns(activeBoard?.id);
  const { data: swimlanesRaw } = useBoardSwimlanes(activeBoard?.id);
  const columns = React.useMemo(() => sortByPosition(columnsRaw), [columnsRaw]);
  const customLanes = React.useMemo(() => sortByPosition(swimlanesRaw), [swimlanesRaw]);

  const [stage, setStage] = React.useState(() => searchParams.get("stage") || "");

  React.useEffect(() => {
    if (!columns.length) return;
    const urlStage = searchParams.get("stage");
    if (urlStage && columns.some((c) => c.status_key === urlStage)) {
      setStage(urlStage);
    } else if (!stage || !columns.some((c) => c.status_key === stage)) {
      setStage(columns[0].status_key);
    }
  }, [columns, searchParams, stage]);

  // Seed default board if migration not applied yet / empty.
  React.useEffect(() => {
    if (boardsLoading || ensuring) return;
    if (boards && boards.length === 0) {
      setEnsuring(true);
      ensureDefaultBoard()
        .then(() => invalidateAll())
        .catch((err) => {
          toast({
            title: "Could not create default board",
            description: `${err.message}. Run the multi-boards migration in Supabase if tables are missing.`,
            variant: "destructive",
          });
        })
        .finally(() => setEnsuring(false));
    }
  }, [boards, boardsLoading, ensuring, toast]);

  React.useEffect(() => {
    if (!activeBoard) return;
    saveLastBoardId(activeBoard.id);
    if (boardIdFromUrl !== activeBoard.id) {
      const next = new URLSearchParams(searchParams);
      next.set("board", activeBoard.id);
      setSearchParams(next, { replace: true });
    }
  }, [activeBoard, boardIdFromUrl, searchParams, setSearchParams]);

  // Restore last-used filters from this device when the URL has none.
  React.useEffect(() => {
    if (restored) return;
    const hasUrlFilter = ["responsible", "person", "project", "type"].some((k) => searchParams.get(k));
    if (!hasUrlFilter) {
      const saved = loadBoardFilters();
      const next = new URLSearchParams(searchParams);
      let changed = false;
      Object.entries(saved).forEach(([k, v]) => {
        if (v && v !== "all") {
          next.set(k, v);
          changed = true;
        }
      });
      if (changed) setSearchParams(next, { replace: true });
    }
    setRestored(true);
  }, [restored, searchParams, setSearchParams]);

  const filterResponsible = searchParams.get("responsible") || "all";
  const filterPerson = searchParams.get("person") || "all";
  const filterProject = searchParams.get("project") || "all";
  const filterType = searchParams.get("type") || "all";

  React.useEffect(() => {
    if (!restored) return;
    saveBoardFilters({
      responsible: filterResponsible,
      person: filterPerson,
      project: filterProject,
      type: filterType,
    });
  }, [filterResponsible, filterPerson, filterProject, filterType, restored]);

  const all = items || [];
  const boardItems = React.useMemo(
    () => filterItemsForBoard(all, activeBoard, sortedBoards),
    [all, activeBoard, sortedBoards]
  );

  const filtered = React.useMemo(() => {
    return boardItems.filter((it) => {
      const col = columnForItem(it, columns);
      if (col?.is_done || (it.completed && statusKeyOf(it, columns) === (col?.status_key || "done"))) {
        if (it.completed_date) {
          const age = Date.now() - new Date(it.completed_date).getTime();
          if (age > 14 * 24 * 60 * 60 * 1000) return false;
        }
      }
      if (filterResponsible !== "all" && it.responsible_name !== filterResponsible) return false;
      if (filterPerson !== "all" && it.person_name !== filterPerson) return false;
      if (filterProject !== "all" && it.project_name !== filterProject) return false;
      if (filterType !== "all" && it.type !== filterType) return false;
      return true;
    });
  }, [boardItems, columns, filterResponsible, filterPerson, filterProject, filterType]);

  const swimlaneMode = activeBoard?.swimlane_mode || "none";
  const swimlanes = React.useMemo(
    () => resolveSwimlanes(swimlaneMode, filtered, customLanes),
    [swimlaneMode, filtered, customLanes]
  );

  const byColumn = React.useMemo(() => {
    const map = {};
    columns.forEach((c) => { map[c.status_key] = []; });
    filtered.forEach((it) => {
      const key = statusKeyOf(it, columns);
      if (!map[key]) map[key] = [];
      map[key].push(it);
    });
    return map;
  }, [filtered, columns]);

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

  function selectBoard(id) {
    const next = new URLSearchParams(searchParams);
    next.set("board", id);
    setSearchParams(next, { replace: true });
    saveLastBoardId(id);
  }

  async function moveToColumn(item, column) {
    if (!column || !activeBoard) return;
    const current = columnForItem(item, columns);
    if (current?.id === column.id && item.board_id === activeBoard.id) return;

    const previous = {
      completed: !!item.completed,
      completed_date: item.completed_date ?? null,
      board_status: statusKeyOf(item, columns),
      board_id: item.board_id ?? null,
      board_column_id: item.board_column_id ?? null,
      swimlane_key: item.swimlane_key ?? null,
      actual_duration_minutes: item.actual_duration_minutes ?? null,
    };
    try {
      const patch = boardColumnPatch(column, { boardId: activeBoard.id, item });
      if (column.is_done && item.duration_minutes != null && item.actual_duration_minutes == null) {
        patch.actual_duration_minutes = Number(item.duration_minutes);
      }
      const row = await entities.Item.update(item.id, patch);
      patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
      await invalidateAll();
      if (column.is_done && !item.completed) {
        toast({
          title: "Completed",
          description: item.content,
          duration: 8000,
          action: (
            <ToastAction
              altText="Undo"
              onClick={async () => {
                try {
                  const restoredRow = await entities.Item.update(item.id, previous);
                  patchItemsCaches((list) =>
                    list.map((i) => (i.id === item.id ? { ...i, ...restoredRow } : i))
                  );
                  await invalidateAll();
                  toast({ title: "Restored" });
                } catch (err) {
                  toast({ title: "Couldn't undo", description: err.message, variant: "destructive" });
                }
              }}
            >
              Undo
            </ToastAction>
          ),
        });
      }
    } catch (e) {
      toast({ title: "Move failed", description: e.message, variant: "destructive" });
    }
  }

  async function onDragEnd(result) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const item = all.find((i) => i.id === draggableId);
    if (!item) return;
    // droppableId = `${laneKey}::${statusKey}` or just statusKey when no swimlanes
    const destParts = destination.droppableId.split("::");
    const statusKey = destParts.length > 1 ? destParts[1] : destParts[0];
    const laneKey = destParts.length > 1 ? destParts[0] : null;
    const column = columns.find((c) => c.status_key === statusKey);
    if (!column) return;

    if (swimlaneMode !== "none" && laneKey && laneKey !== "__all__") {
      const prevCol = columnForItem(item, columns);
      if (prevCol?.id === column.id && itemSwimlaneKey(item, swimlaneMode) === laneKey) return;
      try {
        const patch = boardColumnPatch(column, {
          boardId: activeBoard.id,
          swimlaneKey: swimlaneMode === "custom" ? (laneKey === "__none__" ? null : laneKey) : undefined,
          item,
        });
        // person/project swimlanes are derived — update the source field when dragging between lanes
        if (swimlaneMode === "person") {
          patch.responsible_name = laneKey === "__unassigned__" ? null : laneKey;
        } else if (swimlaneMode === "project") {
          patch.project_name = laneKey === "__none__" ? null : laneKey;
        }
        const row = await entities.Item.update(item.id, patch);
        patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
        await invalidateAll();
      } catch (e) {
        toast({ title: "Move failed", description: e.message, variant: "destructive" });
      }
      return;
    }
    await moveToColumn(item, column);
  }

  const workload = React.useMemo(() => {
    const map = {};
    const activeKeys = new Set(
      columns.filter((c) => !c.is_done && (c.status_key === "doing" || c.status_key === "ready" || columns.indexOf(c) >= columns.length - 3)).map((c) => c.status_key)
    );
    // Prefer ready/doing by key; else non-done columns except first (backlog-ish)
    const prefer = columns.filter((c) => !c.is_done && (c.status_key === "doing" || c.status_key === "ready"));
    const workCols = prefer.length
      ? new Set(prefer.map((c) => c.status_key))
      : new Set(columns.filter((c) => !c.is_done).slice(1).map((c) => c.status_key));
    filtered
      .filter((it) => !it.completed && workCols.has(statusKeyOf(it, columns)))
      .forEach((it) => {
        const who = it.responsible_name || "Unassigned";
        map[who] = (map[who] || 0) + resolveBlockMinutes(it, all);
      });
    void activeKeys;
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filtered, all, columns]);

  const filterActive = [filterResponsible, filterPerson, filterProject, filterType].some((v) => v !== "all");

  async function handleCreateBoard() {
    setCreating(true);
    try {
      const project = (projects || []).find((p) => p.id === createProjectId);
      if (createTemplate === "project" && !project) {
        toast({ title: "Pick a project", description: "Project boards need a linked project.", variant: "destructive" });
        setCreating(false);
        return;
      }
      const { board } = await createBoardFromTemplate({
        name: createName.trim() || undefined,
        templateId: createTemplate,
        projectId: project?.id || null,
        projectName: project?.name || null,
      });
      await invalidateAll();
      setCreateOpen(false);
      setCreateName("");
      setCreateTemplate("task_workflow");
      setCreateProjectId("");
      selectBoard(board.id);
      toast({ title: "Board created", description: board.name });
    } catch (e) {
      toast({ title: "Could not create board", description: e.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  }

  async function handleRenameBoard() {
    if (!activeBoard || !renameValue.trim()) return;
    try {
      await entities.Board.update(activeBoard.id, { name: renameValue.trim() });
      await invalidateAll();
      setRenameOpen(false);
      toast({ title: "Board renamed" });
    } catch (e) {
      toast({ title: "Rename failed", description: e.message, variant: "destructive" });
    }
  }

  async function handleDeleteBoard() {
    if (!deleteBoardTarget) return;
    setDeletingBoard(true);
    try {
      // Clear item membership before delete (FK set null, but keep status).
      const onBoard = all.filter((it) => it.board_id === deleteBoardTarget.id);
      await Promise.all(
        onBoard.map((it) =>
          entities.Item.update(it.id, {
            board_id: null,
            board_column_id: null,
          })
        )
      );
      await entities.Board.delete(deleteBoardTarget.id);
      await invalidateAll();
      setDeleteBoardTarget(null);
      toast({ title: "Board deleted", description: deleteBoardTarget.name });
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setDeletingBoard(false);
    }
  }

  async function setSwimlaneMode(mode) {
    if (!activeBoard || mode === activeBoard.swimlane_mode) return;
    try {
      await entities.Board.update(activeBoard.id, { swimlane_mode: mode });
      await invalidateAll();
    } catch (e) {
      toast({ title: "Could not update swimlanes", description: e.message, variant: "destructive" });
    }
  }

  function BoardCard({ it, dragProvided, dragSnapshot }) {
    const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
    const Icon = TI.icon;
    const dur = it.duration_minutes != null ? formatDuration(it.duration_minutes) : null;
    const currentKey = statusKeyOf(it, columns);
    // Hierarchy: Board column/swimlane chrome wins — do not paint cards with
    // list/person/project custom colors. Person chip stays a subtle dot only.
    const personColor = resolvePersonColor(it.responsible_name, people);
    return (
      <div
        ref={dragProvided?.innerRef}
        {...(dragProvided?.draggableProps || {})}
        {...(dragProvided?.dragHandleProps || {})}
        className={cn(
          "rounded-xl border border-border bg-card p-2.5 shadow-sm",
          dragSnapshot?.isDragging && "shadow-md ring-2 ring-primary/30"
        )}
      >
        <div className="flex items-start gap-2">
          <button type="button" onClick={() => setActive(it)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
            <span className={cn("mt-0.5 grid h-6 w-6 place-items-center rounded-[4px] border shrink-0", TI.tone)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium leading-snug", it.completed && "line-through opacity-60")}>
                {it.content}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                {dur && <span className="inline-flex items-center gap-0.5"><Clock className="h-3 w-3" />{dur}</span>}
                {it.responsible_name && (
                  <span className="inline-flex items-center gap-0.5">
                    {personColor ? (
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={personChipDotStyle(personColor)}
                        aria-hidden
                      />
                    ) : (
                      <User className="h-3 w-3" />
                    )}
                    {it.responsible_name}
                  </span>
                )}
                {it.project_name && <span className="inline-flex items-center gap-0.5"><FolderKanban className="h-3 w-3" />{it.project_name}</span>}
              </div>
            </div>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent"
                aria-label="Change status"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columns.map((col) => (
                <DropdownMenuItem
                  key={col.id}
                  disabled={currentKey === col.status_key}
                  onClick={() => moveToColumn(it, col)}
                >
                  {col.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  }

  const filterBar = (
    <div className="flex flex-wrap gap-2">
      <FilterSelect
        label="Assigned to"
        value={filterResponsible}
        onChange={(v) => setFilter("responsible", v)}
        options={[
          { value: "all", label: "All" },
          ...responsibleNames.map((n) => ({ value: n, label: n })),
        ]}
      />
      <FilterSelect
        label="About"
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
  );

  function itemsInLaneColumn(laneKey, statusKey) {
    return (byColumn[statusKey] || []).filter((it) => {
      if (swimlaneMode === "none") return true;
      return itemSwimlaneKey(it, swimlaneMode) === laneKey;
    });
  }

  function renderDesktopBoard() {
    if (swimlaneMode === "none") {
      return (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin flex-1 min-h-0">
            {columns.map((col) => (
              <Droppable droppableId={col.status_key} key={col.id}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "w-[260px] sm:w-[280px] shrink-0 flex flex-col rounded-xl border border-border bg-muted/30 max-h-[calc(100vh-240px)]",
                      snapshot.isDraggingOver && "border-primary bg-primary/5"
                    )}
                  >
                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
                      <h2 className="text-sm font-semibold">{col.name}</h2>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {(byColumn[col.status_key] || []).length}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                      {(byColumn[col.status_key] || []).map((it, index) => (
                        <Draggable key={it.id} draggableId={it.id} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <BoardCard it={it} dragProvided={dragProvided} dragSnapshot={dragSnapshot} />
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      );
    }

    return (
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-auto pb-4 scrollbar-thin min-h-0 space-y-4">
          {swimlanes.map((lane) => (
            <div key={lane.key} className="min-w-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 px-0.5">
                {lane.label}
              </h3>
              <div className="flex gap-3 overflow-x-auto scrollbar-thin">
                {columns.map((col) => {
                  const laneItems = itemsInLaneColumn(lane.key, col.status_key);
                  const dropId = `${lane.key}::${col.status_key}`;
                  return (
                    <Droppable droppableId={dropId} key={dropId}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={cn(
                            "w-[240px] shrink-0 flex flex-col rounded-xl border border-border bg-muted/30 min-h-[120px] max-h-[360px]",
                            snapshot.isDraggingOver && "border-primary bg-primary/5"
                          )}
                        >
                          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                            <h2 className="text-sm font-semibold">{col.name}</h2>
                            <span className="text-[11px] text-muted-foreground tabular-nums">{laneItems.length}</span>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin">
                            {laneItems.map((it, index) => (
                              <Draggable key={it.id} draggableId={it.id} index={index}>
                                {(dragProvided, dragSnapshot) => (
                                  <BoardCard it={it} dragProvided={dragProvided} dragSnapshot={dragSnapshot} />
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        </div>
                      )}
                    </Droppable>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </DragDropContext>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8 h-full flex flex-col">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] border border-border bg-card px-2.5 min-h-[40px] text-left hover:bg-accent"
                >
                  <Columns3 className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-heading text-lg font-semibold truncate">
                    {activeBoard?.name || "Board"}
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[220px]">
                {sortedBoards.map((b) => (
                  <DropdownMenuItem
                    key={b.id}
                    onClick={() => selectBoard(b.id)}
                    className={cn(b.id === activeBoard?.id && "bg-accent")}
                  >
                    {b.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> New board…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="min-h-[40px]">
                  <Settings2 className="h-4 w-4 mr-1.5" /> Manage
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  onClick={() => {
                    setRenameValue(activeBoard?.name || "");
                    setRenameOpen(true);
                  }}
                  disabled={!activeBoard}
                >
                  <Pencil className="h-4 w-4 mr-2" /> Rename board
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setColumnsOpen(true)} disabled={!activeBoard}>
                  <Columns3 className="h-4 w-4 mr-2" /> Edit columns
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {SWIMLANE_MODES.map((m) => (
                  <DropdownMenuItem
                    key={m.value}
                    onClick={() => setSwimlaneMode(m.value)}
                    className={cn(swimlaneMode === m.value && "bg-accent")}
                  >
                    Swimlanes: {m.label}
                  </DropdownMenuItem>
                ))}
                {swimlaneMode === "custom" && (
                  <DropdownMenuItem onClick={() => setColumnsOpen(true)}>
                    Edit custom swimlanes…
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteBoardTarget(activeBoard)}
                  disabled={!activeBoard || sortedBoards.length <= 1}
                >
                  <Trash2 className="h-4 w-4 mr-2" /> Delete board
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-sm text-muted-foreground">
            {activeBoard?.kind === "project" && activeBoard?.filter_json?.project_name
              ? `Project · ${activeBoard.filter_json.project_name}`
              : "Drag cards or change status from the menu. Multiple boards supported."}
          </p>
        </div>
        <Button
          type="button"
          variant={filtersOpen || filterActive ? "default" : "outline"}
          className="min-h-[44px]"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <Filter className="h-4 w-4 mr-1.5" />
          Filters{filterActive ? " · on" : ""}
        </Button>
      </div>

      {(filtersOpen || (!isMobile && filterActive)) && (
        <div className="mb-4 space-y-1.5">
          {filterBar}
          <p className="text-[11px] text-muted-foreground">{SAVED_FILTERS_HINT} (type, person, assigned, project).</p>
        </div>
      )}
      {!isMobile && !filtersOpen && !filterActive && (
        <div className="mb-4 hidden md:block space-y-1.5">
          {filterBar}
          <p className="text-[11px] text-muted-foreground">{SAVED_FILTERS_HINT} (type, person, assigned, project).</p>
        </div>
      )}

      {workload.length > 0 && (
        <div className="mb-4 rounded-xl border border-border bg-card px-3 py-2 flex flex-wrap gap-4">
          <span className="text-xs font-medium text-muted-foreground self-center">Workload (in progress)</span>
          {workload.map(([name, mins]) => (
            <span key={name} className="text-xs">
              <span className="font-medium">{name}</span>{" "}
              <span className="text-muted-foreground">{formatDuration(mins)}</span>
            </span>
          ))}
        </div>
      )}

      {!columns.length ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          {boardsLoading || ensuring
            ? "Loading boards…"
            : "No columns yet. Use Manage → Edit columns, or run the multi-boards migration."}
        </div>
      ) : isMobile ? (
        <>
          <div className="flex gap-1 mb-3 overflow-x-auto scrollbar-thin pb-1">
            {columns.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => setStage(col.status_key)}
                className={cn(
                  "shrink-0 min-h-[44px] rounded-[6px] px-3 text-sm font-medium border",
                  stage === col.status_key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                {col.name} ({(byColumn[col.status_key] || []).length})
              </button>
            ))}
          </div>
          {swimlaneMode !== "none" ? (
            <div className="space-y-4 flex-1 overflow-y-auto pb-4">
              {swimlanes.map((lane) => {
                const laneItems = itemsInLaneColumn(lane.key, stage);
                return (
                  <div key={lane.key}>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {lane.label}
                    </h3>
                    <div className="space-y-2">
                      {laneItems.map((it) => (
                        <BoardCard key={it.id} it={it} />
                      ))}
                      {!laneItems.length && (
                        <p className="text-xs text-muted-foreground py-2">Empty</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 flex-1 overflow-y-auto pb-4">
              {(byColumn[stage] || []).map((it) => (
                <BoardCard key={it.id} it={it} />
              ))}
              {!(byColumn[stage] || []).length && (
                <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
                  Nothing in {columns.find((c) => c.status_key === stage)?.name || stage}.
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        renderDesktopBoard()
      )}

      <ItemDetailDrawer
        item={active}
        open={!!active}
        onOpenChange={(o) => !o && setActive(null)}
        activeBoardId={activeBoard?.id || null}
      />

      {/* Create board */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New board</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Name</span>
              <Input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Tasks only"
                className="min-h-[44px]"
              />
            </label>
            <fieldset className="space-y-2">
              <legend className="text-xs font-medium text-muted-foreground mb-1">Template</legend>
              {BOARD_TEMPLATES.map((t) => (
                <label
                  key={t.id}
                  className={cn(
                    "flex gap-3 rounded-xl border px-3 py-2.5 cursor-pointer",
                    createTemplate === t.id ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <input
                    type="radio"
                    name="board-template"
                    className="mt-1"
                    checked={createTemplate === t.id}
                    onChange={() => setCreateTemplate(t.id)}
                  />
                  <span>
                    <span className="text-sm font-medium block">{t.label}</span>
                    <span className="text-xs text-muted-foreground">{t.description}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            {createTemplate === "project" && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Project</span>
                <select
                  value={createProjectId}
                  onChange={(e) => setCreateProjectId(e.target.value)}
                  className="w-full h-11 rounded-[6px] border border-border bg-card px-2 text-sm"
                >
                  <option value="">Select project…</option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleCreateBoard} disabled={creating}>
              {creating ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename board</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="min-h-[44px]"
            onKeyDown={(e) => e.key === "Enter" && handleRenameBoard()}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleRenameBoard}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Columns + custom swimlanes editor */}
      <ColumnsEditorDialog
        open={columnsOpen}
        onOpenChange={setColumnsOpen}
        board={activeBoard}
        columns={columns}
        customLanes={customLanes}
        items={boardItems}
        toast={toast}
      />

      <AlertDialog open={!!deleteBoardTarget} onOpenChange={(o) => !o && setDeleteBoardTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleteBoardTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Cards stay in GoesHere but leave this board. Columns and swimlanes are removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingBoard}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteBoard();
              }}
              disabled={deletingBoard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingBoard ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 min-h-[40px] rounded-[6px] border border-border bg-card px-2 text-xs text-foreground"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function ColumnsEditorDialog({ open, onOpenChange, board, columns, customLanes, items, toast }) {
  const [draftCols, setDraftCols] = React.useState([]);
  const [draftLanes, setDraftLanes] = React.useState([]);
  const [saving, setSaving] = React.useState(false);
  const [deleteCol, setDeleteCol] = React.useState(null);
  const [moveTarget, setMoveTarget] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setDraftCols(columns.map((c) => ({ ...c })));
    setDraftLanes(customLanes.map((l) => ({ ...l })));
    setDeleteCol(null);
    setMoveTarget("");
  }, [open, columns, customLanes]);

  function moveCol(idx, dir) {
    const next = [...draftCols];
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraftCols(next.map((c, i) => ({ ...c, position: i })));
  }

  function moveLane(idx, dir) {
    const next = [...draftLanes];
    const j = dir === "up" ? idx - 1 : idx + 1;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setDraftLanes(next.map((l, i) => ({ ...l, position: i })));
  }

  async function saveAll() {
    if (!board) return;
    if (!draftCols.length) {
      toast({ title: "Need at least one column", variant: "destructive" });
      return;
    }
    if (!draftCols.some((c) => c.is_done)) {
      toast({ title: "Mark one column as Done", description: "Completion sync needs a done column.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const used = new Set();
      const existingIds = new Set(columns.map((c) => c.id));
      const keptIds = new Set(draftCols.filter((c) => c.id).map((c) => c.id));
      const oldDone = columns.find((c) => c.is_done) || null;
      const savedCols = [];

      // Create / update columns
      for (let i = 0; i < draftCols.length; i += 1) {
        const c = draftCols[i];
        const status_key = c.status_key && !used.has(c.status_key)
          ? (used.add(c.status_key), c.status_key)
          : slugStatusKey(c.name, used);
        const payload = {
          name: c.name.trim() || `Column ${i + 1}`,
          position: i,
          status_key,
          is_done: !!c.is_done,
          board_id: board.id,
        };
        if (c.id && existingIds.has(c.id)) {
          savedCols.push(await entities.BoardColumn.update(c.id, payload));
        } else {
          savedCols.push(await entities.BoardColumn.create(payload));
        }
      }
      // Delete removed columns — cards should already be moved if deleteCol flow used;
      // for bulk save, move orphans to first remaining column.
      for (const old of columns) {
        if (!keptIds.has(old.id)) {
          const fallback = savedCols[0] || draftCols.find((c) => c.id) || draftCols[0];
          const orphans = (items || []).filter((it) => it.board_column_id === old.id);
          if (fallback?.id) {
            await Promise.all(
              orphans.map((it) =>
                entities.Item.update(it.id, boardColumnPatch(fallback, { boardId: board.id, item: it }))
              )
            );
          }
          await entities.BoardColumn.delete(old.id);
        }
      }

      // Reconcile completed flags when the done column designation changes.
      const newDone = savedCols.find((c) => c.is_done) || null;
      if (newDone && (!oldDone || oldDone.id !== newDone.id)) {
        const boardItems = (items || []).filter(
          (it) => it.board_id === board.id || it.board_column_id
        );
        await Promise.all(
          boardItems.map(async (it) => {
            if (it.board_column_id === newDone.id && !it.completed) {
              return entities.Item.update(it.id, {
                completed: true,
                completed_date: it.completed_date || new Date().toISOString(),
                board_status: newDone.status_key,
                board_column_id: newDone.id,
              });
            }
            if (
              oldDone
              && it.board_column_id === oldDone.id
              && it.completed
              && oldDone.id !== newDone.id
            ) {
              const openCol = savedCols.find((c) => c.id === oldDone.id) || savedCols.find((c) => !c.is_done);
              if (!openCol || openCol.is_done) return null;
              return entities.Item.update(it.id, {
                completed: false,
                completed_date: null,
                board_status: openCol.status_key,
                board_column_id: openCol.id,
              });
            }
            return null;
          })
        );
      }

      if (board.swimlane_mode === "custom") {
        const existingLaneIds = new Set(customLanes.map((l) => l.id));
        const keptLaneIds = new Set(draftLanes.filter((l) => l.id).map((l) => l.id));
        const usedKeys = new Set();
        for (let i = 0; i < draftLanes.length; i += 1) {
          const l = draftLanes[i];
          const lane_key = l.lane_key && !usedKeys.has(l.lane_key)
            ? (usedKeys.add(l.lane_key), l.lane_key)
            : slugStatusKey(l.name, usedKeys);
          const payload = {
            board_id: board.id,
            name: l.name.trim() || `Lane ${i + 1}`,
            position: i,
            lane_key,
          };
          if (l.id && existingLaneIds.has(l.id)) {
            await entities.BoardSwimlane.update(l.id, payload);
          } else {
            await entities.BoardSwimlane.create(payload);
          }
        }
        for (const old of customLanes) {
          if (!keptLaneIds.has(old.id)) {
            // Clear lane keys so resolveSwimlanes does not resurrect the deleted lane.
            const laneItems = (items || []).filter(
              (it) => it.swimlane_key === old.lane_key
                && (!it.board_id || it.board_id === board.id)
            );
            await Promise.all(
              laneItems.map((it) => entities.Item.update(it.id, { swimlane_key: null }))
            );
            await entities.BoardSwimlane.delete(old.id);
          }
        }
      }

      await invalidateAll();
      onOpenChange(false);
      toast({ title: "Board updated" });
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteColumn() {
    if (!deleteCol) return;
    const target = draftCols.find((c) => c.id === moveTarget || c.status_key === moveTarget);
    if (deleteCol.id && (!target || target.id === deleteCol.id)) {
      toast({ title: "Pick a column to move cards into", variant: "destructive" });
      return;
    }
    if (deleteCol.id) {
      try {
        const orphans = (items || []).filter((it) => it.board_column_id === deleteCol.id);
        await Promise.all(
          orphans.map((it) =>
            entities.Item.update(it.id, boardColumnPatch(target, { boardId: board.id, item: it }))
          )
        );
        await entities.BoardColumn.delete(deleteCol.id);
        await invalidateAll();
      } catch (e) {
        toast({ title: "Could not delete column", description: e.message, variant: "destructive" });
        return;
      }
    }
    setDraftCols((prev) => prev.filter((c) => c !== deleteCol && c.id !== deleteCol.id).map((c, i) => ({ ...c, position: i })));
    setDeleteCol(null);
    setMoveTarget("");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit columns{board?.swimlane_mode === "custom" ? " & swimlanes" : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Columns</p>
              {draftCols.map((c, idx) => (
                <div key={c.id || `new-${idx}`} className="flex items-center gap-1.5">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
                  <Input
                    value={c.name}
                    onChange={(e) => {
                      const next = [...draftCols];
                      next[idx] = { ...c, name: e.target.value };
                      setDraftCols(next);
                    }}
                    className="min-h-[40px] flex-1"
                  />
                  <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                    <input
                      type="radio"
                      name="done-col"
                      checked={!!c.is_done}
                      onChange={() => {
                        setDraftCols(draftCols.map((col, i) => ({ ...col, is_done: i === idx })));
                      }}
                    />
                    Done
                  </label>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent" onClick={() => moveCol(idx, "up")} aria-label="Move up">↑</button>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent" onClick={() => moveCol(idx, "down")} aria-label="Move down">↓</button>
                  <button
                    type="button"
                    className="grid h-9 w-9 place-items-center rounded-[6px] text-destructive hover:bg-accent"
                    onClick={() => {
                      if (draftCols.length <= 1) {
                        toast({ title: "Keep at least one column", variant: "destructive" });
                        return;
                      }
                      setDeleteCol(c);
                      setMoveTarget(draftCols.find((x) => x !== c)?.id || draftCols.find((x) => x !== c)?.status_key || "");
                    }}
                    aria-label="Delete column"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-[40px]"
                onClick={() => {
                  const used = new Set(draftCols.map((c) => c.status_key).filter(Boolean));
                  setDraftCols([
                    ...draftCols,
                    {
                      name: "New column",
                      status_key: slugStatusKey("new_column", used),
                      is_done: false,
                      position: draftCols.length,
                    },
                  ]);
                }}
              >
                <Plus className="h-4 w-4 mr-1" /> Add column
              </Button>
            </div>

            {board?.swimlane_mode === "custom" && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Custom swimlanes</p>
                {draftLanes.map((l, idx) => (
                  <div key={l.id || `lane-${idx}`} className="flex items-center gap-1.5">
                    <Input
                      value={l.name}
                      onChange={(e) => {
                        const next = [...draftLanes];
                        next[idx] = { ...l, name: e.target.value };
                        setDraftLanes(next);
                      }}
                      className="min-h-[40px] flex-1"
                    />
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent" onClick={() => moveLane(idx, "up")}>↑</button>
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent" onClick={() => moveLane(idx, "down")}>↓</button>
                    <button
                      type="button"
                      className="grid h-9 w-9 place-items-center rounded-[6px] text-destructive hover:bg-accent"
                      onClick={() => setDraftLanes(draftLanes.filter((_, i) => i !== idx))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-[40px]"
                  onClick={() => {
                    const used = new Set(draftLanes.map((l) => l.lane_key).filter(Boolean));
                    setDraftLanes([
                      ...draftLanes,
                      { name: "New lane", lane_key: slugStatusKey("lane", used), position: draftLanes.length },
                    ]);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add swimlane
                </Button>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" onClick={saveAll} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteCol} onOpenChange={(o) => !o && setDeleteCol(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete column “{deleteCol?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Move its cards to another column first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="block text-sm space-y-1.5">
            <span className="text-muted-foreground">Move cards to</span>
            <select
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
              className="w-full h-11 rounded-[6px] border border-border bg-card px-2"
            >
              {draftCols
                .filter((c) => c !== deleteCol && c.id !== deleteCol?.id)
                .map((c) => (
                  <option key={c.id || c.status_key} value={c.id || c.status_key}>{c.name}</option>
                ))}
            </select>
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteColumn();
              }}
            >
              Delete column
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
