import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ShoppingCart, Store } from "lucide-react";
import { entities } from "@/api/entities";
import { GROCERY_CATEGORIES } from "@/lib/itemTypes";
import { completionPatch } from "@/lib/estimateDuration";
import { invalidateAll, patchItemsCaches, useItems } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { ToastAction } from "@/components/ui/toast";

function aisleOf(item) {
  return item.category && GROCERY_CATEGORIES.includes(item.category) ? item.category : "Other";
}

function isPurchased(item) {
  return !!(item.purchased || item.completed);
}

function groupByAisle(items) {
  const groups = {};
  GROCERY_CATEGORIES.forEach((c) => {
    groups[c] = [];
  });
  items.forEach((it) => {
    const c = aisleOf(it);
    (groups[c] = groups[c] || []).push(it);
  });
  return GROCERY_CATEGORIES.filter((c) => (groups[c] || []).length).map((c) => ({
    aisle: c,
    items: groups[c],
  }));
}

async function undoPurchase(itemId, previous) {
  try {
    const row = await entities.Item.update(itemId, previous);
    patchItemsCaches((list) => list.map((i) => (i.id === itemId ? { ...i, ...row } : i)));
    await invalidateAll();
    toast({ title: "Restored", description: "Back on the list." });
  } catch (e) {
    toast({ title: "Couldn't undo", description: e.message, variant: "destructive" });
  }
}

