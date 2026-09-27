// Board templates, swimlane helpers, and last-selected board (device).

import { entities } from "@/api/entities";

const LAST_BOARD_KEY = "goeshere.board.lastId";

export const SWIMLANE_MODES = [
  { value: "none", label: "Off" },
  { value: "person", label: "By Assigned to" },
  { value: "project", label: "By Project" },
  { value: "custom", label: "Custom labels" },
];

export const BOARD_TEMPLATES = [
  {
    id: "blank",
    label: "Blank",
    description: "Two columns — To do and Done.",
    kind: "blank",
    columns: [
      { name: "To do", status_key: "todo", is_done: false },
      { name: "Done", status_key: "done", is_done: true },
    ],
  },
  {
    id: "task_workflow",
    label: "Task workflow",
    description: "Backlog → Ready → Doing → Done.",
    kind: "task_workflow",
    columns: [
      { name: "Backlog", status_key: "backlog", is_done: false },
      { name: "Ready", status_key: "ready", is_done: false },
      { name: "Doing", status_key: "doing", is_done: false },
      { name: "Done", status_key: "done", is_done: true },
    ],
  },
  {
    id: "project",
    label: "Linked to a Project",
    description: "Task workflow filtered to one project.",
    kind: "project",
    columns: [
      { name: "Backlog", status_key: "backlog", is_done: false },
      { name: "Ready", status_key: "ready", is_done: false },
      { name: "Doing", status_key: "doing", is_done: false },
      { name: "Done", status_key: "done", is_done: true },
    ],
  },
];

export function loadLastBoardId() {
  try {
    return localStorage.getItem(LAST_BOARD_KEY) || "";
  } catch {
    return "";
  }
}

export function saveLastBoardId(id) {
  try {
    if (id) localStorage.setItem(LAST_BOARD_KEY, id);
    else localStorage.removeItem(LAST_BOARD_KEY);
  } catch {
    /* ignore */
  }
  return id || "";
}

