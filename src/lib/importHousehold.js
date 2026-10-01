import { entities } from "@/api/entities";
import {
  listAllItems,
  listAllDeletedItems,
  listAllPeople,
  listAllProjects,
  listAllBoards,
  listAllBoardColumns,
  listAllBoardSwimlanes,
} from "@/lib/fetchAll";

const ITEM_FIELDS = [
  "content", "type", "person_name", "responsible_name", "project_name",
  "date", "due_date", "time", "recurring", "completed", "completed_date",
  "priority", "notes", "category", "amount", "budget", "purchased", "wrapped",
  "payment_status", "store", "location", "tags", "inbox", "list_name",
  "duration_minutes", "duration_source", "actual_duration_minutes", "board_status",
  "board_id", "board_column_id", "swimlane_key",
  "reminder_offset", "reminder_dismissed_at", "reminder_snooze_until", "recurring_exceptions",
  "deleted_at", "attachment_count",
];

const PERSON_FIELDS = ["name", "role", "color", "birthday", "notes"];
const PROJECT_FIELDS = [
  "name", "description", "color", "category", "owner_name", "target_date", "next_action",
];
const BOARD_FIELDS = [
  "name", "kind", "project_id", "filter_json", "swimlane_mode", "position",
];
const BOARD_COLUMN_FIELDS = [
  "board_id", "name", "position", "status_key", "is_done",
];
const BOARD_SWIMLANE_FIELDS = [
  "board_id", "name", "position", "lane_key",
];

function pick(row, fields) {
  const out = {};
  for (const key of fields) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Validate exported GoesHere backup JSON.
 * @throws {Error} with a clear message for the UI toast.
 */
export function validateHouseholdImport(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("File is not a GoesHere export object.");
  }
  if (data.app && data.app !== "GoesHere") {
    throw new Error(`Unexpected app tag “${data.app}”. Expected GoesHere.`);
  }
  const hasArrays = [data.items, data.people, data.projects, data.boards].some(Array.isArray);
  if (!hasArrays) {
    throw new Error("Missing items, people, or projects arrays.");
  }
  if (data.items != null && !Array.isArray(data.items)) {
    throw new Error("items must be an array.");
  }
  if (data.people != null && !Array.isArray(data.people)) {
    throw new Error("people must be an array.");
  }
  if (data.projects != null && !Array.isArray(data.projects)) {
    throw new Error("projects must be an array.");
  }
  if (data.boards != null && !Array.isArray(data.boards)) {
    throw new Error("boards must be an array.");
  }
  if (data.board_columns != null && !Array.isArray(data.board_columns)) {
    throw new Error("board_columns must be an array.");
  }
  if (data.board_swimlanes != null && !Array.isArray(data.board_swimlanes)) {
    throw new Error("board_swimlanes must be an array.");
  }
  if (data.trash != null && !Array.isArray(data.trash)) {
    throw new Error("trash must be an array.");
  }
  return data;
}

async function upsertRows({
  rows,
  fields,
  existingIds,
  create,
  update,
  requireContent,
  remapPatch,
}) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];
  const idMap = new Map();

  for (const raw of rows || []) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    if (requireContent && !String(raw.content || "").trim() && !String(raw.name || "").trim()) {
      skipped += 1;
      continue;
    }
    let patch = pick(raw, fields);
    if (typeof remapPatch === "function") {
      const remapped = remapPatch(patch, raw);
      if (remapped == null) {
        skipped += 1;
        continue;
      }
      patch = remapped;
    }
    if (requireContent === "content" && !String(patch.content || "").trim()) {
      skipped += 1;
      continue;
    }
    if (requireContent === "name" && !String(patch.name || "").trim()) {
      skipped += 1;
      continue;
    }

    const id = isUuid(raw.id) ? raw.id : null;
    try {
      if (id && existingIds.has(id)) {
        await update(id, patch);
        idMap.set(id, id);
        updated += 1;
      } else if (id) {
        const row = await create({ id, ...patch });
        const newId = row?.id || id;
        existingIds.add(newId);
        idMap.set(id, newId);
        created += 1;
      } else {
        const row = await create(patch);
        if (row?.id) {
          existingIds.add(row.id);
          if (isUuid(raw.id)) idMap.set(raw.id, row.id);
        }
        created += 1;
      }
    } catch (e) {
      errors.push(e.message || String(e));
      if (errors.length >= 5) break;
    }
  }

  return { created, updated, skipped, errors, idMap };
}

function remapId(value, idMap, knownIds) {
  if (!value) return null;
  if (idMap?.has(value)) return idMap.get(value);
  if (knownIds?.has(value)) return value;
  return null;
}

/**
 * Merge a validated export into the household DB.
 * Upserts by id when present; otherwise creates. Does not wipe existing data.
 * Boards/columns/swimlanes are restored first so item FKs round-trip.
 * Trash rows are skipped unless includeTrash is true.
 */
