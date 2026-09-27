import React from "react";
import ItemCard from "@/components/ItemCard";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";

/**
 * @param {object} props
 * @param {Array} props.items
 * @param {string} [props.emptyHint]
 * @param {boolean} [props.selectMode] — multi-select for bulk complete
 * @param {Set<string>|string[]} [props.selectedIds]
 * @param {(item: object) => void} [props.onToggleSelect]
 */
export default function ItemList({
  items,
  emptyHint = "Nothing here yet.",
  selectMode = false,
  selectedIds,
  onToggleSelect,
}) {
  const [active, setActive] = React.useState(null);
  const selected = selectedIds instanceof Set
    ? selectedIds
    : new Set(selectedIds || []);

  return (
    <>
      {items && items.length ? (
        <div className="space-y-2">
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              onOpen={setActive}
              selectMode={selectMode}
              selected={selected.has(it.id)}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}
      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </>
  );
}
