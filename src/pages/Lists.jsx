import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  LayoutList, EyeOff, Eye, ShoppingCart, Plus, Settings, AlertCircle, CalendarClock, Users,
} from "lucide-react";
import { useItems, usePeople } from "@/lib/queries";
import {
  ITEM_TYPE_MAP, GROCERY_CATEGORIES, isOverdue, isToday,
} from "@/lib/itemTypes";
import {
  loadListPrefs, visiblePlanningTypes, orderedPlanningTypes, setListTypeHidden,
  getListTypeColor, setListTypeColor,
} from "@/lib/listPrefs";
import ItemList from "@/components/ItemList";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import CollapsibleListSection from "@/components/CollapsibleListSection";
import BulkCompleteBar, { useListSelection } from "@/components/BulkCompleteBar";
import ShoppingListActions from "@/components/ShoppingListActions";
import StaplesPanel from "@/components/StaplesPanel";
import ListColorButton from "@/components/ListColorButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadListsFilters, saveListsFilters, SAVED_FILTERS_HINT } from "@/lib/savedFilters";
import { giftBudgetRollup, formatMoney } from "@/lib/giftBudget";
import { surfaceAccentStyle } from "@/lib/colorPalette";

/** Types that count as “need scheduled” when they have no date/due (Home/Inbox). */
const SCHEDULABLE_TYPES = ["todo", "errand", "event", "household"];

/** Create draft for ItemDetailDrawer — assignee filled by drawer from device person. */
function blankCreateDraft(type = "todo") {
  return {
    _draft: true,
    id: `draft-${type}-${Date.now()}`,
    content: "",
    type,
    completed: false,
    board_status: "backlog",
    tags: [],
    inbox: false,
    priority: "medium",
    responsible_name: "",
  };
}

/** Match Home: to_schedule, or schedulable types missing both date and due_date. */
function needsScheduled(item) {
  if (item.completed) return false;
  if (item.type === "to_schedule") return true;
  if (!item.date && !item.due_date && SCHEDULABLE_TYPES.includes(item.type)) return true;
  return false;
}

/** Match Home overdue attention (past day, not today). */
function isPastDue(item) {
  if (item.completed) return false;
  return (
    (item.date && isOverdue(item.date) && !isToday(item.date))
    || (item.due_date && isOverdue(item.due_date) && !isToday(item.due_date))
  );
}

function listHubStats(items) {
  const active = items.filter((i) => !i.completed);
  const needSched = active.filter(needsScheduled).length;
  const pastDue = active.filter(isPastDue).length;
  const byAssignee = {};
  active.forEach((i) => {
    const name = (i.responsible_name || "").trim();
    if (!name) return;
    byAssignee[name] = (byAssignee[name] || 0) + 1;
  });
  const assignees = Object.entries(byAssignee)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    active: active.length,
    needSched,
    pastDue,
    assignees,
    peopleCount: assignees.length,
  };
}