export async function importHouseholdData(data, { includeTrash = false } = {}) {
  const validated = validateHouseholdImport(data);

  const [
    existingItems,
    existingPeople,
    existingProjects,
    existingBoards,
    existingColumns,
    existingSwimlanes,
    existingTrash,
  ] = await Promise.all([
    listAllItems(),
    listAllPeople(),
    listAllProjects(),
    listAllBoards(),
    listAllBoardColumns(),
    listAllBoardSwimlanes(),
    includeTrash ? listAllDeletedItems() : Promise.resolve([]),
  ]);

  const itemIds = new Set([
    ...(existingItems || []).map((r) => r.id),
    ...(existingTrash || []).map((r) => r.id),
  ]);
  const peopleIds = new Set((existingPeople || []).map((r) => r.id));
  const projectIds = new Set((existingProjects || []).map((r) => r.id));
  const boardIds = new Set((existingBoards || []).map((r) => r.id));
  const columnIds = new Set((existingColumns || []).map((r) => r.id));
  const swimlaneIds = new Set((existingSwimlanes || []).map((r) => r.id));

  const people = await upsertRows({
    rows: validated.people,
    fields: PERSON_FIELDS,
    existingIds: peopleIds,
    create: (row) => entities.Person.create(row),
    update: (id, patch) => entities.Person.update(id, patch),
    requireContent: "name",
  });

  const projects = await upsertRows({
    rows: validated.projects,
    fields: PROJECT_FIELDS,
    existingIds: projectIds,
    create: (row) => entities.Project.create(row),
    update: (id, patch) => entities.Project.update(id, patch),
    requireContent: "name",
  });

  const boards = await upsertRows({
    rows: validated.boards,
    fields: BOARD_FIELDS,
    existingIds: boardIds,
    create: (row) => entities.Board.create(row),
    update: (id, patch) => entities.Board.update(id, patch),
    requireContent: "name",
    remapPatch: (patch) => ({
      ...patch,
      project_id: remapId(patch.project_id, projects.idMap, projectIds),
    }),
  });

  const boardColumns = await upsertRows({
    rows: validated.board_columns,
    fields: BOARD_COLUMN_FIELDS,
    existingIds: columnIds,
    create: (row) => entities.BoardColumn.create(row),
    update: (id, patch) => entities.BoardColumn.update(id, patch),
    requireContent: "name",
    remapPatch: (patch) => {
      const board_id = remapId(patch.board_id, boards.idMap, boardIds);
      if (!board_id) return null;
      return { ...patch, board_id };
    },
  });

  const boardSwimlanes = await upsertRows({
    rows: validated.board_swimlanes,
    fields: BOARD_SWIMLANE_FIELDS,
    existingIds: swimlaneIds,
    create: (row) => entities.BoardSwimlane.create(row),
    update: (id, patch) => entities.BoardSwimlane.update(id, patch),
    requireContent: "name",
    remapPatch: (patch) => {
      const board_id = remapId(patch.board_id, boards.idMap, boardIds);
      if (!board_id) return null;
      return { ...patch, board_id };
    },
  });

  const knownBoardIds = new Set([...boardIds, ...boards.idMap.values()]);
  const knownColumnIds = new Set([...columnIds, ...boardColumns.idMap.values()]);

  const remapItemBoardFks = (patch) => {
    const next = { ...patch };
    if (next.board_id != null) {
      next.board_id = remapId(next.board_id, boards.idMap, knownBoardIds);
    }
    if (next.board_column_id != null) {
      next.board_column_id = remapId(next.board_column_id, boardColumns.idMap, knownColumnIds);
    }
    // If column remapped but board missing, drop both placement FKs.
    if (next.board_column_id && !next.board_id) {
      next.board_column_id = null;
    }
    return next;
  };

  const items = await upsertRows({
    rows: validated.items,
    fields: ITEM_FIELDS.filter((f) => f !== "deleted_at" && f !== "attachment_count"),
    existingIds: itemIds,
    create: (row) => entities.Item.create(row),
    update: (id, patch) => entities.Item.update(id, patch),
    requireContent: "content",
    remapPatch: remapItemBoardFks,
  });

  let trash = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (includeTrash && Array.isArray(validated.trash) && validated.trash.length) {
    trash = await upsertRows({
      rows: validated.trash.map((row) => ({
        ...row,
        deleted_at: row.deleted_at || new Date().toISOString(),
      })),
      fields: ITEM_FIELDS,
      existingIds: itemIds,
      create: (row) => entities.Item.create(row),
      update: (id, patch) => entities.Item.update(id, patch),
      requireContent: "content",
      remapPatch: remapItemBoardFks,
    });
  } else if (Array.isArray(validated.trash) && validated.trash.length && !includeTrash) {
    trash.skipped = validated.trash.length;
  }

  const errorList = [
    ...people.errors,
    ...projects.errors,
    ...boards.errors,
    ...boardColumns.errors,
    ...boardSwimlanes.errors,
    ...items.errors,
    ...trash.errors,
  ];

  return {
    people,
    projects,
    boards,
    board_columns: boardColumns,
    board_swimlanes: boardSwimlanes,
    items,
    trash,
    errorCount: errorList.length,
    firstError: errorList[0] || null,
  };
}

export function summarizeImport(result) {
  const parts = [];
  const push = (label, block) => {
    if (!block) return;
    const bits = [];
    if (block.created) bits.push(`${block.created} new`);
    if (block.updated) bits.push(`${block.updated} updated`);
    if (block.skipped) bits.push(`${block.skipped} skipped`);
    if (bits.length) parts.push(`${label}: ${bits.join(", ")}`);
  };
  push("People", result.people);
  push("Projects", result.projects);
  push("Boards", result.boards);
  push("Columns", result.board_columns);
  push("Swimlanes", result.board_swimlanes);
  push("Items", result.items);
  if (result.trash && (result.trash.created || result.trash.updated)) {
    push("Trash", result.trash);
  } else if (result.trash?.skipped) {
    parts.push(`Trash: ${result.trash.skipped} skipped (opt in to restore)`);
  }
  if (result.errorCount) {
    parts.push(`${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`);
  }
  return parts.join(" · ") || "Nothing to import";
}
