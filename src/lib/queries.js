import { useEffect } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/entities";
import { queryClientInstance } from "@/lib/query-client";
import { listAllDeletedItems } from "@/lib/fetchAll";
import { DB_PAGE_SIZE, MAX_PAGES, chunkRows, nextPageOffset } from "@/lib/paging";

/** One page of items. Matches Supabase's default Max rows (1,000), never above it. */
export const ITEMS_PAGE_SIZE = DB_PAGE_SIZE;

function stableFilterKey(filter) {
  if (!filter || typeof filter !== "object") return null;
  const keys = Object.keys(filter).filter((k) => filter[k] !== undefined);
  if (!keys.length) return null;
  keys.sort();
  const stable = {};
  for (const k of keys) stable[k] = filter[k];
  return stable;
}

function flattenItemsPages(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.pages)) return data.pages.flat();
  return [];
}

/** Apply an array recipe to either a plain list or infinite-query pages cache. */
function applyItemsRecipe(data, recipe) {
  if (Array.isArray(data)) return recipe(data);
  if (data && Array.isArray(data.pages)) {
    const next = recipe(flattenItemsPages(data));
    // Keep real page boundaries so a later refetch does not drop every page but the first.
    const { pages, pageParams } = chunkRows(next, DB_PAGE_SIZE);
    return { ...data, pages, pageParams };
  }
  return data;
}

/** Patch every cached items list in place so the UI updates before refetch lands. */
export function patchItemsCaches(recipe) {
  const entries = queryClientInstance.getQueriesData({ queryKey: ["items"] });
  for (const [key, data] of entries) {
    if (!data) continue;
    if (!Array.isArray(data) && !Array.isArray(data.pages)) continue;
    queryClientInstance.setQueryData(key, applyItemsRecipe(data, recipe));
  }
}

export function patchPeopleCaches(recipe) {
  const entries = queryClientInstance.getQueriesData({ queryKey: ["people"] });
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue;
    queryClientInstance.setQueryData(key, recipe(data));
  }
}

export function patchProjectsCaches(recipe) {
  const entries = queryClientInstance.getQueriesData({ queryKey: ["projects"] });
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue;
    queryClientInstance.setQueryData(key, recipe(data));
  }
}

export function patchAttachmentsCaches(recipe) {
  const entries = queryClientInstance.getQueriesData({ queryKey: ["attachments"] });
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue;
    queryClientInstance.setQueryData(key, recipe(data));
  }
}

/**
 * Mark lists stale and force a refetch so create/update/delete show up without a full reload.
 * Awaits refetch of matching queries (active + inactive) — fire-and-forget invalidation
 * was leaving some screens on a pre-mutation snapshot until hard refresh.
 */
