import React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when the items query hit the page cap — large households can load the next range.
 */
export default function ItemsLoadMoreBanner({
  count,
  pageSize,
  hasMore,
  onLoadMore,
  isLoadingMore,
}) {
  if (!hasMore) return null;

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        Showing {count.toLocaleString()} items
        {pageSize ? ` (batches of ${pageSize.toLocaleString()})` : ""}.
        {isLoadingMore
          ? " Loading the next batch…"
          : " More are still on the server."}
      </p>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-[40px]"
        disabled={isLoadingMore}
        onClick={() => onLoadMore?.()}
      >
        {isLoadingMore ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        Load more
      </Button>
    </div>
  );
}
