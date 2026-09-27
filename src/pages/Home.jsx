import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight, AlertCircle, CalendarClock, Receipt, Inbox as InboxIcon, Bell, Gift, History,
  ShoppingCart,
} from "lucide-react";
import { useItems, usePeople, invalidateAll, patchItemsCaches } from "@/lib/queries";
import { entities } from "@/api/entities";
import {
  ITEM_TYPE_MAP, PINNED_LIST_KEYS, isToday, isUpcoming, isOverdue, parseDay, toDayKey,
} from "@/lib/itemTypes";
import { formatRelativeTime } from "@/lib/relativeTime";
import {
  upcomingBirthdays, formatBirthdayCountdown, formatBirthdayShort,
} from "@/lib/birthdays";
import { expandRecurring, exceptionSet } from "@/lib/recurring";
import { dueReminders, snoozePatch } from "@/lib/reminders";
import { isAssignedToMe, useDevicePerson } from "@/lib/devicePerson";
import ItemList from "@/components/ItemList";
import ItemCard from "@/components/ItemCard";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import ReminderActions from "@/components/ReminderActions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";

function timeSortKey(it) {
  const t = it.time || "99:99";
  const d = parseDay(it.date || it.due_date);
  return `${d ? toDayKey(d) : "9999"}-${t}`;
}

function visibleOnDay(it, dayKey) {
  if (!dayKey) return true;
  if (it._recurringOccurrence) return true;
  return !exceptionSet(it).has(dayKey);
}

function DueRemindersBlock({ items, onDismiss, onSnooze }) {
  const [active, setActive] = React.useState(null);
  if (!items.length) return null;
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-base font-semibold flex items-center gap-2">
          <Bell className="h-4 w-4 text-attention" /> Due reminders
        </h2>
        <span className="text-xs text-muted-foreground">In-app only · no push</span>
      </div>
      <div className="space-y-2">
        {items.map((it) => (
          <div key={it.id} className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <ItemCard item={it} onOpen={setActive} />
            </div>
            <ReminderActions
              compact
              onDismiss={() => onDismiss(it)}
              onSnooze={(presetId) => onSnooze(it, presetId)}
            />
          </div>
        ))}
      </div>
      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </section>
  );
}

