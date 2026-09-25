import React from "react";
import { Mic, Loader2, X, Sparkles, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { entities } from "@/api/entities";
import { parseQuickAdd } from "@/lib/quickAdd";
import { ITEM_TYPES, ITEM_TYPE_MAP } from "@/lib/itemTypes";
import { usePeople, useProjects, invalidateAll } from "@/lib/queries";

function toDateISO(dateStr, timeStr) {
  if (!dateStr) return null;
  const t = timeStr || "09:00";
  const d = new Date(`${dateStr}T${t}:00`);
  return Number.isNaN(d.getTime()) ? new Date(`${dateStr}T00:00:00`).toISOString() : d.toISOString();
}

// Drop malformed AI output so one bad value doesn't fail the whole save.
const isoDay = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || "") ? s : "");
const hhmm = (s) => (/^\d{2}:\d{2}$/.test(s || "") ? s : "");

export default function QuickAdd({ open, onOpenChange }) {
  const { toast } = useToast();
  const { data: people } = usePeople();
  const { data: projects } = useProjects();
  const [text, setText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [drafts, setDrafts] = React.useState([]);
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef(null);

  const peopleNames = (people || []).map((p) => p.name);
  const projectNames = (projects || []).map((p) => p.name);

  function reset() {
    setText("");
    setDrafts([]);
    setLoading(false);
    setSaving(false);
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 200);
  }

  async function organize() {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const parsed = await parseQuickAdd(text, peopleNames, projectNames);
      const cleaned = parsed.map((p) => ({
        content: p.content || text.trim(),
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
      }));
      setDrafts(cleaned.length ? cleaned : [{ content: text.trim(), type: "todo", priority: "medium", tags: [], inbox: true }]);
    } catch (e) {
      toast({ title: "Couldn't parse that", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  function updateDraft(idx, patch) {
    setDrafts((d) => d.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  }
  function removeDraft(idx) {
    setDrafts((d) => d.filter((_, i) => i !== idx));
  }

  async function save() {
    if (!drafts.length) return;
    setSaving(true);
    try {
      const records = drafts.map((d) => ({
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
        payment_status: d.type === "bill" ? "unpaid" : undefined,
        purchased: false,
      }));
      await entities.Item.bulkCreate(records);
      invalidateAll();
      toast({ title: `Saved ${records.length} item${records.length > 1 ? "s" : ""}`, description: "Organized and in place." });
      close();
    } catch (e) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-xl">
            <Sparkles className="h-5 w-5 text-brand" /> Quick Add
          </DialogTitle>
          <DialogDescription>
            Type or say anything. I'll figure out what it is, who and when it's for, and where it belongs.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. Riley has baseball practice Thursday at 4pm, buy milk, and remind me to pay the electric bill Friday"
              rows={3}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") organize();
              }}
            />
            <button
              onClick={startVoice}
              title="Voice input"
              className={`absolute right-2.5 bottom-2.5 grid h-8 w-8 place-items-center rounded-lg transition ${listening ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>

          {!drafts.length ? (
            <div className="flex items-center gap-2">
              <Button onClick={organize} disabled={loading || !text.trim()} className="flex-1">
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                {loading ? "Organizing…" : "Organize"}
              </Button>
              <span className="text-xs text-muted-foreground hidden sm:inline">⌘⏎</span>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                {drafts.length} item{drafts.length > 1 ? "s" : ""} ready — adjust if needed, then save.
              </div>
              <div className="space-y-2.5">
                {drafts.map((d, idx) => {
                  const TI = ITEM_TYPE_MAP[d.type] || ITEM_TYPE_MAP.todo;
                  const Icon = TI.icon;
                  return (
                    <div key={idx} className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Select value={d.type} onValueChange={(v) => updateDraft(idx, { type: v })}>
                          <SelectTrigger className="h-8 w-[150px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ITEM_TYPES.map((t) => (
                              <SelectItem key={t.key} value={t.key}>
                                <span className="flex items-center gap-2"><t.icon className="h-3.5 w-3.5" /> {t.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {d.inbox && (
                          <span className="ml-auto text-[11px] rounded-full bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5">needs review</span>
                        )}
                        <button onClick={() => removeDraft(idx)} className="text-muted-foreground hover:text-destructive ml-1">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <Input
                        value={d.content}
                        onChange={(e) => updateDraft(idx, { content: e.target.value })}
                        className="font-medium"
                      />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Input value={d.person_name} onChange={(e) => updateDraft(idx, { person_name: e.target.value })} placeholder="Person" className="h-8 text-sm" />
                        <Input type="date" value={d.date} onChange={(e) => updateDraft(idx, { date: e.target.value })} className="h-8 text-sm" />
                        <Input type="time" value={d.time} onChange={(e) => updateDraft(idx, { time: e.target.value })} className="h-8 text-sm" />
                        <Input value={d.project_name} onChange={(e) => updateDraft(idx, { project_name: e.target.value })} placeholder="Project" className="h-8 text-sm" />
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {d.person_name && <span className="text-[11px] rounded-full bg-blue-50 text-blue-700 px-2 py-0.5">{d.person_name}</span>}
                        {d.recurring && <span className="text-[11px] rounded-full bg-violet-50 text-violet-700 px-2 py-0.5">↻ {d.recurring}</span>}
                        {d.category && <span className="text-[11px] rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5">{d.category}</span>}
                        {d.due_date && <span className="text-[11px] rounded-full bg-rose-50 text-rose-700 px-2 py-0.5">due {d.due_date}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={save} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                  {saving ? "Saving…" : `Save ${drafts.length} item${drafts.length > 1 ? "s" : ""}`}
                </Button>
                <Button variant="ghost" onClick={() => setDrafts([])}>Back</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}