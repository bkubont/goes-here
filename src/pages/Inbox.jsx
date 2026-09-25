import React from "react";
import { AlertCircle, CalendarClock } from "lucide-react";
import { useItems } from "@/lib/queries";
import ItemList from "@/components/ItemList";

export default function Inbox() {
  const { data: items } = useItems({});
  const all = items || [];

  const needsReview = all.filter((i) => i.inbox && !i.completed);
  const toSchedule = all.filter((i) => i.type === "to_schedule" && !i.completed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
      <h1 className="font-display text-3xl font-semibold mb-1">Inbox</h1>
      <p className="text-sm text-muted-foreground mb-6">
        A safety net — things that need a decision or a date before they can be organized.
      </p>

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
        <p className="text-xs text-muted-foreground mb-3">These need an appointment booked. Add a date and they'll appear on the calendar automatically.</p>
        <ItemList items={toSchedule} emptyHint="Nothing waiting to be scheduled." />
      </section>
    </div>
  );
}