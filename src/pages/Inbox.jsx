import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, CalendarClock, ArrowRight, CheckCircle2 } from "lucide-react";
import { useItems } from "@/lib/queries";
import ItemList from "@/components/ItemList";

export default function Inbox() {
  const { data: items } = useItems({});
  const all = items || [];

  const needsReview = all.filter((i) => i.inbox && !i.completed);
  const toSchedule = all.filter((i) => i.type === "to_schedule" && !i.completed);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title mb-1">Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Resolve ambiguity — give each item a date, owner, or list.
          </p>
        </div>
        <Link
          to="/calendar?tab=unscheduled"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-primary hover:underline"
        >
          Schedule on calendar <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="rounded-xl border border-attention/40 bg-attention/10 px-4 py-3 mb-6 text-sm">
        <p className="font-medium text-attention-foreground mb-1">Next steps</p>
        <ol className="list-decimal pl-5 text-muted-foreground space-y-1">
          <li>Open an item and fill Assigned to / Scheduled date.</li>
          <li>Turn off Needs review when it&apos;s clear.</li>
          <li>Use Calendar → Unscheduled to place timed blocks.</li>
        </ol>
      </div>

      <section className="mb-8">
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold mb-2">
          <AlertCircle className="h-[18px] w-[18px] text-attention" /> Needs review
          <span className="text-xs font-normal text-muted-foreground">· {needsReview.length}</span>
        </h2>
        <ItemList items={needsReview} emptyHint="Nothing needs your attention. You're all caught up." />
      </section>

      <section>
        <h2 className="flex items-center gap-2 font-heading text-base font-semibold mb-2">
          <CalendarClock className="h-[18px] w-[18px] text-attention" /> To schedule
          <span className="text-xs font-normal text-muted-foreground">· {toSchedule.length}</span>
        </h2>
        <p className="text-xs text-muted-foreground mb-3">
          These need an appointment. Schedule without drag from Calendar → Unscheduled, or add a date here.
        </p>
        <ItemList items={toSchedule} emptyHint="Nothing waiting to be scheduled." />
      </section>

      {!needsReview.length && !toSchedule.length && (
        <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-primary" /> Inbox clear
        </p>
      )}
    </div>
  );
}
