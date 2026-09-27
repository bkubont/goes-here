import React from "react";
import { Link } from "react-router-dom";
import {
  User, Users, Clock, HelpCircle, Archive, LogOut, ChevronRight, CheckSquare,
  RotateCcw, Trash2, Paperclip,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useItems, useDeletedItems, invalidateAll, patchItemsCaches } from "@/lib/queries";
import { entities } from "@/api/entities";
import { completionPatch } from "@/lib/estimateDuration";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/itemTypes";
import { cn } from "@/lib/utils";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";
import { supabase } from "@/api/supabaseClient";

const TZ_KEY = "goeshere.timezone";

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { data: items } = useItems({});
  const { data: trashItems, isLoading: trashLoading } = useDeletedItems();
  const [timezone, setTimezone] = React.useState(() => {
    try {
      return localStorage.getItem(TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  });
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveTab, setArchiveTab] = React.useState("completed"); // completed | trash
  const [active, setActive] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);

  const completed = React.useMemo(() => {
    return (items || [])
      .filter((i) => i.completed)
      .sort((a, b) =>
        String(b.completed_date || b.created_date || "").localeCompare(
          String(a.completed_date || a.created_date || "")
        )
      )
      .slice(0, 100);
  }, [items]);

  const trash = trashItems || [];

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

  async function reopen(item) {
    setBusyId(item.id);
    try {
      const patch = completionPatch(item, false);
      const row = await entities.Item.update(item.id, patch);
      patchItemsCaches((list) => list.map((i) => (i.id === item.id ? { ...i, ...row } : i)));
      await invalidateAll();
      toast({ title: "Reopened", description: item.content });
    } catch (e) {
      toast({ title: "Couldn't reopen", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function restore(item) {
    setBusyId(item.id);
    try {
      const row = await entities.Item.restore(item.id);
      patchItemsCaches((list) => [row, ...list.filter((i) => i.id !== item.id)]);
      await invalidateAll();
      toast({ title: "Restored from trash", description: item.content });
    } catch (e) {
      toast({ title: "Couldn't restore", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

  async function purge(item) {
    if (!confirm(`Permanently delete “${item.content}”? This cannot be undone.`)) return;
    setBusyId(item.id);
    try {
      // Remove storage objects before cascade-deleting attachment rows with the item.
      const attachments = await entities.Attachment.filter({ item_id: item.id }, "-created_at", 50);
      const paths = (attachments || []).map((a) => a.storage_path).filter(Boolean);
      if (paths.length) {
        await supabase.storage.from(ATTACHMENT_BUCKET).remove(paths);
      }
      await entities.Item.purge(item.id);
      await invalidateAll();
      toast({ title: "Permanently deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  }

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
          onClick={() => setArchiveOpen((v) => !v)}
          className="flex w-full min-h-[52px] items-center gap-3 px-4 py-3 text-left hover:bg-accent/50"
        >
          <Archive className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Completed &amp; archive</p>
            <p className="text-xs text-muted-foreground">
              {completed.length} completed · {trash.length} in trash — find and reopen, not a second Inbox
            </p>
          </div>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition ${archiveOpen ? "rotate-90" : ""}`} />
        </button>
        {archiveOpen && (
          <div className="px-4 py-3 space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setArchiveTab("completed")}
                className={cn(
                  "min-h-[40px] flex-1 rounded-[6px] border px-3 text-sm font-medium",
                  archiveTab === "completed"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                Completed ({completed.length})
              </button>
              <button
                type="button"
                onClick={() => setArchiveTab("trash")}
                className={cn(
                  "min-h-[40px] flex-1 rounded-[6px] border px-3 text-sm font-medium",
                  archiveTab === "trash"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                )}
              >
                Trash ({trash.length})
              </button>
            </div>

            {archiveTab === "completed" ? (
              completed.length ? (
                <ul className="space-y-2">
                  {completed.map((it) => (
                    <li
                      key={it.id}
                      className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => setActive(it)}
                      >
                        <p className="text-sm font-medium line-through opacity-80">{it.content}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {it.completed_date ? `Done ${formatDate(it.completed_date)}` : "Completed"}
                          {(Number(it.attachment_count) || 0) > 0 && (
                            <span className="ml-2 inline-flex items-center gap-0.5">
                              <Paperclip className="h-3 w-3" /> {it.attachment_count}
                            </span>
                          )}
                        </p>
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-[40px] shrink-0"
                        disabled={busyId === it.id}
                        onClick={() => reopen(it)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reopen
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">No completed items yet.</p>
              )
            ) : trashLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading trash…</p>
            ) : trash.length ? (
              <ul className="space-y-2">
                {trash.map((it) => (
                  <li
                    key={it.id}
                    className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{it.content}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Deleted {it.deleted_at ? formatDate(it.deleted_at) : "recently"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-[40px] shrink-0"
                      disabled={busyId === it.id}
                      onClick={() => restore(it)}
                    >
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[40px] shrink-0 text-destructive hover:text-destructive"
                      disabled={busyId === it.id}
                      onClick={() => purge(it)}
                      aria-label="Delete forever"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">Trash is empty.</p>
            )}
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
          <li>Completing an item shows an <strong className="text-foreground font-medium">Undo</strong> toast; deleted items go to trash here.</li>
          <li>Gold highlights mean something needs attention; blue is for actions.</li>
        </ul>
      </section>

      <ItemDetailDrawer item={active} open={!!active} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}