function HubStatTags({ stats }) {
  const top = stats.assignees.slice(0, 2);
  const extraPeople = Math.max(0, stats.peopleCount - top.length);
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      <span className="inline-flex items-center rounded-[4px] border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-foreground/80">
        {stats.active} active
      </span>
      {stats.needSched > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <CalendarClock className="h-2.5 w-2.5" aria-hidden />
          {stats.needSched} need sched
        </span>
      )}
      {stats.pastDue > 0 && (
        <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-attention/40 bg-attention/15 px-1.5 py-0.5 text-[10px] font-semibold text-attention-foreground">
          <AlertCircle className="h-2.5 w-2.5" aria-hidden />
          {stats.pastDue} past due
        </span>
      )}
      {stats.peopleCount > 0 && (
        <span
          className="inline-flex items-center gap-0.5 rounded-[4px] border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground max-w-full truncate"
          title={stats.assignees.map((a) => `${a.name} (${a.count})`).join(", ")}
        >
          <Users className="h-2.5 w-2.5 shrink-0" aria-hidden />
          {top.map((a, i) => (
            <span key={a.name}>
              {i > 0 ? " · " : ""}
              {a.name}
              {a.count > 1 ? ` ${a.count}` : ""}
            </span>
          ))}
          {extraPeople > 0 && (
            <span>
              {" "}
              +{extraPeople}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

function ListHubCard({
  to,
  label,
  icon: Icon,
  toneClass,
  accentColor,
  colorControl,
  stats,
  onAdd,
  dimmed,
  footer,
  hideToggle,
}) {
  const pastDue = stats?.pastDue > 0;
  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-3 transition hover:shadow-sm",
        pastDue ? "border-attention/50" : "border-border",
        dimmed && "opacity-50"
      )}
      style={accentColor ? surfaceAccentStyle(accentColor) : undefined}
    >
      <div className="flex items-start gap-2">
        <Link to={to} className="flex min-w-0 flex-1 items-start gap-2.5">
          <span
            className={cn(
              "grid h-9 w-9 shrink-0 place-items-center rounded-[6px] border",
              accentColor ? "border-border text-white" : toneClass
            )}
            style={accentColor ? { background: accentColor } : undefined}
          >
            <Icon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">
              <span className="truncate">{label}</span>
            </p>
            {stats && <HubStatTags stats={stats} />}
          </div>
        </Link>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {onAdd && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAdd();
              }}
              className="grid h-9 w-9 place-items-center rounded-[6px] bg-attention text-attention-foreground hover:opacity-90"
              aria-label={`Add to ${label}`}
              title={`Add to ${label}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
          {colorControl}
          {hideToggle}
        </div>
      </div>
      {footer && <div className="mt-2 pt-2 border-t border-border">{footer}</div>}
    </div>
  );
}


function sortItems(a, b) {
  const byDone = Number(a.completed) - Number(b.completed);
  if (byDone !== 0) return byDone;
  const aDate = a.due_date || a.date || "";
  const bDate = b.due_date || b.date || "";
  if (aDate !== bDate) return String(aDate).localeCompare(String(bDate));
  const aUp = a.updated_at || a.updated_date || a.created_date || "";
  const bUp = b.updated_at || b.updated_date || b.created_date || "";
  return String(bUp).localeCompare(String(aUp));
}

function TypePicker({ active, visibleTypes = [] }) {
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
      <Link
        to="/lists/grocery"
        className={cn(
          "rounded-[6px] border px-2.5 min-h-[36px] inline-flex items-center text-xs font-medium transition",
          active === "grocery"
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-accent"
        )}
      >
        Shopping
      </Link>
      {visibleTypes.map((t) => (
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const all = items || [];
  const [listPrefs, setListPrefs] = React.useState(loadListPrefs);
  const [showHidden, setShowHidden] = React.useState(false);
  const [giftDraft, setGiftDraft] = React.useState(null);
  const [createDraft, setCreateDraft] = React.useState(null);
  const selection = useListSelection(type || "overview");
  const saved = React.useMemo(() => loadListsFilters(), []);
  const personFromUrl = searchParams.get("person");
  const [filterPerson, setFilterPerson] = React.useState(personFromUrl || saved.person || "all");
  const [filterResponsible, setFilterResponsible] = React.useState(saved.responsible || "all");
  const visibleTypes = React.useMemo(() => visiblePlanningTypes(listPrefs), [listPrefs]);
  const orderedTypes = React.useMemo(() => orderedPlanningTypes(listPrefs), [listPrefs]);

  React.useEffect(() => {
    if (personFromUrl) setFilterPerson(personFromUrl);
  }, [personFromUrl]);

  function setPersonFilter(value) {
    setFilterPerson(value);
    const next = new URLSearchParams(searchParams);
    if (value && value !== "all") next.set("person", value);
    else next.delete("person");
    setSearchParams(next, { replace: true });
  }

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
    const isHidden = listPrefs.hidden.includes(key);
    setListPrefs(setListTypeHidden(key, !isHidden));
  }

  function setTypeColor(key, color) {
    setListPrefs(setListTypeColor(key, color));
  }

  if (!type) {
    const groceryStats = listHubStats(all.filter((i) => i.type === "grocery"));
    const allStats = listHubStats(all.filter((i) => i.type !== "grocery"));
    const hubTypes = showHidden ? orderedTypes : visibleTypes;
    const groceryTI = ITEM_TYPE_MAP.grocery;
    const groceryColor = getListTypeColor("grocery", listPrefs);

    return (
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
          <div>
            <h1 className="page-title mb-1">Lists</h1>
            <p className="text-sm text-muted-foreground">
              Shopping stays separate from planning lists. Reorder or hide types in{" "}
              <Link to="/settings" className="text-primary hover:underline">Settings → Lists</Link>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="min-h-[40px]" asChild>
              <Link to="/settings#lists">
                <Settings className="h-4 w-4 mr-1" /> Manage
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" className="min-h-[40px]" onClick={() => setShowHidden((v) => !v)}>
              {showHidden ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              {showHidden ? "Hide hidden types" : "Show hidden types"}
            </Button>
          </div>
        </div>

        <section className="mt-6">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Shopping
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <ListHubCard
              to="/lists/grocery"
              label="Groceries"
              icon={ShoppingCart}
              toneClass={groceryTI.tone}
              accentColor={groceryColor}
              stats={groceryStats}
              onAdd={() => setCreateDraft(blankCreateDraft("grocery"))}
              colorControl={(
                <ListColorButton
                  color={groceryColor}
                  label="Groceries list color"
                  onChange={(c) => setTypeColor("grocery", c)}
                />
              )}
              footer={<ShopModeLink compact />}
            />
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-heading text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Lists
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <ListHubCard
              to="/lists/all"
              label="All lists"
              icon={LayoutList}
              toneClass="bg-muted text-muted-foreground border-border"
              stats={allStats}
            />

            {hubTypes.map((t) => {
              const stats = listHubStats(all.filter((i) => i.type === t.key));
              const isHidden = listPrefs.hidden.includes(t.key);
              const listColor = getListTypeColor(t.key, listPrefs);
              return (
                <ListHubCard
                  key={t.key}
                  to={`/lists/${t.key}`}
                  label={t.plural || t.label}
                  icon={t.icon}
                  toneClass={t.tone}
                  accentColor={listColor}
                  stats={stats}
                  dimmed={isHidden}
                  onAdd={() => setCreateDraft(blankCreateDraft(t.key))}
                  colorControl={(
                    <ListColorButton
                      color={listColor}
                      label={`${t.plural || t.label} list color`}
                      onChange={(color) => setTypeColor(t.key, color)}
                    />
                  )}
                  hideToggle={(
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        toggleHidden(t.key);
                      }}
                      className="grid h-8 w-8 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent"
                      aria-label={isHidden ? `Show ${t.label}` : `Hide ${t.label}`}
                      title={isHidden ? "Show on lists overview" : "Hide from lists overview"}
                    >
                      {isHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  )}
                />
              );
            })}
          </div>
        </section>

        <ItemDetailDrawer
          item={createDraft}
          open={!!createDraft}
          onOpenChange={(o) => !o && setCreateDraft(null)}
        />
      </div>
    );
  }

  if (type === "all") {
    const sorted = applyPeopleFilters(
      [...all].filter((i) => i.type !== "grocery").sort(sortItems),
      filterPerson,
      filterResponsible
    );
    const groceryOpen = all.filter((i) => i.type === "grocery" && !i.completed).length;
    const active = sorted.filter((i) => !i.completed);
    const done = sorted.filter((i) => i.completed);
    const byType = {};
    active.forEach((it) => {
      const key = it.type || "todo";
      (byType[key] = byType[key] || []).push(it);
    });
    const typeOrder = orderedTypes.map((t) => t.key).filter((k) => (byType[k] || []).length);
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
        <p className="text-sm text-muted-foreground mb-2">{active.length} active · {done.length} done · groceries excluded</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link
            to="/lists/grocery"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-[6px] border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-accent"
          >
            <ShoppingCart className="h-3.5 w-3.5" />
            Open shopping list
            {groceryOpen > 0 ? ` (${groceryOpen})` : ""}
          </Link>
          {groceryOpen > 0 && <ShopModeLink compact />}
        </div>
        <TypePicker active="all" visibleTypes={visibleTypes} />
        <ListsFilterBar
          person={filterPerson}
          responsible={filterResponsible}
          onPerson={setPersonFilter}
          onResponsible={setFilterResponsible}
          peopleNames={peopleNames}
        />

        <BulkCompleteBar
          selectMode={selection.selectMode}
          selectedIds={selection.selectedIds}
          items={active}
          onSelectModeChange={selection.setSelectMode}
          onSelectedIdsChange={selection.setSelectedIds}
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
                <ItemList items={byType[key]} {...selection.listProps} />
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
              <ItemList items={byType[key]} {...selection.listProps} />
            </CollapsibleListSection>
          ))}
          {!active.length && (
            <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
              No planning items yet. Add some with Quick Add.
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

  const listColor = getListTypeColor(type, listPrefs);
  const list = applyPeopleFilters(all.filter((i) => i.type === type).sort(sortItems), filterPerson, filterResponsible);
  const active = list.filter((i) => !i.completed);
  const done = list.filter((i) => i.completed);
  const giftRollup = type === "gift"
    ? giftBudgetRollup(
      active,
      filterPerson !== "all" ? filterPerson : null
    )
    : null;

  function openGiftDraft() {
    setGiftDraft({
      _draft: true,
      id: `draft-gift-${filterPerson || "new"}`,
      content: "",
      type: "gift",
      person_name: filterPerson !== "all" ? filterPerson : "",
      completed: false,
      board_status: "backlog",
      tags: [],
      inbox: false,
      wrapped: false,
      priority: "medium",
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/lists" className="text-sm text-muted-foreground hover:text-foreground">Lists</Link>
          <span className="text-muted-foreground">/</span>
          <h1 className="page-title flex items-center gap-2">
            <span
              className="grid h-8 w-8 place-items-center rounded-[6px] border border-border text-white"
              style={{ background: listColor }}
            >
              <TI.icon className="h-4 w-4" />
            </span>
            {type === "grocery" ? "Groceries" : (TI.plural || TI.label)}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ListColorButton
            color={listColor}
            label={`${TI.plural || TI.label} list color`}
            onChange={(c) => setTypeColor(type, c)}
          />
          {type === "grocery" && (
            <>
              <ShoppingListActions items={active} title="Grocery list" />
              <ShopModeLink />
            </>
          )}
          {type === "gift" && (
            <Button type="button" size="sm" className="min-h-[40px]" onClick={openGiftDraft}>
              <Plus className="h-4 w-4 mr-1" /> Add gift
            </Button>
          )}
        </div>
      </div>
      {type === "grocery" && (
        <p className="text-xs text-muted-foreground mb-2">
          Shopping list — aisle groups below. Use Start shopping for a full-screen checklist.
        </p>
      )}
      {type === "project_item" && (
        <p className="text-xs text-muted-foreground mb-2">
          These are individual project-typed items. Manage project containers on{" "}
          <Link to="/projects" className="text-primary hover:underline">Projects</Link>.
        </p>
      )}
      <p className="text-sm text-muted-foreground mb-1">{active.length} active · {done.length} done</p>
      {giftRollup && (giftRollup.budgetTotal != null || giftRollup.spentTotal != null) ? (
        <p className="text-sm text-muted-foreground mb-3">
          {giftRollup.budgetTotal != null && <span>Budget {formatMoney(giftRollup.budgetTotal)}</span>}
          {giftRollup.budgetTotal != null && giftRollup.spentTotal != null && <span> · </span>}
          {giftRollup.spentTotal != null && <span>Spent {formatMoney(giftRollup.spentTotal)}</span>}
          {giftRollup.budgetTotal != null && giftRollup.spentTotal != null && (
            <span> · Left {formatMoney(giftRollup.remaining)}</span>
          )}
          {filterPerson !== "all" ? ` for ${filterPerson}` : " (open gifts)"}
        </p>
      ) : (
        <div className="mb-3" />
      )}
      <TypePicker active={type} visibleTypes={visibleTypes} />
      <ListsFilterBar
        person={filterPerson}
        responsible={filterResponsible}
        onPerson={setPersonFilter}
        onResponsible={setFilterResponsible}
        peopleNames={peopleNames}
      />

      <BulkCompleteBar
        selectMode={selection.selectMode}
        selectedIds={selection.selectedIds}
        items={active}
        onSelectModeChange={selection.setSelectMode}
        onSelectedIdsChange={selection.setSelectedIds}
      />

      {type === "grocery" && (
        <div className="mb-4">
          <StaplesPanel
            groceryItems={all.filter((i) => i.type === "grocery")}
            selectedItems={
              selection.selectMode && selection.selectedIds?.size
                ? active.filter((i) => selection.selectedIds.has(i.id))
                : undefined
            }
          />
        </div>
      )}

      {type === "grocery" ? (
        <GroceryView items={active} listProps={selection.listProps} />
      ) : (
        <ItemList
          items={active}
          emptyHint={`No ${(TI.plural || TI.label).toLowerCase()} yet. Add one with Quick Add.`}
          {...selection.listProps}
        />
      )}

      {done.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-muted-foreground mb-2 min-h-[44px] flex items-center">{done.length} completed</summary>
          <ItemList items={done} />
        </details>
      )}

      <ItemDetailDrawer
        item={giftDraft}
        open={!!giftDraft}
        onOpenChange={(o) => !o && setGiftDraft(null)}
      />
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

function GroceryView({ items, listProps = {} }) {
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
          <ItemList items={groups[c]} {...listProps} />
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
