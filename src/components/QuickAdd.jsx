import React from "react";
import { Mic, Loader2, Plus } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";
import { entities } from "@/api/entities";
import { parseQuickAdd } from "@/lib/quickAdd";
import { ITEM_TYPE_MAP, formatDate } from "@/lib/itemTypes";
import { usePeople, useProjects, useItems, invalidateAll, patchItemsCaches } from "@/lib/queries";
import { applyDurationEstimate } from "@/lib/estimateDuration";

function toDateISO(dateStr, timeStr) {
  if (!dateStr) return null;
  const t = timeStr || "09:00";
  const d = new Date(`${dateStr}T${t}:00`);
  return Number.isNaN(d.getTime()) ? new Date(`${dateStr}T00:00:00`).toISOString() : d.toISOString();
}

const isoDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "");
const hhmm = (s) => (/^\d{2}:\d{2}$/.test(s || "") ? s : "");

function normalizeParsed(parsed, fallbackText) {
  const cleaned = (parsed || []).map((p) => ({
    content: p.content || fallbackText.trim(),
    type: ITEM_TYPE_MAP[p.type] ? p.type : "todo",
    person_name: p.person_name || "",
    responsible_name: p.responsible_name || "",
    project_name: p.project_name || "",
    date: isoDay(p.date),
    time: hhmm(p.time),
    due_date: isoDay(p.due_date),
    recurring: p.recurring || "",
    priority: p.priority || "medium",
    category: p.category || "",
    amount: p.amount || null,
    budget: p.budget || null,
    store: p.store || "",
    location: p.location || "",
    tags: p.tags || [],
    inbox: !!p.inbox,
    notes: p.notes || "",
    duration_minutes: p.duration_minutes != null && Number(p.duration_minutes) > 0
      ? Math.round(Number(p.duration_minutes))
      : null,
    _ai_duration: p.duration_minutes != null && Number(p.duration_minutes) > 0
      ? Math.round(Number(p.duration_minutes))
      : null,
    _ambiguous: !!(p.ambiguous || p.needs_confirm),
  }));
  return cleaned.length
    ? cleaned
    : [{ content: fallbackText.trim(), type: "todo", priority: "medium", tags: [], inbox: true, duration_minutes: null, _ai_duration: null }];
}

function toRecords(drafts, allItems) {
  return drafts.map((d) => {
    const est = applyDurationEstimate(
      {
        type: d.type,
        category: d.category,
        duration_minutes: d.duration_minutes,
        duration_source: d.duration_source,
      },
      allItems || [],
      d._ai_duration
    );
    return {
      content: d.content,
      type: d.type,
      person_name: d.person_name,
      responsible_name: d.responsible_name,
      project_name: d.project_name,
      date: toDateISO(d.date, d.time),
      due_date: d.due_date || null,
      time: d.time || "",
      recurring: d.recurring || "",
      priority: d.priority || "medium",
      category: d.category || "",
      amount: d.amount,
      budget: d.budget,
      store: d.store || "",
      location: d.location || "",
      tags: d.tags || [],
      inbox: !!d.inbox,
      notes: d.notes || "",
      completed: false,
      board_status: "backlog",
      duration_minutes: est.duration_minutes,
      duration_source: est.duration_source,
      payment_status: d.type === "bill" ? "unpaid" : undefined,
      purchased: false,
    };
  });
}

function destinationLabel(draft) {
  const TI = ITEM_TYPE_MAP[draft.type] || ITEM_TYPE_MAP.todo;
  const parts = [TI.plural || TI.label];
  if (draft.date) parts.push(formatDate(draft.date) + (draft.time ? ` ${draft.time}` : ""));
  else if (draft.inbox || draft.type === "to_schedule") parts.push("Inbox");
  if (draft.responsible_name) parts.push(`→ ${draft.responsible_name}`);
  return `${draft.content}: ${parts.join(" · ")}`;
}

function looksAmbiguous(drafts, peopleNames) {
  return drafts.some((d) => {
    if (d._ambiguous) return true;
    // Person name mentioned but not matched to a known person when multiple people exist
    if (d.person_name && peopleNames.length > 1 && !peopleNames.includes(d.person_name)) return true;
    if (d.responsible_name && peopleNames.length > 1 && !peopleNames.includes(d.responsible_name)) return true;
    // Date-ish language without a resolved date, and marked inbox
    if (d.inbox && !d.date && !d.due_date && /\b(next|this|tomorrow|monday|friday|weekend)\b/i.test(d.content || "")) {
      return true;
    }
    return false;
  });
}