export async function invalidateAll() {
  await Promise.all([
    queryClientInstance.invalidateQueries({ queryKey: ["items"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["people"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["projects"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["attachments"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["items-trash"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["familyMembers"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["boards"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["boardColumns"] }),
    queryClientInstance.invalidateQueries({ queryKey: ["boardSwimlanes"] }),
  ]);
  await Promise.all([
    queryClientInstance.refetchQueries({ queryKey: ["items"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["people"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["projects"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["attachments"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["items-trash"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["familyMembers"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["boards"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["boardColumns"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["boardSwimlanes"], type: "all" }),
  ]);
}

/**
 * Family items, walked in pages of ITEMS_PAGE_SIZE.
 * `data` is always a flat array (compatible with existing callers).
 * A full page means there may be more: the next page is fetched automatically,
 * and Load more calls the same fetch if that walk has not finished.
 */
export function useItems(filter = {}, options = {}) {
  const { pageSize: requestedPageSize = ITEMS_PAGE_SIZE, ...queryOptions } = options;
  const pageSize = Math.min(
    DB_PAGE_SIZE,
    Math.max(1, Math.floor(Number(requestedPageSize) || ITEMS_PAGE_SIZE))
  );
  const stable = stableFilterKey(filter);
  const queryKey = stable ? ["items", stable] : ["items"];

  const query = useInfiniteQuery({
    queryKey,
    // Prefer freshness after local writes; invalidateAll still forces refetch.
    staleTime: 0,
    ...queryOptions,
    initialPageParam: 0,
    queryFn: async ({ pageParam = 0 }) => {
      const opts = { offset: pageParam };
      if (!stable) return entities.Item.list("-created_date", pageSize, opts);
      return entities.Item.filter(stable, "-created_date", pageSize, opts);
    },
    getNextPageParam: (lastPage, allPages) => {
      const loaded = (allPages || []).reduce((n, p) => n + (p?.length || 0), 0);
      const previous = loaded - (lastPage?.length || 0);
      return nextPageOffset(lastPage, previous, pageSize);
    },
  });

  const pageCount = query.data?.pages?.length || 0;
  useEffect(() => {
    // Stop the automatic walk at MAX_PAGES. Load more still works past that.
    if (pageCount >= MAX_PAGES) return;
    if (!query.hasNextPage || query.isFetching || query.isFetchingNextPage || query.isFetchNextPageError) {
      return;
    }
    query.fetchNextPage();
  }, [
    pageCount,
    query.hasNextPage,
    query.isFetching,
    query.isFetchingNextPage,
    query.isFetchNextPageError,
    query.fetchNextPage,
  ]);

  const items = flattenItemsPages(query.data);
  return {
    ...query,
    data: items,
    hasMore: !!query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
    fetchLimit: items.length,
    pageSize,
  };
}

/** Soft-deleted items (Settings trash). Walks every page, not a single capped request. */
export function useDeletedItems(options = {}) {
  return useQuery({
    queryKey: ["items-trash"],
    queryFn: () => listAllDeletedItems(),
    staleTime: 0,
    ...options,
  });
}

export function useAttachments(itemId, options = {}) {
  return useQuery({
    queryKey: itemId ? ["attachments", { item_id: itemId }] : ["attachments", "none"],
    queryFn: async () => {
      if (!itemId) return [];
      return entities.Attachment.filter({ item_id: itemId }, "-created_at", 50);
    },
    enabled: !!itemId,
    staleTime: 0,
    ...options,
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: async () => entities.Person.list("name", 200),
    staleTime: 0,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => entities.Project.list("name", 200),
    staleTime: 0,
  });
}

export function useFamilyMembers() {
  return useQuery({
    queryKey: ["familyMembers"],
    queryFn: async () => entities.FamilyMember.list("email", 200),
    staleTime: 0,
  });
}

export function useBoards() {
  return useQuery({
    queryKey: ["boards"],
    queryFn: async () => entities.Board.list("position", 200),
    staleTime: 0,
  });
}

export function useBoardColumns(boardId) {
  return useQuery({
    queryKey: boardId ? ["boardColumns", { board_id: boardId }] : ["boardColumns", "none"],
    queryFn: async () => {
      if (!boardId) return [];
      return entities.BoardColumn.filter({ board_id: boardId }, "position", 100);
    },
    enabled: !!boardId,
    staleTime: 0,
  });
}

export function useBoardSwimlanes(boardId) {
  return useQuery({
    queryKey: boardId ? ["boardSwimlanes", { board_id: boardId }] : ["boardSwimlanes", "none"],
    queryFn: async () => {
      if (!boardId) return [];
      return entities.BoardSwimlane.filter({ board_id: boardId }, "position", 100);
    },
    enabled: !!boardId,
    staleTime: 0,
  });
}

export function patchFamilyMemberCaches(recipe) {
  const entries = queryClientInstance.getQueriesData({ queryKey: ["familyMembers"] });
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue;
    queryClientInstance.setQueryData(key, recipe(data));
  }
}

export function useInvalidate() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["items"] }),
      qc.invalidateQueries({ queryKey: ["people"] }),
      qc.invalidateQueries({ queryKey: ["projects"] }),
      qc.invalidateQueries({ queryKey: ["attachments"] }),
      qc.invalidateQueries({ queryKey: ["items-trash"] }),
      qc.invalidateQueries({ queryKey: ["familyMembers"] }),
      qc.invalidateQueries({ queryKey: ["boards"] }),
      qc.invalidateQueries({ queryKey: ["boardColumns"] }),
      qc.invalidateQueries({ queryKey: ["boardSwimlanes"] }),
    ]);
    await Promise.all([
      qc.refetchQueries({ queryKey: ["items"], type: "all" }),
      qc.refetchQueries({ queryKey: ["people"], type: "all" }),
      qc.refetchQueries({ queryKey: ["projects"], type: "all" }),
      qc.refetchQueries({ queryKey: ["attachments"], type: "all" }),
      qc.refetchQueries({ queryKey: ["items-trash"], type: "all" }),
      qc.refetchQueries({ queryKey: ["familyMembers"], type: "all" }),
      qc.refetchQueries({ queryKey: ["boards"], type: "all" }),
      qc.refetchQueries({ queryKey: ["boardColumns"], type: "all" }),
      qc.refetchQueries({ queryKey: ["boardSwimlanes"], type: "all" }),
    ]);
  };
}
