import { useEffect, useRef } from "react";
import { supabase } from "@/api/supabaseClient";
import { invalidateAll } from "@/lib/queries";
import { useAuth } from "@/lib/AuthContext";

const DEBOUNCE_MS = 400;

/**
 * Subscribe to Supabase Realtime on items/people/projects so other family
 * devices see creates/updates/deletes without a full page reload.
 * Debounced invalidateAll matches local mutation refresh (PR #4 patterns).
 */
export function useRealtimeSync() {
  const { isAuthenticated, authError } = useAuth();
  const timerRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated || authError) return undefined;

    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        invalidateAll().catch((err) => {
          console.warn("Realtime refresh failed:", err);
        });
      }, DEBOUNCE_MS);
    };

    const channel = supabase
      .channel("family-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "people" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(channel);
    };
  }, [isAuthenticated, authError]);
}
