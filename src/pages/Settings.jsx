import React from "react";
import { Link } from "react-router-dom";
import {
  User, Users, Clock, HelpCircle, Archive, LogOut, ChevronRight, CheckSquare,
  RotateCcw, Trash2, Paperclip, Plus, Loader2, Download, Upload, CalendarRange,
  CalendarDays, UserCheck, LayoutList, Eye, EyeOff, ArrowUp, ArrowDown, ShoppingCart,
} from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import {
  useItems, useDeletedItems, useFamilyMembers, usePeople, invalidateAll,
  patchItemsCaches, patchFamilyMemberCaches,
} from "@/lib/queries";
import { entities } from "@/api/entities";
import { completionPatch } from "@/lib/estimateDuration";
import ItemDetailDrawer from "@/components/ItemDetailDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { formatDate } from "@/lib/itemTypes";
import { cn } from "@/lib/utils";
import {
  loadListPrefs, moveListType, orderedPlanningTypes, resetListPrefs, setListTypeHidden,
  getListTypeColor, setListTypeColor,
} from "@/lib/listPrefs";
import ListColorButton from "@/components/ListColorButton";
import { surfaceAccentStyle } from "@/lib/colorPalette";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";
import { supabase } from "@/api/supabaseClient";
import { loadWeekStartsOn, saveWeekStartsOn } from "@/lib/weekStart";
import {
  CALENDAR_VIEWS, loadDefaultCalendarView, saveDefaultCalendarView,
} from "@/lib/calendarView";
import { loadDevicePerson, resolveDevicePersonId, saveDevicePerson } from "@/lib/devicePerson";
import { buildHouseholdExport, downloadJson } from "@/lib/exportHousehold";
import {
  importHouseholdData, summarizeImport, validateHouseholdImport,
} from "@/lib/importHousehold";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TZ_KEY = "goeshere.timezone";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export default function Settings() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const { data: items } = useItems({});
  const { data: people } = usePeople();
  const { data: trashItems, isLoading: trashLoading } = useDeletedItems();
  const { data: familyMembers, isLoading: membersLoading, error: membersError } = useFamilyMembers();
  const [timezone, setTimezone] = React.useState(() => {
    try {
      return localStorage.getItem(TZ_KEY) || Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
    } catch {
      return "America/New_York";
    }
  });
  const [weekStartsOn, setWeekStartsOn] = React.useState(() => loadWeekStartsOn());
  const [defaultCalendarView, setDefaultCalendarView] = React.useState(
    () => loadDefaultCalendarView() || "day"
  );
  const [devicePersonId, setDevicePersonId] = React.useState(() => loadDevicePerson());
  const [listPrefs, setListPrefs] = React.useState(() => loadListPrefs());
  const [includeTrashExport, setIncludeTrashExport] = React.useState(false);
  const [includeTrashImport, setIncludeTrashImport] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importConfirm, setImportConfirm] = React.useState(null);
  const importInputRef = React.useRef(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [archiveTab, setArchiveTab] = React.useState("completed"); // completed | trash
  const [active, setActive] = React.useState(null);
  const [busyId, setBusyId] = React.useState(null);
  const [newEmail, setNewEmail] = React.useState("");
  const [addingMember, setAddingMember] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState(null);
  const [removing, setRemoving] = React.useState(false);

  const members = familyMembers || [];
  const myEmail = normalizeEmail(user?.email);

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

  function saveWeekStart(value) {
    setWeekStartsOn(saveWeekStartsOn(value));
  }

  function saveCalendarView(value) {
    setDefaultCalendarView(saveDefaultCalendarView(value));
  }

  // Migrate legacy name ? id (or clear invalid) once people load.
  React.useEffect(() => {
    if (people === undefined) return;
    setDevicePersonId(resolveDevicePersonId(people));
  }, [people]);

  function saveMePerson(value) {
    setDevicePersonId(saveDevicePerson(value));
  }

  async function exportHousehold() {
    setExporting(true);
    try {
      const data = await buildHouseholdExport({ includeTrash: includeTrashExport });
      const stamp = new Date().toISOString().slice(0, 10);
      downloadJson(`goeshere-export-${stamp}.json`, data);
      toast({
        title: "Export downloaded",
        description: includeTrashExport
          ? "Includes active data, boards, and trash."
          : "Active items, people, projects, and boards (trash excluded).",
      });
    } catch (e) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  function onImportFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        validateHouseholdImport(parsed);
        const itemCount = Array.isArray(parsed.items) ? parsed.items.length : 0;
        const peopleCount = Array.isArray(parsed.people) ? parsed.people.length : 0;
        const projectCount = Array.isArray(parsed.projects) ? parsed.projects.length : 0;
        const boardCount = Array.isArray(parsed.boards) ? parsed.boards.length : 0;
        const trashCount = Array.isArray(parsed.trash) ? parsed.trash.length : 0;
        setImportConfirm({
          data: parsed,
          fileName: file.name,
          itemCount,
          peopleCount,
          projectCount,
          boardCount,
          trashCount,
        });
      } catch (err) {
        toast({
          title: "Invalid backup file",
          description: err.message || "Could not parse JSON.",
          variant: "destructive",
        });
      }
    };
    reader.onerror = () => {
      toast({ title: "Couldn't read file", variant: "destructive" });
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!importConfirm?.data) return;
    setImporting(true);
    try {
      const result = await importHouseholdData(importConfirm.data, {
        includeTrash: includeTrashImport,
      });
      await invalidateAll();
      setImportConfirm(null);
      toast({
        title: result.errorCount ? "Import finished with errors" : "Import complete",
        description: summarizeImport(result),
        variant: result.errorCount ? "destructive" : undefined,
      });
    } catch (e) {
      toast({ title: "Import failed", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
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

  async function addMember(e) {
    e.preventDefault();
    const email = normalizeEmail(newEmail);
    if (!email || !email.includes("@")) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    if (members.some((m) => normalizeEmail(m.email) === email)) {
      toast({ title: "Already on the list", description: email });
      return;
    }
    setAddingMember(true);
    try {
      const row = await entities.FamilyMember.create({ email });
      patchFamilyMemberCaches((list) =>
        [...list, row].sort((a, b) => a.email.localeCompare(b.email))
      );
      await invalidateAll();
      setNewEmail("");
      toast({
        title: "Email added",
        description: `${email} can sign in once they create a GoesHere account with this address.`,
      });
    } catch (err) {
      toast({ title: "Couldn't add email", description: err.message, variant: "destructive" });
    } finally {
      setAddingMember(false);
    }
  }

  async function confirmRemoveMember() {
    if (!removeTarget) return;
    const email = removeTarget.email;
    const isSelf = normalizeEmail(email) === myEmail;
    const isLast = members.length <= 1;
    if (isLast) {
      toast({
        title: "Can't remove the last member",
        description: "That would lock everyone out of GoesHere. Add another email first.",
        variant: "destructive",
      });
      setRemoveTarget(null);
      return;
    }
    setRemoving(true);
    try {
      await entities.FamilyMember.deleteByEmail(email);
      patchFamilyMemberCaches((list) => list.filter((m) => m.email !== email));
      await invalidateAll();
      toast({
        title: "Email removed",
        description: isSelf
          ? "You removed yourself. Sign out and you may lose access on next login."
          : `${email} can no longer access this household.`,
      });
      setRemoveTarget(null);
    } catch (err) {
      toast({ title: "Couldn't remove", description: err.message, variant: "destructive" });
    } finally {
      setRemoving(false);
    }
  }

  const removeIsSelf = removeTarget && normalizeEmail(removeTarget.email) === myEmail;
  const removeIsLast = members.length <= 1;

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
            <p className="text-xs text-muted-foreground">
              Who can sign in. People names (for assigning items) are separate.
            </p>
          </div>
        </div>

        <div className="px-4 py-3 space-y-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Access emails ({members.length})
          </p>
          {membersError && (
            <p className="text-xs text-destructive">
              Couldn&apos;t load allowlist — run the family_members RLS migration if this is new.
              {" "}({membersError.message})
            </p>
          )}
          {membersLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 && !membersError ? (
            <p className="text-sm text-muted-foreground">No emails on the allowlist yet.</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => {
                const isYou = normalizeEmail(m.email) === myEmail;
                return (
                  <li
                    key={m.email}
                    className="flex items-center gap-2 rounded-[6px] border border-border bg-muted/20 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{m.email}</p>
                      {isYou && (
                        <p className="text-[11px] text-muted-foreground">You</p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-[40px] shrink-0 text-destructive hover:text-destructive"
                      onClick={() => setRemoveTarget(m)}
                      aria-label={`Remove ${m.email}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={addMember} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Add email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="min-h-[44px] flex-1"
            />
            <Button type="submit" disabled={addingMember} className="min-h-[44px] shrink-0">
              {addingMember ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add
            </Button>
          </form>
          <p className="text-[11px] text-muted-foreground">
            They must use this exact email when signing up or signing in. Adding here does not send an invite.
          </p>
        </div>

        <Link
          to="/people"
          className="flex min-h-[52px] items-center justify-between px-4 py-3 text-sm hover:bg-accent/50"
        >
          Manage people (names &amp; roles)
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <UserCheck className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">This device is</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Person used for the My Day filter on Home and Calendar. Stored in this browser only.
        </p>
        <select
          value={devicePersonId}
          onChange={(e) => saveMePerson(e.target.value)}
          className="mt-1 h-11 w-full rounded-[6px] border border-border bg-card px-3 text-sm"
        >
          <option value="">Not set</option>
          {(people || []).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        {!people?.length && (
          <p className="text-[11px] text-muted-foreground">
            Add people under{" "}
            <Link to="/people" className="text-primary hover:underline">People</Link>
            {" "}first.
          </p>
        )}
      </section>

      <section id="lists" className="rounded-xl border border-border bg-card p-4 space-y-3 scroll-mt-4">
        <div className="flex items-center gap-2 mb-1">
          <LayoutList className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Lists</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Show, hide, reorder, and set accent colors for built-in list types on this device. Shopping (groceries) stays separate.
          List colors appear on the Lists hub only — not on Board cards.
        </p>
        <div
          className="flex min-h-[48px] items-center gap-2 rounded-[6px] border border-border px-2 py-1.5 mb-1.5"
          style={surfaceAccentStyle(getListTypeColor("grocery", listPrefs), { tintAlpha: 0.06, borderWidth: 3 })}
        >
          <span
            className="grid h-8 w-8 place-items-center rounded-[4px] border border-border shrink-0 text-white"
            style={{ background: getListTypeColor("grocery", listPrefs) }}
          >
            <ShoppingCart className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 min-w-0 text-sm font-medium truncate">Groceries</span>
          <span className="text-[10px] text-muted-foreground mr-1">Shopping</span>
          <ListColorButton
            color={getListTypeColor("grocery", listPrefs)}
            label="Groceries list color"
            onChange={(c) => setListPrefs(setListTypeColor("grocery", c))}
          />
        </div>
        <div className="space-y-1.5">
          {orderedPlanningTypes(listPrefs).map((t, idx) => {
            const Icon = t.icon;
            const hidden = listPrefs.hidden.includes(t.key);
            const listColor = getListTypeColor(t.key, listPrefs);
            return (
              <div
                key={t.key}
                className={cn(
                  "flex min-h-[48px] items-center gap-2 rounded-[6px] border border-border px-2 py-1.5",
                  hidden && "opacity-60"
                )}
                style={surfaceAccentStyle(listColor, { tintAlpha: 0.06, borderWidth: 3 })}
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-[4px] border border-border shrink-0 text-white"
                  style={{ background: listColor }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{t.plural || t.label}</span>
                <ListColorButton
                  color={listColor}
                  label={`${t.plural || t.label} list color`}
                  onChange={(c) => setListPrefs(setListTypeColor(t.key, c))}
                />
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent disabled:opacity-30"
                  disabled={idx === 0}
                  onClick={() => setListPrefs(moveListType(t.key, "up"))}
                  aria-label={`Move ${t.label} up`}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent disabled:opacity-30"
                  disabled={idx === orderedPlanningTypes(listPrefs).length - 1}
                  onClick={() => setListPrefs(moveListType(t.key, "down"))}
                  aria-label={`Move ${t.label} down`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="grid h-9 w-9 place-items-center rounded-[6px] hover:bg-accent"
                  onClick={() => setListPrefs(setListTypeHidden(t.key, !hidden))}
                  aria-label={hidden ? `Show ${t.label}` : `Hide ${t.label}`}
                >
                  {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[40px]"
          onClick={() => setListPrefs(resetListPrefs())}
        >
          Reset list order, visibility &amp; colors
        </Button>
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

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <CalendarRange className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Week starts on</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Calendar Month and Week views on this device. Stored in this browser only.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => saveWeekStart(0)}
            className={cn(
              "min-h-[44px] flex-1 rounded-[6px] border px-3 text-sm font-medium",
              weekStartsOn === 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            Sunday
          </button>
          <button
            type="button"
            onClick={() => saveWeekStart(1)}
            className={cn(
              "min-h-[44px] flex-1 rounded-[6px] border px-3 text-sm font-medium",
              weekStartsOn === 1
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            )}
          >
            Monday
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDays className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Default calendar view</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Opens Calendar to this view when no view is in the URL. This device only.
          For a kitchen wall glance, choose Month — Day stays best for time-blocking.
        </p>
        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-4">
          {CALENDAR_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => saveCalendarView(v)}
              className={cn(
                "min-h-[44px] rounded-[6px] border px-3 text-sm font-medium capitalize",
                defaultCalendarView === v
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              )}
            >
              {v === "month" ? "Month · wall" : v}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium">Backup</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Export or import a JSON backup of items, people, projects, and boards. Family members only.
          Import merges and creates — it does not wipe your household.
        </p>
        <label className="flex items-center gap-2 text-sm min-h-[40px]">
          <input
            type="checkbox"
            checked={includeTrashExport}
            onChange={(e) => setIncludeTrashExport(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Include trash in export
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto"
            disabled={exporting || importing}
            onClick={exportHousehold}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Download className="h-4 w-4 mr-1" />
            )}
            Export
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] w-full sm:w-auto"
            disabled={exporting || importing}
            onClick={() => importInputRef.current?.click()}
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            Import
          </Button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={onImportFileChange}
          />
        </div>
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

      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeIsSelf ? "Remove your own access?" : "Remove this email?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Remove <span className="font-medium text-foreground">{removeTarget?.email}</span> from
                  the household allowlist?
                </p>
                {removeIsLast && (
                  <p className="text-destructive">
                    This is the only email on the list. Removing it would lock everyone out —
                    add another member first.
                  </p>
                )}
                {!removeIsLast && removeIsSelf && (
                  <p className="text-amber-700 dark:text-amber-400">
                    You are removing yourself. After sign-out you will need another household member
                    to add you back.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing || removeIsLast}
              onClick={(e) => {
                e.preventDefault();
                confirmRemoveMember();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!importConfirm}
        onOpenChange={(o) => {
          if (!o && !importing) setImportConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import backup?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Merge{" "}
                  <span className="font-medium text-foreground">{importConfirm?.fileName}</span> into
                  this household. Matching ids are updated; new rows are created. Nothing is wiped.
                </p>
                <p>
                  {importConfirm?.peopleCount ?? 0} people · {importConfirm?.projectCount ?? 0} projects ·{" "}
                  {importConfirm?.boardCount ?? 0} boards · {importConfirm?.itemCount ?? 0} items
                  {(importConfirm?.trashCount ?? 0) > 0
                    ? ` · ${importConfirm.trashCount} trash`
                    : ""}
                </p>
                {(importConfirm?.trashCount ?? 0) > 0 && (
                  <label className="flex items-center gap-2 text-foreground min-h-[40px]">
                    <input
                      type="checkbox"
                      checked={includeTrashImport}
                      onChange={(e) => setIncludeTrashImport(e.target.checked)}
                      className="h-4 w-4 rounded border-border"
                    />
                    Also import trash items
                  </label>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={importing}
              onClick={(e) => {
                e.preventDefault();
                confirmImport();
              }}
            >
              {importing ? "Importing…" : "Import"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
