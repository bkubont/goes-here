import { entities } from "@/api/entities";

/**
 * Build a household JSON snapshot for download.
 * Family-member only (caller must already be authenticated as a member).
 */
export async function buildHouseholdExport({ includeTrash = false } = {}) {
  const [items, people, projects, boards, columns, swimlanes, trash] = await Promise.all([
    entities.Item.list("-created_date", 5000),
    entities.Person.list("name", 500),
    entities.Project.list("name", 500),
    entities.Board.list("position", 200),
    entities.BoardColumn.list("position", 500),
    entities.BoardSwimlane.list("position", 500),
    includeTrash ? entities.Item.listDeleted("-deleted_at", 2000) : Promise.resolve([]),
  ]);

  return {
    exported_at: new Date().toISOString(),
    app: "GoesHere",
    include_trash: !!includeTrash,
    items: items || [],
    people: people || [],
    projects: projects || [],
    boards: boards || [],
    board_columns: columns || [],
    board_swimlanes: swimlanes || [],
    ...(includeTrash ? { trash: trash || [] } : {}),
  };
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
