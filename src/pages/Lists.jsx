import React from "react";
import { Link, useParams } from "react-router-dom";
import { LayoutList, Pin, EyeOff, Eye, ShoppingCart } from "lucide-react";
import { useItems, usePeople } from "@/lib/queries";
import { ITEM_TYPES, ITEM_TYPE_MAP, GROCERY_CATEGORIES, PINNED_LIST_KEYS } from "@/lib/itemTypes";
import ItemList from "@/components/ItemList";
import CollapsibleListSection from "@/components/CollapsibleListSection";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadListsFilters, saveListsFilters, SAVED_FILTERS_HINT } from "@/lib/savedFilters";

const HIDDEN_KEY = "goeshere.lists.hidden";

function loadHidden() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

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
    <div className="flex flex-wrap gap-1.5 mb-3">
      <Link
        to="/lists/all"
        className={cn(
          "rounded-[6px] border px-2.5 min-h-[36px] inline-flex items-center text-xs font-medium transition",
          active === "all"
            ? "border-primary bg-primary/10 text-primary"
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
            "rounded-[6px] border px-2.5 min-h-[36px] inline-flex items-center text-xs font-medium transition",
            active === t.key
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-accent"
          )}
        >
          {t.plural || t.label}
        </Link>
      ))}
    </div>
  );
}