export function sortByPosition(rows) {
  return [...(rows || [])].sort((a, b) => {
    const ap = Number(a.position) || 0;
    const bp = Number(b.position) || 0;
    if (ap !== bp) return ap - bp;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
}

/** Resolve which column an item sits in for a given board's columns. */
export function columnForItem(item, columns) {
  const cols = sortByPosition(columns);
  if (!cols.length) return null;
  if (item.board_column_id) {
    const byId = cols.find((c) => c.id === item.board_column_id);
    if (byId) return byId;
  }
  if (item.board_status) {
    const byKey = cols.find((c) => c.status_key === item.board_status);
    if (byKey) return byKey;
  }
  if (item.completed) {
    const done = cols.find((c) => c.is_done);
    if (done) return done;
  }
  return cols[0];
}

export function statusKeyOf(item, columns) {
  const col = columnForItem(item, columns);
  return col?.status_key || item.board_status || (item.completed ? "done" : "backlog");
}

/**
 * Patch when moving an item onto a column.
 * Keeps board_status + completed in sync with is_done.
 */
export function boardColumnPatch(column, { boardId, swimlaneKey } = {}) {
  if (!column) return {};
  const patch = {
    board_column_id: column.id,
    board_status: column.status_key,
  };
  if (boardId) patch.board_id = boardId;
  if (swimlaneKey !== undefined) patch.swimlane_key = swimlaneKey;
  if (column.is_done) {
    patch.completed = true;
    patch.completed_date = new Date().toISOString();
  } else {
    patch.completed = false;
    patch.completed_date = null;
  }
  return patch;
}

/** When toggling completed outside the board UI. */
export function completionBoardPatch(item, completed, columns) {
  const cols = sortByPosition(columns);
  if (completed) {
    const done = cols.find((c) => c.is_done) || cols[cols.length - 1];
    return {
      completed: true,
      completed_date: new Date().toISOString(),
      board_status: done?.status_key || "done",
      board_column_id: done?.id ?? item.board_column_id ?? null,
      actual_duration_minutes:
        item.actual_duration_minutes != null
          ? item.actual_duration_minutes
          : item.duration_minutes != null
            ? Number(item.duration_minutes)
            : null,
    };
  }
  const firstOpen = cols.find((c) => !c.is_done) || cols[0];
  const keep =
    item.board_status && cols.some((c) => c.status_key === item.board_status && !c.is_done)
      ? cols.find((c) => c.status_key === item.board_status)
      : firstOpen;
  return {
    completed: false,
    completed_date: null,
    board_status: keep?.status_key || "backlog",
    board_column_id: keep?.id ?? null,
  };
}

export function itemSwimlaneKey(item, mode) {
  if (mode === "person") return item.responsible_name || "__unassigned__";
  if (mode === "project") return item.project_name || "__none__";
  if (mode === "custom") return item.swimlane_key || "__none__";
  return "__all__";
}

export function swimlaneLabel(key, mode, customLanes = []) {
  if (mode === "none" || key === "__all__") return null;
  if (key === "__unassigned__") return "Unassigned";
  if (key === "__none__") return mode === "project" ? "No project" : "No label";
  if (mode === "custom") {
    const lane = customLanes.find((l) => l.lane_key === key);
    if (lane) return lane.name;
  }
  return key;
}

/**
 * Build ordered swimlane rows for a board.
 * @returns {{ key: string, label: string }[]}
 */
export function resolveSwimlanes(mode, items, customLanes = []) {
  if (mode === "none") return [{ key: "__all__", label: null }];
  if (mode === "custom") {
    const lanes = sortByPosition(customLanes).map((l) => ({
      key: l.lane_key,
      label: l.name,
    }));
    const known = new Set(lanes.map((l) => l.key));
    const extras = [];
    (items || []).forEach((it) => {
      const k = it.swimlane_key || "__none__";
      if (!known.has(k) && k !== "__none__") {
        known.add(k);
        extras.push({ key: k, label: k });
      }
    });
    if (!known.has("__none__")) {
      lanes.push({ key: "__none__", label: "No label" });
    }
    return [...lanes, ...extras];
  }
  // person | project — dynamic from items, Unassigned / No project last-ish
  const keys = new Set();
  (items || []).forEach((it) => keys.add(itemSwimlaneKey(it, mode)));
  const special = mode === "person" ? "__unassigned__" : "__none__";
  const named = [...keys].filter((k) => k !== special).sort((a, b) => a.localeCompare(b));
  const rows = named.map((k) => ({
    key: k,
    label: swimlaneLabel(k, mode),
  }));
  if (keys.has(special) || !rows.length) {
    rows.push({ key: special, label: swimlaneLabel(special, mode) });
  }
  return rows;
}

function slugKey(name, used) {
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

/**
 * Create a board from a template (and optional project link).
 * @returns {Promise<{ board, columns }>}
 */
export async function createBoardFromTemplate({
  name,
  templateId = "task_workflow",
  projectId = null,
  projectName = null,
} = {}) {
  const template = BOARD_TEMPLATES.find((t) => t.id === templateId) || BOARD_TEMPLATES[1];
  const boards = await entities.Board.list("position", 200);
  const position = (boards || []).reduce((m, b) => Math.max(m, Number(b.position) || 0), -1) + 1;

  const board = await entities.Board.create({
    name: name || (template.kind === "project" && projectName
      ? `${projectName} board`
      : template.label),
    kind: template.kind,
    project_id: template.kind === "project" ? projectId : null,
    filter_json: template.kind === "project" && projectName
      ? { project_name: projectName }
      : null,
    swimlane_mode: "none",
    position,
  });

  const used = new Set();
  const columns = [];
  for (let i = 0; i < template.columns.length; i += 1) {
    const col = template.columns[i];
    const status_key = used.has(col.status_key)
      ? slugKey(col.name, used)
      : (used.add(col.status_key), col.status_key);
    const row = await entities.BoardColumn.create({
      board_id: board.id,
      name: col.name,
      position: i,
      status_key,
      is_done: !!col.is_done,
    });
    columns.push(row);
  }

  return { board, columns };
}

/** Ensure at least the default Family tasks board exists (client-side fallback). */
export async function ensureDefaultBoard() {
  const boards = await entities.Board.list("position", 50);
  if (boards?.length) return boards;
  const { board } = await createBoardFromTemplate({
    name: "Family tasks",
    templateId: "task_workflow",
  });
  // Place orphan items onto this board's first / matching column.
  const columns = await entities.BoardColumn.filter({ board_id: board.id }, "position", 50);
  const items = await entities.Item.list("-created_date", 2000);
  const byKey = Object.fromEntries((columns || []).map((c) => [c.status_key, c]));
  const first = sortByPosition(columns)[0];
  const done = sortByPosition(columns).find((c) => c.is_done);
  await Promise.all(
    (items || [])
      .filter((it) => !it.board_id)
      .map((it) => {
        const col =
          byKey[it.board_status] ||
          (it.completed ? done : null) ||
          first;
        if (!col) return null;
        return entities.Item.update(it.id, {
          board_id: board.id,
          board_column_id: col.id,
          board_status: col.status_key,
        });
      })
      .filter(Boolean)
  );
  return entities.Board.list("position", 50);
}

/**
 * Items on a board. Explicit board_id wins.
 * Orphans (no board_id) appear only on the primary board (lowest position)
 * so they don't duplicate across every board.
 */
export function filterItemsForBoard(items, board, allBoards = []) {
  const all = items || [];
  if (!board) return all;
  const filter = board.filter_json || {};
  const primaryId = sortByPosition(allBoards)[0]?.id;
  const isPrimary = !primaryId || board.id === primaryId;

  return all.filter((it) => {
    if (it.board_id) {
      if (it.board_id !== board.id) return false;
      if (filter.project_name && it.project_name && it.project_name !== filter.project_name) {
        return false;
      }
      return true;
    }
    // Orphans: project boards take matching project_name; else primary board only.
    if (board.kind === "project" && filter.project_name) {
      return it.project_name === filter.project_name;
    }
    return isPrimary;
  });
}
