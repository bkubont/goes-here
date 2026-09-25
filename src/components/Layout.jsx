import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  Home, CalendarDays, LayoutList, Users, FolderKanban, Search, Inbox, Plus, Sparkles, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useItems } from "@/lib/queries";
import { useAuth } from "@/lib/AuthContext";
import QuickAdd from "@/components/QuickAdd";

const NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/lists", label: "Lists", icon: LayoutList },
  { to: "/people", label: "People", icon: Users },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/search", label: "Search", icon: Search },
  { to: "/inbox", label: "Inbox", icon: Inbox },
];

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
          isActive
            ? "bg-brand text-brand-foreground shadow-sm"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const [quickOpen, setQuickOpen] = React.useState(false);
  const { user, logout } = useAuth();
  const { data: items } = useItems({});
  const inboxCount = (items || []).filter((i) => i.inbox || i.type === "to_schedule").length;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-sidebar px-4 py-6">
        <div className="flex items-center gap-2 px-2 mb-7">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-brand-foreground">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-lg font-semibold text-sidebar-foreground">Place</div>
            <div className="text-[11px] text-muted-foreground -mt-0.5">one place for everything</div>
          </div>
        </div>

        <button
          onClick={() => setQuickOpen(true)}
          className="mb-6 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Quick Add
        </button>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((n) => (
            <div key={n.to} className="relative">
              <NavItem {...n} />
              {n.to === "/inbox" && inboxCount > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-brand-foreground">
                  {inboxCount}
                </span>
              )}
            </div>
          ))}
        </nav>
        <div className="mt-4 px-2 text-[11px] text-muted-foreground">
          Capture once. Organize automatically.
        </div>
        <div className="mt-4 flex items-center gap-2 border-t border-border px-2 pt-4">
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={user?.email}>{user?.email}</span>
          <button
            onClick={logout}
            title="Sign out"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="md:hidden flex items-center justify-between border-b border-border bg-sidebar px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-brand-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-semibold">Place</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={logout}
              title="Sign out"
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-sidebar-accent"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <button
              onClick={() => setQuickOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex items-center justify-around border-t border-border bg-sidebar px-1 py-1.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "relative flex flex-col items-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium",
                    isActive ? "text-brand" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {n.label}
                {n.to === "/inbox" && inboxCount > 0 && (
                  <span className="absolute right-1 top-0.5 h-1.5 w-1.5 rounded-full bg-brand" />
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <QuickAdd open={quickOpen} onOpenChange={setQuickOpen} />
    </div>
  );
}