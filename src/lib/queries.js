import { useQuery, useQueryClient } from "@tanstack/react-query";
import { entities } from "@/api/entities";
import { queryClientInstance } from "@/lib/query-client";

export function invalidateAll() {
  queryClientInstance.invalidateQueries({ queryKey: ["items"] });
  queryClientInstance.invalidateQueries({ queryKey: ["people"] });
  queryClientInstance.invalidateQueries({ queryKey: ["projects"] });
}

export function useItems(filter = {}, options = {}) {
  return useQuery({
    queryKey: ["items", filter],
    queryFn: async () => {
      const keys = Object.keys(filter);
      if (keys.length === 0) return entities.Item.list("-created_date", 1000);
      return entities.Item.filter(filter, "-created_date", 1000);
    },
    staleTime: 1000 * 30,
    ...options,
  });
}

export function usePeople() {
  return useQuery({
    queryKey: ["people"],
    queryFn: async () => entities.Person.list("name", 200),
    staleTime: 1000 * 60,
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async () => entities.Project.list("name", 200),
    staleTime: 1000 * 60,
  });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["items"] });
    qc.invalidateQueries({ queryKey: ["people"] });
    qc.invalidateQueries({ queryKey: ["projects"] });
  };
}