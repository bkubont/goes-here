import React from "react";
import { Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useItems } from "@/lib/queries";
import { ITEM_TYPES } from "@/lib/itemTypes";
import ItemList from "@/components/ItemList";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function SearchPage() {
  const { data: items } = useItems({});
  const [searchParams, setSearchParams] = useSearchParams();
  const [q, setQ] = React.useState(searchParams.get("q") || "");
  const [typeFilter, setTypeFilter] = React.useState(searchParams.get("type") || "all");
  const [statusFilter, setStatusFilter] = React.useState(searchParams.get("status") || "active");
  const all = items || [];

  React.useEffect(() => {
    const next = new URLSearchParams();
    if (q.trim()) next.set("q", q.trim());
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (statusFilter !== "active") next.set("status", statusFilter);
    setSearchParams(next, { replace: true });
  }, [q, typeFilter, statusFilter, setSearchParams]);

  const query = q.trim().toLowerCase();
  const results = all.filter((i) => {
    if (statusFilter === "active" && i.completed) return false;
    if (statusFilter === "done" && !i.completed) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (!query) return false;
    return [i.content, i.notes, i.person_name, i.responsible_name, i.project_name, i.category, i.store, i.location, i.recurring, ...(i.tags || [])]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(query));
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <h1 className="page-title mb-1">Search</h1>
      <p className="text-sm text-muted-foreground mb-5">Find anything across lists, people, and projects.</p>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Try "Riley baseball" or "furnace"'
          className="pl-9 h-11"
          aria-label="Search"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-[6px] border border-border bg-card px-2 text-xs"
          aria-label="Filter by type"
        >
          <option value="all">All types</option>
          {ITEM_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.plural || t.label}</option>
          ))}
        </select>
        <div className="flex rounded-[6px] border border-border p-0.5 bg-card">
          {["active", "done", "all"].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              className={cn(
                "min-h-[36px] rounded-[4px] px-3 text-xs font-medium capitalize",
                statusFilter === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {s === "done" ? "Completed" : s}
            </button>
          ))}
        </div>
      </div>

      {query && (
        <p className="text-sm text-muted-foreground mb-3">{results.length} result{results.length !== 1 ? "s" : ""}</p>
      )}
      <ItemList items={results} emptyHint={query ? "No matches found." : "Start typing to search across everything."} />
    </div>
  );
}