function ShopRow({ item, onToggle }) {
  const done = isPurchased(item);
  const meta = [];
  if (item.amount != null && item.amount !== "") meta.push(`Qty ${item.amount}`);
  if (item.store) meta.push(item.store);
  if (item.notes && !item.store) meta.push(item.notes);

  return (
    <button
      type="button"
      onClick={() => onToggle(item)}
      aria-pressed={done}
      aria-label={done ? `Mark ${item.content} not purchased` : `Mark ${item.content} purchased`}
      className={cn(
        "flex w-full min-h-[64px] items-center gap-3 border-b border-border px-4 py-3 text-left transition active:bg-accent/80",
        done ? "bg-muted/40 opacity-60" : "bg-card hover:bg-accent/40"
      )}
    >
      <span
        className={cn(
          "grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 transition",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border bg-background"
        )}
      >
        {done && <Check className="h-6 w-6" strokeWidth={2.5} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-base font-semibold leading-snug", done && "line-through")}>
          {item.content}
        </span>
        {meta.length > 0 && (
          <span className="mt-0.5 block text-sm text-muted-foreground">{meta.join(" · ")}</span>
        )}
      </span>
    </button>
  );
}

export default function GroceryShop() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const storeFilter = searchParams.get("store") || "all";
  const { data: items } = useItems({});
  const [showPurchased, setShowPurchased] = React.useState(false);
  const [pendingIds, setPendingIds] = React.useState(() => new Set());

  const groceries = React.useMemo(
    () => (items || []).filter((i) => i.type === "grocery"),
    [items]
  );

  const stores = React.useMemo(() => {
    const set = new Set();
    groceries.forEach((i) => {
      if (i.store?.trim()) set.add(i.store.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [groceries]);

  const scoped = React.useMemo(() => {
    if (storeFilter === "all") return groceries;
    return groceries.filter((i) => (i.store || "").trim() === storeFilter);
  }, [groceries, storeFilter]);

  const needed = React.useMemo(
    () => scoped.filter((i) => !isPurchased(i)),
    [scoped]
  );
  const purchased = React.useMemo(
    () => scoped.filter((i) => isPurchased(i)),
    [scoped]
  );

  const aisleGroups = React.useMemo(() => groupByAisle(needed), [needed]);
  const purchasedGroups = React.useMemo(() => groupByAisle(purchased), [purchased]);

  function setStore(next) {
    const params = new URLSearchParams(searchParams);
    if (!next || next === "all") params.delete("store");
    else params.set("store", next);
    setSearchParams(params, { replace: true });
  }

  async function toggle(item) {
    if (pendingIds.has(item.id)) return;
    const nextPurchased = !isPurchased(item);
    const previous = {
      completed: !!item.completed,
      completed_date: item.completed_date ?? null,
      board_status: item.board_status || (item.completed ? "done" : "backlog"),
      actual_duration_minutes: item.actual_duration_minutes ?? null,
      purchased: !!item.purchased,
    };
    const patch = {
      ...completionPatch(item, nextPurchased),
      purchased: nextPurchased,
    };
    setPendingIds((prev) => new Set(prev).add(item.id));
    // Optimistic update so the aisle list feels instant at the store.
    patchItemsCaches((list) =>
      list.map((i) => (i.id === item.id ? { ...i, ...patch } : i))
    );
    try {
      const row = await entities.Item.update(item.id, patch);
      patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
      await invalidateAll();
      if (nextPurchased) {
        toast({
          title: "Purchased",
          description: item.content,
          duration: 5000,
          action: (
            <ToastAction altText="Undo" onClick={() => undoPurchase(item.id, previous)}>
              Undo
            </ToastAction>
          ),
        });
      }
    } catch (e) {
      patchItemsCaches((list) =>
        list.map((i) => (i.id === item.id ? { ...i, ...previous } : i))
      );
      toast({ title: "Couldn't update", description: e.message, variant: "destructive" });
    } finally {
      setPendingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="shrink-0 border-b border-border bg-card pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:px-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-[44px] min-w-[44px] shrink-0 px-2"
            onClick={() => navigate("/lists/grocery")}
            aria-label="Exit shopping mode"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-1.5 font-heading text-lg font-semibold leading-tight">
              <ShoppingCart className="h-5 w-5 shrink-0 text-primary" aria-hidden />
              Shopping
            </h1>
            <p className="text-xs text-muted-foreground">
              {needed.length} left
              {purchased.length > 0 ? ` · ${purchased.length} got` : ""}
            </p>
          </div>
          <Link
            to="/lists/grocery"
            className="inline-flex min-h-[44px] shrink-0 items-center rounded-[6px] px-2.5 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Done
          </Link>
        </div>

        {stores.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 sm:px-4 scrollbar-thin">
            <button
              type="button"
              onClick={() => setStore("all")}
              className={cn(
                "inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-[6px] border px-2.5 text-xs font-medium transition",
                storeFilter === "all"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent"
              )}
            >
              All stores
            </button>
            {stores.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStore(s)}
                className={cn(
                  "inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-[6px] border px-2.5 text-xs font-medium transition",
                  storeFilter === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent"
                )}
              >
                <Store className="h-3 w-3" aria-hidden />
                {s}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-[env(safe-area-inset-bottom)]">
        {!needed.length && !purchased.length && (
          <div className="mx-4 mt-10 rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No groceries on the list.
            <div className="mt-3">
              <Link to="/lists/grocery" className="text-primary hover:underline">
                Back to Grocery
              </Link>
            </div>
          </div>
        )}

        {!needed.length && purchased.length > 0 && (
          <div className="mx-4 mt-8 rounded-xl border border-border bg-card px-4 py-8 text-center">
            <Check className="mx-auto h-10 w-10 text-primary" aria-hidden />
            <p className="mt-3 text-base font-semibold">All done</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything on this list is purchased.
            </p>
          </div>
        )}

        {aisleGroups.map(({ aisle, items: aisleItems }) => (
          <section key={aisle} className="mb-1">
            <div className="sticky top-0 z-10 border-b border-border bg-muted/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-muted/90">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {aisle}
                <span className="ml-2 font-normal normal-case tracking-normal tabular-nums">
                  {aisleItems.length}
                </span>
              </h2>
            </div>
            <div>
              {aisleItems.map((it) => (
                <ShopRow key={it.id} item={it} onToggle={toggle} />
              ))}
            </div>
          </section>
        ))}

        {purchased.length > 0 && (
          <div className="mt-4 border-t border-border px-4 py-3">
            <button
              type="button"
              onClick={() => setShowPurchased((v) => !v)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-[6px] px-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <span>{showPurchased ? "Hide purchased" : "Show purchased"}</span>
              <span className="tabular-nums">{purchased.length}</span>
            </button>
            {showPurchased &&
              purchasedGroups.map(({ aisle, items: aisleItems }) => (
                <section key={`done-${aisle}`} className="mb-1">
                  <div className="px-1 py-2">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {aisle}
                    </h2>
                  </div>
                  <div className="-mx-4">
                    {aisleItems.map((it) => (
                      <ShopRow key={it.id} item={it} onToggle={toggle} />
                    ))}
                  </div>
                </section>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
