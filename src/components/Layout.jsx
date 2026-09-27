import React from "react";
import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import {
  Home, CalendarDays, LayoutList, Columns3, Users, FolderKanban,
  Search, Inbox, Plus, LogOut, MoreHorizontal, Settings, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useItems, ITEMS_PAGE_SIZE } from "@/lib/queries";
import { useAuth } from "@/lib/AuthContext";
import { useRealtimeSync } from "@/hooks/useRealtimeSync";
import QuickAdd from "@/components/QuickAdd";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import ErrorBoundary from "@/components/ErrorBoundary";
import ItemsLoadMoreBanner from "@/components/ItemsLoadMoreBanner";

/** Blank create draft for the full Add drawer (type picker + all fields). */
function blankCreateDraft() {
  return {
    _draft: true,
    id: `draft-new-${Date.now()}`,
    content: "",
    type: "todo",
    completed: false,
    board_status: "backlog",
    tags: [],
    inbox: false,
    priority: "medium",
    responsible_name: "",
  };
}

const DESKTOP_NAV = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/lists", label: "Lists", icon: LayoutList },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/board", label: "Board", icon: Columns3 },
  { to: "/people", label: "People", icon: Users },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/search", label: "Search", icon: Search },
  { to: "/settings", label: "Settings", icon: Settings },
];

const MOBILE_PRIMARY = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/lists", label: "Lists", icon: LayoutList },
  { to: "/inbox", label: "Inbox", icon: Inbox },
];

const MORE_ROUTES = ["/board", "/people", "/projects", "/settings", "/search"];

function BrandMark({ size = 36 }) {
  return (
    <div
      className="grid place-items-center rounded-[8px] bg-primary text-attention shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <MapPin style={{ width: size * 0.5, height: size * 0.5 }} strokeWidth={2.25} />
    </div>
  );
}

function NavItem({ to, label, icon: Icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-[6px] px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px]",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-nav-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span>{label}</span>
    </NavLink>
  );
}

