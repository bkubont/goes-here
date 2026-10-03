import React from "react";
import { Link } from "react-router-dom";
import { Columns3, Home, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { buildFamilyHubLinks } from "@/lib/calendarHub";

const ICONS = {
  doing: Columns3,
  household: Home,
  shopping: ShoppingCart,
};

/**
 * Compact kitchen-glance links into Board / Household / Shopping.
 * Not a card stack — single strip under the person filter or in a sidebar.
 */
export default function FamilyHubStrip({ items, todayKey, className, compact }) {
  const links = React.useMemo(
    () => buildFamilyHubLinks(items, { todayKey }),
    [items, todayKey]
  );

  if (!links.length) return null;

  return (
    <nav
      aria-label="Family hubs"
      className={cn(
        "flex flex-wrap items-center gap-1.5",
        compact ? "mb-3" : "mb-4",
        className
      )}
    >
      <span className="text-[11px] font-medium text-muted-foreground mr-0.5">
        Hubs
      </span>
      {links.map((link) => {
        const Icon = ICONS[link.key] || Columns3;
        return (
          <Link
            key={link.key}
            to={link.to}
            className={cn(
              "inline-flex min-h-[36px] items-center gap-1.5 rounded-[6px] border border-border bg-card px-2.5 text-xs font-medium text-foreground transition",
              "hover:bg-accent hover:border-border",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            title={`${link.label}: ${link.count} · ${link.hint}`}
          >
            <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden />
            <span>{link.label}</span>
            <span className="tabular-nums text-muted-foreground">{link.count}</span>
            {link.hint && (
              <span className="hidden sm:inline text-muted-foreground font-normal">
                · {link.hint}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
