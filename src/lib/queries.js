import { useQuery, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/entities";
import { queryClientInstance } from "@/lib/query-client";

function stableFilterKey(filter) {
  if (!filter || typeof filter !== "object") return null;
  const keys = Object.keys(filter).filter((k) => filter[k] !== undefined);
  if (!keys.length) return null;
  keys.sort();
  const stable = {};
  for (const k of keys) stable[k] = filter[k];
  return stable;
}

/** Patch every cached items list in place so the UI updates before refetch lands. */
export function patchItemsCaches(recipe) {
  const entries = queryClientInstance.getQueriesData({ queryKey: ["items"] });
  for (const [key, data] of entries) {
    if (!Array.isArray(data)) continue;
    queryClientInstance.setQueryData(key, recipe(data));
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
  ]);
  await Promise.all([
    queryClientInstance.refetchQueries({ queryKey: ["items"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["people"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["projects"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["attachments"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["items-trash"], type: "all" }),
    queryClientInstance.refetchQueries({ queryKey: ["familyMembers"], type: "all" }),
  ]);
}

export function useItems(filter = {}, options = {}) {
  const stable = stableFilterKey(filter);
  return useQuery({
    queryKey: stable ? ["items", stable] : ["items"],
    queryFn: async () => {
      if (!stable) return entities.Item.list("-created_date", 1000);
      return entities.Item.filter(stable, "-created_date", 1000);
    },
    // Prefer freshness after local writes; invalidateAll still forces refetch.
    staleTime: 0,
    ...options,
  });
}

/** Soft-deleted items (Settings trash). */
export function useDeletedItems(options = {}) {
  return useQuery({
    queryKey: ["items-trash"],
    queryFn: async () => entities.Item.listDeleted("-deleted_at", 200),
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
    ]);
    await Promise.all([
      qc.refetchQueries({ queryKey: ["items"], type: "all" }),
      qc.refetchQueries({ queryKey: ["people"], type: "all" }),
      qc.refetchQueries({ queryKey: ["projects"], type: "all" }),
      qc.refetchQueries({ queryKey: ["attachments"], type: "all" }),
      qc.refetchQueries({ queryKey: ["items-trash"], type: "all" }),
      qc.refetchQueries({ queryKey: ["familyMembers"], type: "all" }),
    ]);
  };
}
