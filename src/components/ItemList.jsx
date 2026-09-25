import React from "react";
import ItemCard from "@/components/ItemCard";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";

export default function ItemList({ items, emptyHint = "Nothing here yet." }) {
  const [active, setActive] = React.useState(null);
  return (
    <>
      {items && items.length ? (
        <div className="space-y-2">
          {items.map((it) => (
            <ItemCard key={it.id} item={it} onOpen={setActive} />
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