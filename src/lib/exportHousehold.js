import {
  listAllItems,
  listAllDeletedItems,
  listAllPeople,
  listAllProjects,
  listAllBoards,
  listAllBoardColumns,
  listAllBoardSwimlanes,
} from "@/lib/fetchAll";

/**
 * Build a household JSON snapshot for download.
 * Family-member only (caller must already be authenticated as a member).
 * Each list is paged at DB_PAGE_SIZE until a short page comes back.
 */
export async function buildHouseholdExport({ includeTrash = false } = {}) {
  const [items, people, projects, boards, columns, swimlanes, trash] = await Promise.all([
    listAllItems(),
    listAllPeople(),
    listAllProjects(),
    listAllBoards(),
    listAllBoardColumns(),
    listAllBoardSwimlanes(),
    includeTrash ? listAllDeletedItems() : Promise.resolve([]),
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