export default function Layout() {
  const [quickOpen, setQuickOpen] = React.useState(false);
  const [createDraft, setCreateDraft] = React.useState(null);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const { user, logout } = useAuth();
  const { data: items, hasMore, loadMore, isLoadingMore, pageSize } = useItems({});
  const location = useLocation();
  const inboxCount = (items || []).filter((i) => !i.completed && (i.inbox || i.type === "to_schedule")).length;
  const itemCount = (items || []).length;
  const moreActive = MORE_ROUTES.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  const isShoppingMode = location.pathname === "/lists/grocery/shop";

  // Multi-device sync: invalidate React Query when other family clients change data.
  useRealtimeSync();

  React.useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  function openFullAdd() {
    setCreateDraft(blankCreateDraft());
  }

  // Full-screen shopping checklist — hide app chrome for focus at the store.
  if (isShoppingMode) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-canvas">
        <div className="min-h-0 flex-1">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Desktop sidebar — black */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-nav px-4 py-6 text-nav-foreground">
        <div className="flex items-center gap-2.5 px-2 mb-7">
          <BrandMark size={36} />
          <div className="leading-tight">
            <div className="font-heading text-lg font-semibold text-white">GoesHere</div>
            <div className="text-[11px] text-nav-foreground/70 -mt-0.5">family planning</div>
          </div>
        </div>

        <div className="mb-6 flex items-stretch gap-1.5">
          <button
            type="button"
            onClick={() => setQuickOpen(true)}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[6px] bg-attention px-3 py-3 text-sm font-semibold text-attention-foreground shadow-sm transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Quick Add
          </button>
          <button
            type="button"
            onClick={openFullAdd}
            aria-label="Add with details"
            title="Add with details"
            className="grid h-auto min-h-[44px] w-11 shrink-0 place-items-center rounded-[6px] bg-attention text-attention-foreground shadow-sm transition hover:opacity-90"
          >
            <Plus className="h-5 w-5" strokeWidth={2.5} />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5" aria-label="Main">
          {DESKTOP_NAV.map((n) => (
            <div key={n.to} className="relative">
              <NavItem {...n} />
              {n.to === "/inbox" && inboxCount > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-[4px] bg-attention px-1.5 py-0.5 text-[10px] font-semibold text-attention-foreground">
                  {inboxCount}
                </span>
              )}
            </div>
          ))}
        </nav>

        <div className="mt-4 flex items-center gap-2 border-t border-sidebar-border px-2 pt-4">
          <span className="min-w-0 flex-1 truncate text-xs text-nav-foreground/70" title={user?.email}>{user?.email}</span>
          <button
            type="button"
            onClick={logout}
            title="Sign out"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[6px] text-nav-foreground/70 transition hover:bg-sidebar-accent hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Persistent header */}
        <header className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <BrandMark size={32} />
            <span className="font-heading text-base font-semibold">GoesHere</span>
          </div>
          <div className="hidden md:block font-heading text-sm font-medium text-muted-foreground">
            Capture once. Organize automatically.
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <Link
              to="/search"
              aria-label="Search"
              className="grid h-11 w-11 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Search className="h-5 w-5" />
            </Link>
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-[6px] bg-attention px-3.5 py-2 text-sm font-semibold text-attention-foreground shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Quick Add</span>
              <span className="sm:hidden">Add</span>
            </button>
            <button
              type="button"
              onClick={openFullAdd}
              aria-label="Add with details"
              title="Add with details"
              className="grid h-11 w-11 place-items-center rounded-[6px] bg-attention text-attention-foreground shadow-sm transition hover:opacity-90"
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="grid h-11 w-11 place-items-center rounded-[6px] text-muted-foreground hover:bg-accent md:hidden"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto scrollbar-thin pb-2">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
          {hasMore && (
            <div className="mx-auto max-w-5xl px-4 py-3 md:px-8">
              <ItemsLoadMoreBanner
                count={itemCount}
                pageSize={pageSize || ITEMS_PAGE_SIZE}
                hasMore={hasMore}
                onLoadMore={loadMore}
                isLoadingMore={isLoadingMore}
              />
            </div>
          )}
        </main>

        {/* Mobile bottom nav — five destinations */}
        <nav className="md:hidden flex items-stretch justify-around border-t border-border bg-card px-1 pb-[env(safe-area-inset-bottom)]" aria-label="Mobile">
          {MOBILE_PRIMARY.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "relative flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                <Icon className="h-5 w-5" />
                {n.label}
                {n.to === "/inbox" && inboxCount > 0 && (
                  <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-attention" />
                )}
              </NavLink>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "relative flex min-h-[52px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
              moreActive || moreOpen ? "text-primary" : "text-muted-foreground"
            )}
            aria-expanded={moreOpen}
            aria-label="More"
          >
            <MoreHorizontal className="h-5 w-5" />
            More
          </button>
        </nav>

        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-40" role="presentation">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close more menu" onClick={() => setMoreOpen(false)} />
            <div className="absolute bottom-[calc(52px+env(safe-area-inset-bottom))] left-3 right-3 rounded-xl border border-border bg-card p-2 shadow-lg">
              {[
                { to: "/board", label: "Board", icon: Columns3 },
                { to: "/people", label: "People", icon: Users },
                { to: "/projects", label: "Projects", icon: FolderKanban },
                { to: "/settings", label: "Settings", icon: Settings },
              ].map((n) => {
                const Icon = n.icon;
                return (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-[44px] items-center gap-3 rounded-[6px] px-3 py-2.5 text-sm font-medium",
                        isActive ? "bg-primary/10 text-primary" : "text-foreground hover:bg-accent"
                      )
                    }
                  >
                    <Icon className="h-5 w-5" />
                    {n.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <QuickAdd open={quickOpen} onOpenChange={setQuickOpen} />
      <ItemDetailDrawer
        item={createDraft}
        open={!!createDraft}
        onOpenChange={(o) => !o && setCreateDraft(null)}
      />
    </div>
  );
}
