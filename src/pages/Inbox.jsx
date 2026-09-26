import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarClock, ArrowRight } from "lucide-react";
import { useItems } from "@/lib/queries";
import ItemList from "@/components/ItemList";

export default function Inbox() {
  const { data: items } = useItems({});
  const all = items || [];

  const needsReview = all.filter((i) => i.inbox && !i.completed);
  const toSchedule = all.filter((i) => i.type === "to_schedule" && !i.completed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            A safety net — things that need a decision or a date before they can be organized.
          </p>
        </div>
        <Link
          to="/calendar"
          className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
        >
          Schedule on day grid <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <section className="mb-8">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold mb-2">
          <AlertCircle className="h-4.5 w-4.5 text-orange-600" style={{ width: 18, height: 18 }} /> Needs review
        </h2>
        <ItemList items={needsReview} emptyHint="Nothing needs your attention. You're all caught up." />
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold mb-2">
          <CalendarClock className="h-4.5 w-4.5 text-orange-600" style={{ width: 18, height: 18 }} /> To schedule
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          These need an appointment booked. Drag them onto the day calendar from the Unscheduled pool, or add a date here.
        </p>
        <ItemList items={toSchedule} emptyHint="Nothing waiting to be scheduled." />
      </section>
    </div>
  );
}
