import React from "react";
import { Link } from "react-router-dom";
import {
  User, Users, Clock, HelpCircle, Archive, LogOut, ChevronRight, CheckSquare,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useItems } from "@/lib/queries";
import ItemList from "@/components/ItemList";

const TZ_KEY = "goeshere.timezone";

export default function Settings() {
  const { user, logout } = useAuth();
  const { data: items } = useItems({});
  const [timezone, setTimezone] = React.useState(() => {
    try {
      return localStorage.getItem(TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  });
  const [showCompleted, setShowCompleted] = React.useState(false);

  const completed = (items || [])
    .filter((i) => i.completed)
    .sort((a, b) => String(b.completed_date || b.updated_date || "").localeCompare(String(a.completed_date || a.updated_date || "")))
    .slice(0, 40);

  function saveTimezone(tz) {
    setTimezone(tz);
    localStorage.setItem(TZ_KEY, tz);
  }

  const zones = React.useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Phoenix", "UTC", "Europe/London", "Europe/Paris",
      ];
    }
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-8 space-y-6">
      <header>
        <h1 className="page-title">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Account, household, and help.</p>
      </header>

      <section className="rounded-xl border border-border bg-card divide-y divide-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-[6px] bg-primary/10 text-primary">
            <User className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Account</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email || "Signed in"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="flex w-full min-h-[52px] items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
        >
          <LogOut className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm font-medium">Sign out</span>
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <span className="grid h-10 w-10 place-items-center rounded-[6px] bg-muted text-muted-foreground">
            <Users className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Household</p>
            <p className="text-xs text-muted-foreground">Family members shared with this GoesHere list.</p>
          </div>
        </div>
        <Link
          to="/people"
          className="flex min-h-[52px] items-center justify-between px-4 py-3 text-sm hover:bg-accent/50"
        >
          Manage people
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Timezone</p>
        </div>
        <p className="text-xs text-muted-foreground">Used for “today” and scheduling on this device.</p>
        <select
          value={timezone}
          onChange={(e) => saveTimezone(e.target.value)}
          className="mt-1 h-11 w-full rounded-[6px] border border-border bg-card px-3 text-sm"
        >
          {zones.map((z) => (
            <option key={z} value={z}>{z}</option>
          ))}
        </select>
      </section>

      <section className="rounded-xl border border-border bg-card divide-y divide-border">
        <button
          type="button"
          onClick={() => setShowCompleted((v) => !v)}
          className="flex w-full min-h-[52px] items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
        >
          <Archive className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Completed &amp; archive</p>
            <p className="text-xs text-muted-foreground">{completed.length} recent completed items</p>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition ${showCompleted ? "rotate-90" : ""}`} />
        </button>
        {showCompleted && (
          <div className="px-4 py-3">
            <ItemList items={completed} emptyHint="No completed items yet." />
          </div>
        )}
        <Link
          to="/lists/all"
          className="flex min-h-[52px] items-center gap-3 px-4 py-3 text-sm hover:bg-accent/50"
        >
          <CheckSquare className="h-5 w-5 text-muted-foreground" />
          Browse all lists
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <HelpCircle className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Help</p>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5 list-disc pl-5">
          <li>Use <strong className="text-foreground font-medium">Quick Add</strong> to capture anything in one field.</li>
          <li><strong className="text-foreground font-medium">Inbox</strong> holds items that need a decision or date.</li>
          <li>Gold highlights mean something needs attention; blue is for actions.</li>
        </ul>
      </section>
    </div>
  );
}