function ListsFilterBar({ person, responsible, onPerson, onResponsible, peopleNames }) {
  return (
    <div className="mb-4 space-y-1.5">
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Assigned to</span>
          <select
            value={responsible}
            onChange={(e) => onResponsible(e.target.value)}
            className="h-10 min-h-[40px] rounded-[6px] border border-border bg-card px-2 text-xs text-foreground"
          >
            <option value="all">All</option>
            {peopleNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">About</span>
          <select
            value={person}
            onChange={(e) => onPerson(e.target.value)}
            className="h-10 min-h-[40px] rounded-[6px] border border-border bg-card px-2 text-xs text-foreground"
          >
            <option value="all">All people</option>
            {peopleNames.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">{SAVED_FILTERS_HINT} (type, person, assigned).</p>
    </div>
  );
}

function applyPeopleFilters(items, person, responsible) {
  return items.filter((it) => {
    if (responsible !== "all" && it.responsible_name !== responsible) return false;
    if (person !== "all" && it.person_name !== person) return false;
    return true;
  });
}

export default function Lists() {
  const { type } = useParams();
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const all = items || [];
  const [hidden, setHidden] = React.useState(loadHidden);
  const [showHidden, setShowHidden] = React.useState(false);
  const saved = React.useMemo(() => loadListsFilters(), []);
  const [filterPerson, setFilterPerson] = React.useState(saved.person || "all");
  const [filterResponsible, setFilterResponsible] = React.useState(saved.responsible || "all");

  const peopleNames = React.useMemo(() => {
    const s = new Set();
    (people || []).forEach((p) => s.add(p.name));
    all.forEach((it) => {
      if (it.responsible_name) s.add(it.responsible_name);
      if (it.person_name) s.add(it.person_name);
    });
    return [...s].sort();
  }, [people, all]);

  React.useEffect(() => {
    saveListsFilters({
      type: type || "all",
      person: filterPerson,
      responsible: filterResponsible,
    });
  }, [type, filterPerson, filterResponsible]);

  function toggleHidden(key) {
    setHidden((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(next));
      return next;
    });
  }

  if (!type) {
    const activeAll = all.filter((i) => !i.completed).length;
    const visible = ITEM_TYPES.filter((t) => showHidden || !hidden.includes(t.key));
    const pinnedFirst = [
      ...visible.filter((t) => PINNED_LIST_KEYS.includes(t.key)),
      ...visible.filter((t) => !PINNED_LIST_KEYS.includes(t.key)),
    ];

    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
          <div>
            <h1 className="page-title mb-1">Lists</h1>
            <p className="text-sm text-muted-foreground">
              Pin what you use. Hide the rest.{" "}
              <span className="text-foreground/80">Project items</span> are a list type;{" "}
              <Link to="/projects" className="text-primary hover:underline">Projects</Link> group work across types.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
            {showHidden ? "Hide empty types" : "Show all types"}
          </Button>
        </div>

        <div className="mt-6 space-y-1.5">
          <Link
            to="/lists/all"
            className="flex min-h-[52px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 hover:shadow-sm transition"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[6px] border bg-muted text-muted-foreground border-border">
              <LayoutList className="h-[18px] w-[18px]" />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">All lists</p>
              <p className="text-xs text-muted-foreground">{activeAll} active</p>
            </div>
          </Link>

          {pinnedFirst.map((t) => {
            const Icon = t.icon;
            const c = all.filter((i) => i.type === t.key && !i.completed).length;
            const isPinned = PINNED_LIST_KEYS.includes(t.key);
            const isHidden = hidden.includes(t.key);
            return (
              <div
                key={t.key}
                className={cn(
                  "flex min-h-[52px] items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5",
                  isHidden && "opacity-50"
                )}
              >
                <Link to={`/lists/${t.key}`} className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1.5">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-[6px] border", t.tone)}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5">
                      {t.plural || t.label}
                      {isPinned && <Pin className="h-3 w-3 text-primary" aria-label="Pinned" />}
                    </p>
                    <p className="text-xs text-muted-foreground">{c} active</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={() => toggleHidden(t.key)}
                  className="grid h-10 w-10 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent"
                  aria-label={isHidden ? `Show ${t.label}` : `Hide ${t.label}`}
                  title={isHidden ? "Show on home lists" : "Hide from lists overview"}
                >
                  {isHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (type === "all") {
    const sorted = applyPeopleFilters([...all].sort(sortItems), filterPerson, filterResponsible);
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
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex items-center gap-2 mb-1">
          <Link to="/lists" className="text-sm text-muted-foreground hover:text-foreground">Lists</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="page-title flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-[6px] border bg-muted text-muted-foreground border-border">
              <LayoutList className="h-4 w-4" />
            </span>
            All
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{active.length} active · {done.length} done</p>
        <TypePicker active="all" />
        <ListsFilterBar
          person={filterPerson}
          responsible={filterResponsible}
          onPerson={setFilterPerson}
          onResponsible={setFilterResponsible}
          peopleNames={peopleNames}
        />

        <div className="space-y-2">
          {typeOrder.map((key) => {
            const TI = ITEM_TYPE_MAP[key];
            const Icon = TI.icon;
            return (
              <CollapsibleListSection
                key={key}
                storageKey={`type:${key}`}
                label={TI.plural || TI.label}
                count={byType[key].length}
                icon={
                  <span className={cn("grid h-6 w-6 place-items-center rounded-[4px] border", TI.tone)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                }
              >
                {key === "grocery" ? (
                  <div className="space-y-2">
                    <ShopModeLink compact />
                    <GroceryView items={byType[key]} />
                  </div>
                ) : (
                  <ItemList items={byType[key]} />
                )}
              </CollapsibleListSection>
            );
          })}
          {orphanKeys.map((key) => (
            <CollapsibleListSection
              key={key}
              storageKey={`type:${key}`}
              label={key}
              count={byType[key].length}
            >
              <ItemList items={byType[key]} />
            </CollapsibleListSection>
          ))}
          {!active.length && (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No items yet. Add some with Quick Add.
            </div>
          )}
        </div>

        {done.length > 0 && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm text-muted-foreground mb-2 min-h-[44px] flex items-center">{done.length} completed</summary>
            <ItemList items={done} />
          </details>
        )}
      </div>
    );
  }

  const TI = ITEM_TYPE_MAP[type];
  if (!TI) return <div className="p-8 text-center text-muted-foreground">Unknown list.</div>;

  const list = applyPeopleFilters(all.filter((i) => i.type === type).sort(sortItems), filterPerson, filterResponsible);
  const active = list.filter((i) => !i.completed);
  const done = list.filter((i) => i.completed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/lists" className="text-sm text-muted-foreground hover:text-foreground">Lists</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="page-title flex items-center gap-2">
            <span className={cn("grid h-8 w-8 place-items-center rounded-[6px] border", TI.tone)}><TI.icon className="h-4 w-4" /></span>
            {TI.plural || TI.label}
          </h1>
        </div>
        {type === "grocery" && <ShopModeLink />}
      </div>
      {type === "project_item" && (
        <p className="text-xs text-muted-foreground mb-2">
          These are individual project-typed items. Manage project containers on{" "}
          <Link to="/projects" className="text-primary hover:underline">Projects</Link>.
        </p>
      )}
      <p className="text-sm text-muted-foreground mb-3">{active.length} active · {done.length} done</p>
      <TypePicker active={type} />
      <ListsFilterBar
        person={filterPerson}
        responsible={filterResponsible}
        onPerson={setFilterPerson}
        onResponsible={setFilterResponsible}
        peopleNames={peopleNames}
      />

      {type === "grocery" ? (
        <GroceryView items={active} />
      ) : (
        <ItemList items={active} emptyHint={`No ${(TI.plural || TI.label).toLowerCase()} yet. Add one with Quick Add.`} />
      )}

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground mb-2 min-h-[44px] flex items-center">{done.length} completed</summary>
          <ItemList items={done} />
        </details>
      )}
    </div>
  );
}

function ShopModeLink({ compact = false }) {
  return (
    <Button
      asChild
      variant={compact ? "outline" : "default"}
      size="sm"
      className={cn("min-h-[40px]", compact && "w-full sm:w-auto")}
    >
      <Link to="/lists/grocery/shop">
        <ShoppingCart className="h-4 w-4 mr-1.5" />
        {compact ? "Shop" : "Start shopping"}
      </Link>
    </Button>
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
    <div className="space-y-1">
      {GROCERY_CATEGORIES.filter((c) => (groups[c] || []).length).map((c) => (
        <CollapsibleListSection
          key={c}
          storageKey={`aisle:${c}`}
          label={c}
          count={groups[c].length}
        >
          <ItemList items={groups[c]} />
        </CollapsibleListSection>
      ))}
      {!items.length && (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No groceries yet. Try “buy milk, eggs, and bread” in Quick Add.
        </div>
      )}
    </div>
  );
}
