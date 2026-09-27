import { entities } from "@/api/entities";

const ITEM_FIELDS = [
  "content", "type", "person_name", "responsible_name", "project_name",
  "date", "due_date", "time", "recurring", "completed", "completed_date",
  "priority", "notes", "category", "amount", "budget", "purchased", "wrapped",
  "payment_status", "store", "location", "tags", "inbox", "list_name",
  "duration_minutes", "duration_source", "actual_duration_minutes", "board_status",
  "reminder_offset", "reminder_dismissed_at", "reminder_snooze_until", "recurring_exceptions",
  "deleted_at", "attachment_count",
];

const PERSON_FIELDS = ["name", "role", "color", "birthday", "notes"];
const PROJECT_FIELDS = [
  "name", "description", "color", "category", "owner_name", "target_date", "next_action",
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
  const hasArrays = [data.items, data.people, data.projects].some(Array.isArray);
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
}) {
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors = [];

  for (const raw of rows || []) {
    if (!raw || typeof raw !== "object") {
      skipped += 1;
      continue;
    }
    if (requireContent && !String(raw.content || "").trim() && !String(raw.name || "").trim()) {
      skipped += 1;
      continue;
    }
    const patch = pick(raw, fields);
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
        updated += 1;
      } else if (id) {
        await create({ id, ...patch });
        existingIds.add(id);
        created += 1;
      } else {
        await create(patch);
        created += 1;
      }
    } catch (e) {
      errors.push(e.message || String(e));
      if (errors.length >= 5) break;
    }
  }

  return { created, updated, skipped, errors };
}

/**
 * Merge a validated export into the household DB.
 * Upserts by id when present; otherwise creates. Does not wipe existing data.
 * Trash rows are skipped unless includeTrash is true.
 */
export async function importHouseholdData(data, { includeTrash = false } = {}) {
  const validated = validateHouseholdImport(data);

  const [existingItems, existingPeople, existingProjects, existingTrash] = await Promise.all([
    entities.Item.list("-created_date", 5000),
    entities.Person.list("name", 500),
    entities.Project.list("name", 500),
    includeTrash ? entities.Item.listDeleted("-deleted_at", 2000) : Promise.resolve([]),
  ]);

  const itemIds = new Set([
    ...(existingItems || []).map((r) => r.id),
    ...(existingTrash || []).map((r) => r.id),
  ]);
  const peopleIds = new Set((existingPeople || []).map((r) => r.id));
  const projectIds = new Set((existingProjects || []).map((r) => r.id));

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

  const items = await upsertRows({
    rows: validated.items,
    fields: ITEM_FIELDS.filter((f) => f !== "deleted_at" && f !== "attachment_count"),
    existingIds: itemIds,
    create: (row) => entities.Item.create(row),
    update: (id, patch) => entities.Item.update(id, patch),
    requireContent: "content",
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
    });
  } else if (Array.isArray(validated.trash) && validated.trash.length && !includeTrash) {
    trash.skipped = validated.trash.length;
  }

  const errorList = [
    ...people.errors,
    ...projects.errors,
    ...items.errors,
    ...trash.errors,
  ];

  return {
    people,
    projects,
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