export default function QuickAdd({ open, onOpenChange }) {
  const { toast } = useToast();
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const { data: allItems } = useItems({});
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [confirmDrafts, setConfirmDrafts] = React.useState(null);
  const recRef = React.useRef(null);
  const flightRef = React.useRef({ cancelled: false });
  const lastCreatedRef = React.useRef([]);

  const peopleNames = (people || []).map((p) => p.name);
  const projectNames = (projects || []).map((p) => p.name);

  function reset() {
    setText("");
    setLoading(false);
    setConfirmDrafts(null);
    flightRef.current = { cancelled: false };
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  function cancelInFlight() {
    flightRef.current.cancelled = true;
    setLoading(false);
  }

  async function undoLast() {
    const ids = lastCreatedRef.current || [];
    if (!ids.length) return;
    try {
      // Just-created Quick Add undo: permanent remove (not trash).
      await Promise.all(ids.map((id) => entities.Item.purge(id)));
      patchItemsCaches((list) => list.filter((i) => !ids.includes(i.id)));
      await invalidateAll();
      lastCreatedRef.current = [];
      toast({ title: "Undone", description: "Removed the items you just added." });
    } catch (e) {
      toast({ title: "Couldn't undo", description: e.message, variant: "destructive" });
    }
  }

  async function commit(drafts) {
    const records = toRecords(drafts, allItems || []);
    const created = await entities.Item.bulkCreate(records);
    if (Array.isArray(created) && created.length) {
      patchItemsCaches((list) => [...created, ...list]);
      lastCreatedRef.current = created.map((r) => r.id).filter(Boolean);
    }
    await invalidateAll();
    const where = drafts.slice(0, 4).map(destinationLabel).join("\n");
    const extra = drafts.length > 4 ? `\n+${drafts.length - 4} more` : "";
    toast({
      title: `Added ${records.length} item${records.length > 1 ? "s" : ""}`,
      description: where + extra,
      action: (
        <ToastAction altText="Undo" onClick={undoLast}>
          Undo
        </ToastAction>
      ),
    });
    close();
  }

  async function submit() {
    if (!text.trim() || loading) return;
    const flight = { cancelled: false };
    flightRef.current = flight;
    setLoading(true);
    try {
      const parsed = await parseQuickAdd(text, peopleNames, projectNames);
      if (flight.cancelled) return;
      const drafts = normalizeParsed(parsed, text);
      if (looksAmbiguous(drafts, peopleNames)) {
        setConfirmDrafts(drafts);
        setLoading(false);
        return;
      }
      await commit(drafts);
    } catch (e) {
      if (flight.cancelled) return;
      toast({ title: "Couldn't add that", description: e.message, variant: "destructive" });
    } finally {
      if (!flight.cancelled) setLoading(false);
    }
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Voice input unsupported", description: "Try typing instead.", variant: "destructive" });
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => setText((t) => (t ? t + " " : "") + e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && loading) cancelInFlight();
        onOpenChange(next);
        if (!next) setTimeout(reset, 200);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-heading text-xl">
            <Plus className="h-5 w-5 text-primary" /> Quick Add
          </DialogTitle>
          <DialogDescription>
            Type or say anything and press Enter — items are saved where they belong.
          </DialogDescription>
        </DialogHeader>

        {confirmDrafts ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              A few details look unclear. Confirm where these should go, or edit after save.
            </p>
            <ul className="space-y-2 max-h-56 overflow-y-auto scrollbar-thin">
              {confirmDrafts.map((d, i) => (
                <li key={i} className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
                  <p className="font-medium">{d.content}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{destinationLabel(d)}</p>
                </li>
              ))}
            </ul>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setConfirmDrafts(null)}>Back</Button>
              <Button
                onClick={async () => {
                  setLoading(true);
                  try {
                    await commit(confirmDrafts);
                  } catch (e) {
                    toast({ title: "Couldn't add that", description: e.message, variant: "destructive" });
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Confirm &amp; add
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative">
              <Textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Riley has baseball practice Thursday at 4pm, buy milk, and remind me to pay the electric bill Friday"
                rows={3}
                disabled={loading}
                className="rounded-[6px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="button"
                onClick={startVoice}
                disabled={loading}
                title="Voice input"
                className={`absolute right-2.5 bottom-2.5 grid h-10 w-10 place-items-center rounded-[6px] transition ${listening ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
              >
                <Mic className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={submit} disabled={loading || !text.trim()} className="flex-1 min-h-[44px]">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                {loading ? "Adding…" : "Add"}
              </Button>
              {loading ? (
                <Button type="button" variant="ghost" onClick={cancelInFlight} className="min-h-[44px]">
                  Cancel
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground hidden sm:inline">Enter</span>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
