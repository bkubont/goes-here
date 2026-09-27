import React from "react";
import { Link, useParams } from "react-router-dom";
import { LayoutList } from "lucide-react";
import { useItems } from "@/lib/queries";
import { ITEM_TYPES, ITEM_TYPE_MAP, GROCERY_CATEGORIES } from "@/lib/itemTypes";
import ItemList from "@/components/ItemList";
import { cn } from "@/lib/utils";

function sortItems(a, b) {
  const byDone = Number(a.completed) - Number(b.completed);
  if (byDone !== 0) return byDone;
  const aDate = a.due_date || a.date || "";
  const bDate = b.due_date || b.date || "";
  if (aDate !== bDate) return String(aDate).localeCompare(String(bDate));
  const aUp = a.updated_date || a.created_date || "";
  const bUp = b.updated_date || b.created_date || "";
  return String(bUp).localeCompare(String(aUp));
}

function TypePicker({ active }) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-5">
      <Link
        to="/lists/all"
        className={cn(
          "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
          active === "all"
            ? "border-brand bg-brand/10 text-brand"
            : "border-border text-muted-foreground hover:bg-accent"
        )}
      >
        All
      </Link>
      {ITEM_TYPES.map((t) => (
        <Link
          key={t.key}
          to={`/lists/${t.key}`}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-xs font-medium transition",
            active === t.key
              ? "border-brand bg-brand/10 text-brand"
              : "border-border text-muted-foreground hover:bg-accent"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default function Lists() {
  const { type } = useParams();
  const { data: items } = useItems({});
  const all = items || [];

  if (!type) {
    const activeAll = all.filter((i) => !i.completed).length;
    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
        <h1 className="font-display text-3xl font-semibold mb-1">Lists</h1>
        <p className="text-sm text-muted-foreground mb-6">Each kind of list behaves the way that kind of thing should.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Link to="/lists/all" className="group rounded-xl border border-border bg-card p-4 hover:shadow-sm hover:-translate-y-0.5 transition">
            <span className="grid h-9 w-9 place-items-center rounded-lg border bg-slate-50 text-slate-700 border-slate-200">
              <LayoutList className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </span>
            <p className="mt-3 text-sm font-medium">All</p>
            <p className="text-xs text-muted-foreground">{activeAll} active</p>
          </Link>
          {ITEM_TYPES.map((t) => {
            const Icon = t.icon;
            const c = all.filter((i) => i.type === t.key && !i.completed).length;
            return (
              <Link key={t.key} to={`/lists/${t.key}`} className="group rounded-xl border border-border bg-card p-4 hover:shadow-sm hover:-translate-y-0.5 transition">
                <span className={cn("grid h-9 w-9 place-items-center rounded-lg border", t.tone)}>
                  <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
                </span>
                <p className="mt-3 text-sm font-medium">{t.label}</p>
                <p className="text-xs text-muted-foreground">{c} active</p>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === "all") {
    const sorted = [...all].sort(sortItems);
    const active = sorted.filter((i) => !i.completed);
    const done = sorted.filter((i) => i.completed);
    const byType = {};
    active.forEach((it) => {
      const key = it.type || "todo";
      (byType[key] = byType[key] || []).push(it);
    });
    const typeOrder = ITEM_TYPES.map((t) => t.key).filter((k) => (byType[k] || []).length);
    const orphanKeys = Object.keys(byType).filter((k) => !ITEM_TYPE_MAP[k]);

    return (
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <div className="flex items-center gap-2 mb-1">
          <Link to="/lists" className="text-sm text-muted-foreground hover:text-foreground">Lists</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg border bg-slate-50 text-slate-700 border-slate-200">
              <LayoutList className="h-4 w-4" />
            </span>
            All
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{active.length} active · {done.length} done</p>
        <TypePicker active="all" />

        <div className="space-y-6">
          {typeOrder.map((key) => {
            const TI = ITEM_TYPE_MAP[key];
            const Icon = TI.icon;
            return (
              <section key={key}>
                <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  <span className={cn("grid h-6 w-6 place-items-center rounded-md border", TI.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {TI.label}
                  <span className="font-normal normal-case tracking-normal">· {byType[key].length}</span>
                </h2>
                <ItemList items={byType[key]} />
              </section>
            );
          })}
          {orphanKeys.map((key) => (
            <section key={key}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{key}</h2>
              <ItemList items={byType[key]} />
            </section>
          ))}
          {!active.length && (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No items yet. Add some with Quick Add.
            </div>
          )}
        </div>

        {done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground mb-2">{done.length} completed</summary>
            <ItemList items={done} />
          </details>
        )}
      </div>
    );
  }

  const TI = ITEM_TYPE_MAP[type];
  if (!TI) return <div className="p-8 text-center text-muted-foreground">Unknown list.</div>;

  const list = all.filter((i) => i.type === type).sort(sortItems);
  const active = list.filter((i) => !i.completed);
  const done = list.filter((i) => i.completed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex items-center gap-2 mb-1">
        <Link to="/lists" className="text-sm text-muted-foreground hover:text-foreground">Lists</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="font-display text-2xl font-semibold flex items-center gap-2">
          <span className={cn("grid h-8 w-8 place-items-center rounded-lg border", TI.tone)}><TI.icon className="h-4 w-4" /></span>
          {TI.label}
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-3">{active.length} active · {done.length} done</p>
      <TypePicker active={type} />

      {type === "grocery" ? (
        <GroceryView items={active} />
      ) : (
        <ItemList items={active} emptyHint={`No ${TI.label.toLowerCase()} items yet. Add one with Quick Add.`} />
      )}

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground mb-2">{done.length} completed</summary>
          <ItemList items={done} />
        </details>
      )}
    </div>
  );
}

function GroceryView({ items }) {
  const groups = {};
  GROCERY_CATEGORIES.forEach((c) => (groups[c] = []));
  items.forEach((it) => {
    const c = it.category && GROCERY_CATEGORIES.includes(it.category) ? it.category : "Other";
    (groups[c] = groups[c] || []).push(it);
  });
  return (
    <div className="space-y-5">
      {GROCERY_CATEGORIES.filter((c) => (groups[c] || []).length).map((c) => (
        <div key={c}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{c}</h3>
          <ItemList items={groups[c]} />
        </div>
      ))}
      {!items.length && (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No groceries yet. Try “buy milk, eggs, and bread” in Quick Add.
        </div>
      )}
    </div>
  );
}
