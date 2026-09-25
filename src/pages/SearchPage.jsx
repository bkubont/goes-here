import React from "react";
import { Search } from "lucide-react";
import { useItems } from "@/lib/queries";
import ItemList from "@/components/ItemList";
import { Input } from "@/components/ui/input";

export default function SearchPage() {
  const { data: items } = useItems({});
  const [q, setQ] = React.useState("");
  const all = items || [];

  const query = q.trim().toLowerCase();
  const results = query
    ? all.filter((i) =>
        [i.content, i.notes, i.person_name, i.responsible_name, i.project_name, i.category, i.store, i.location, i.recurring, ...(i.tags || [])]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query))
      )
    : [];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="font-display text-3xl font-semibold mb-1">Search</h1>
      <p className="text-sm text-muted-foreground mb-5">Find anything, even if you don't remember where you filed it.</p>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='Try "Riley baseball" or "furnace"'
          className="pl-9 h-11"
        />
      </div>

      {query && (
        <p className="text-sm text-muted-foreground mb-3">{results.length} result{results.length !== 1 ? "s" : ""}</p>
      )}
      <ItemList items={results} emptyHint={query ? "No matches found." : "Start typing to search across everything."} />
    </div>
  );
}