export default function Home() {
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [giftDraft, setGiftDraft] = React.useState(null);
  const meName = useDevicePerson();
  const [myDayOnly, setMyDayOnly] = React.useState(false);
  const all = items || [];
  const birthdaysSoon = upcomingBirthdays(people || [], 30);

  const weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const active = all.filter((i) => !i.completed);
  const withRepeats = [...active, ...expandRecurring(active, weekStart, weekEnd)];

  const todayAll = withRepeats
    .filter((i) => (isToday(i.date) || isToday(i.due_date)) && visibleOnDay(i, toDayKey(i.date || i.due_date)))
    .sort((a, b) => timeSortKey(a).localeCompare(timeSortKey(b)));

  const today = myDayOnly && meName
    ? todayAll.filter((i) => isAssignedToMe(i, meName))
    : todayAll;

  const upcoming = withRepeats
    .filter((i) => {
      const day = i.date || i.due_date;
      return isUpcoming(day) && !isToday(day) && visibleOnDay(i, toDayKey(day));
    })
    .sort((a, b) => (parseDay(a.date || a.due_date)?.getTime() ?? 0) - (parseDay(b.date || b.due_date)?.getTime() ?? 0))
    .slice(0, 8);

  const overdue = active.filter((i) =>
    (i.date && isOverdue(i.date) && !isToday(i.date)) ||
    (i.due_date && isOverdue(i.due_date) && !isToday(i.due_date))
  );
  const unscheduled = active.filter((i) => i.type === "to_schedule" || (!i.date && !i.due_date && ["todo", "errand", "event", "household"].includes(i.type)));
  const needsReview = active.filter((i) => i.inbox);
  const billsDue = active.filter((i) => i.type === "bill" && i.payment_status !== "paid" && (isOverdue(i.due_date) || isToday(i.due_date) || isUpcoming(i.due_date) || !i.due_date));
  const reminders = dueReminders(active);

  const recent = React.useMemo(() => {
    return [...all]
      .filter((i) => !i._recurringOccurrence)
      .sort((a, b) => {
        const aT = a.updated_at || a.created_date || "";
        const bT = b.updated_at || b.created_date || "";
        return String(bT).localeCompare(String(aT));
      })
      .slice(0, 12);
  }, [all]);

  const [recentActive, setRecentActive] = React.useState(null);

  const attention = [
    overdue.length > 0 && {
      key: "overdue",
      label: "Overdue",
      count: overdue.length,
      hint: "Reschedule or complete",
      to: "/calendar",
      icon: AlertCircle,
    },
    unscheduled.length > 0 && {
      key: "unscheduled",
      label: "Unscheduled",
      count: unscheduled.length,
      hint: "Pick a day and time",
      to: "/calendar?tab=unscheduled",
      icon: CalendarClock,
    },
    needsReview.length > 0 && {
      key: "review",
      label: "Needs review",
      count: needsReview.length,
      hint: "Clarify and file",
      to: "/inbox",
      icon: InboxIcon,
    },
    billsDue.length > 0 && {
      key: "bills",
      label: "Bills due",
      count: billsDue.length,
      hint: "Pay or mark paid",
      to: "/lists/bill",
      icon: Receipt,
    },
    reminders.length > 0 && {
      key: "reminders",
      label: "Due reminders",
      count: reminders.length,
      hint: "Stored in GoesHere — no push yet",
      to: "/inbox#reminders",
      icon: Bell,
    },
  ].filter(Boolean);

  const pinned = PINNED_LIST_KEYS.map((key) => {
    const t = ITEM_TYPE_MAP[key];
    const count = all.filter((i) => i.type === key && !i.completed).length;
    return { ...t, count };
  }).filter((t) => t.count > 0 || ["todo", "bill"].includes(t.key));

  const groceryOpen = all.filter((i) => i.type === "grocery" && !i.completed).length;

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long", month: "long", day: "numeric",
  });

  async function dismissReminder(item) {
    try {
      const row = await entities.Item.update(item.id, { reminder_dismissed_at: new Date().toISOString() });
      patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
      await invalidateAll();
    } catch (e) {
      toast({ title: "Could not dismiss", description: e.message, variant: "destructive" });
    }
  }

  async function snoozeReminder(item, presetId) {
    const patch = snoozePatch(presetId);
    if (!patch) return;
    try {
      const row = await entities.Item.update(item.id, patch);
      patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
      await invalidateAll();
      toast({ title: "Snoozed", description: "Reminder will come back after the snooze ends." });
    } catch (e) {
      toast({ title: "Could not snooze", description: e.message, variant: "destructive" });
    }
  }

  function openGiftDraft(personName) {
    setGiftDraft({
      _draft: true,
      id: `draft-gift-${personName}`,
      content: "",
      type: "gift",
      person_name: personName,
      completed: false,
      board_status: "backlog",
      tags: [],
      inbox: false,
      wrapped: false,
      priority: "medium",
    });
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8 space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">{dateLabel}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="page-title">Today</h1>
          <button
            type="button"
            onClick={() => {
              if (!meName) {
                toast({
                  title: "Pick “This device is” first",
                  description: "Settings → This device is — choose your person name.",
                });
                return;
              }
              setMyDayOnly((v) => !v);
            }}
            className={cn(
              "inline-flex min-h-[36px] items-center rounded-[6px] border px-2.5 text-xs font-medium transition",
              myDayOnly && meName
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
            aria-pressed={myDayOnly && !!meName}
          >
            My Day{meName ? ` · ${meName}` : ""}
          </button>
        </div>
        {myDayOnly && meName && (
          <p className="text-xs text-muted-foreground mt-1">
            Showing today&apos;s items assigned to {meName}.
          </p>
        )}
      </header>

      {attention.length > 0 && (
        <section>
          <h2 className="font-heading text-base font-semibold mb-3">Needs attention</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {attention.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.key}
                  to={a.to}
                  className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition hover:border-attention/60 hover:shadow-sm"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-[6px] bg-attention/15 text-attention-foreground">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {a.label} <span className="text-muted-foreground font-normal">· {a.count}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{a.hint}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {birthdaysSoon.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-base font-semibold flex items-center gap-2">
              <Gift className="h-4 w-4 text-primary" /> Upcoming birthdays
            </h2>
            <Link to="/lists/gift" className="text-sm text-primary flex items-center gap-1 hover:underline min-h-[44px]">
              Gifts <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="space-y-2">
            {birthdaysSoon.map(({ person, nextDate, daysUntil }) => {
              const giftCount = all.filter(
                (i) => i.type === "gift" && !i.completed && i.person_name === person.name
              ).length;
              return (
                <div
                  key={person.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-3"
                >
                  <span
                    className="grid h-10 w-10 place-items-center rounded-full text-white text-sm font-semibold shrink-0"
                    style={{ background: person.color || "#0404A9" }}
                  >
                    {person.name?.[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{person.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatBirthdayShort(nextDate)} · {formatBirthdayCountdown(daysUntil)}
                      {giftCount > 0 ? ` · ${giftCount} gift${giftCount !== 1 ? "s" : ""}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => navigate(`/lists/gift?person=${encodeURIComponent(person.name)}`)}
                    >
                      View gifts
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="min-h-[40px]"
                      onClick={() => openGiftDraft(person.name)}
                    >
                      Add gift
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <ItemDetailDrawer
            item={giftDraft}
            open={!!giftDraft}
            onOpenChange={(o) => !o && setGiftDraft(null)}
          />
        </section>
      )}

      {reminders.length > 0 && (
        <DueRemindersBlock
          items={reminders.slice(0, 5)}
          onDismiss={dismissReminder}
          onSnooze={snoozeReminder}
        />
      )}

      {recent.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-heading text-base font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" /> Recent
            </h2>
            <span className="text-xs text-muted-foreground">Last updated</span>
          </div>
          <div className="space-y-1.5">
            {recent.map((it) => {
              const TI = ITEM_TYPE_MAP[it.type] || ITEM_TYPE_MAP.todo;
              const when = formatRelativeTime(it.updated_at || it.created_date);
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setRecentActive(it)}
                  className="flex w-full min-h-[48px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 text-left transition hover:shadow-sm"
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[6px] border", TI.tone)}>
                    <TI.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium truncate", it.completed && "line-through opacity-70")}>
                      {it.content}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {TI.label}
                      {it.responsible_name ? ` · ${it.responsible_name}` : ""}
                      {when ? ` · ${when}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <ItemDetailDrawer
            item={recentActive}
            open={!!recentActive}
            onOpenChange={(o) => !o && setRecentActive(null)}
          />
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Today&apos;s schedule</h2>
          <span className="text-xs text-muted-foreground">{today.length} item{today.length !== 1 ? "s" : ""}</span>
        </div>
        <ItemList items={today} emptyHint="Nothing scheduled for today. Enjoy the breathing room." />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Upcoming</h2>
          <Link to="/calendar" className="text-sm text-primary flex items-center gap-1 hover:underline min-h-[44px]">
            Calendar <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ItemList items={upcoming} emptyHint="Nothing coming up this week." />
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading text-base font-semibold">Lists</h2>
          <Link to="/lists" className="text-sm text-primary flex items-center gap-1 hover:underline min-h-[44px]">
            View all <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {groceryOpen > 0 && (
          <Link
            to="/lists/grocery/shop"
            className="mb-2 flex min-h-[56px] items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-3 transition hover:shadow-sm"
          >
            <span className="grid h-9 w-9 place-items-center rounded-[6px] border border-primary/30 bg-card text-primary">
              <ShoppingCart className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Shop groceries</p>
              <p className="text-xs text-muted-foreground">
                {groceryOpen} item{groceryOpen !== 1 ? "s" : ""} on the list
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-primary shrink-0" />
          </Link>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {pinned.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.key}
                to={`/lists/${t.key}`}
                className="flex min-h-[56px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition hover:shadow-sm"
              >
                <span className={cn("grid h-9 w-9 place-items-center rounded-[6px] border", t.tone)}>
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.plural || t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.count} active</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
