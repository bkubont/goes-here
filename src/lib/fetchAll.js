import { entities } from "@/api/entities";
import { DB_PAGE_SIZE, fetchAllPages } from "@/lib/paging";

function every(listFn, sort) {
  return fetchAllPages((offset) => listFn(sort, DB_PAGE_SIZE, { offset }));
}

/** Every non-deleted item, in created_date order, past the 1,000-row API cap. */
export function listAllItems() {
  return every(entities.Item.list, "-created_date");
}

/** Every soft-deleted item (trash). */
export function listAllDeletedItems() {
  return fetchAllPages((offset) =>
    entities.Item.listDeleted("-deleted_at", DB_PAGE_SIZE, { offset })
  );
}

export function listAllPeople() {
  return every(entities.Person.list, "name");
}

export function listAllProjects() {
  return every(entities.Project.list, "name");
}

export function listAllBoards() {
  return every(entities.Board.list, "position");
}

export function listAllBoardColumns() {
  return every(entities.BoardColumn.list, "position");
}

export function listAllBoardSwimlanes() {
  return every(entities.BoardSwimlane.list, "position");
}
