import React from "react";
import { BookmarkPlus, PackagePlus, Trash2 } from "lucide-react";
import { entities } from "@/api/entities";
import { invalidateAll, patchItemsCaches } from "@/lib/queries";
import {
  deleteGroceryTemplate,
  missingStapleItems,
  saveGroceryTemplate,
  stapleRowsToCreate,
  useGroceryTemplates,
} from "@/lib/groceryTemplates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { cn } from "@/lib/utils";
import { useDevicePerson } from "@/lib/devicePerson";

/**
 * Save current incomplete groceries as a named template, and add staples back.
 * Templates live in localStorage on this device only.
 */
export default function StaplesPanel({ groceryItems, selectedItems }) {
  const { toast } = useToast();
  const templates = useGroceryTemplates();
  const meName = useDevicePerson();
  const [name, setName] = React.useState("Weekly staples");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const sourceItems = React.useMemo(() => {
    if (selectedItems?.length) return selectedItems.filter((i) => i.type === "grocery");
    return (groceryItems || []).filter((i) => !i.completed && !i.purchased);
  }, [groceryItems, selectedItems]);

  function onSave() {
    try {
      saveGroceryTemplate({ name, items: sourceItems });
      setName("Weekly staples");
      toast({
        title: "Template saved",
        description: `${sourceItems.length} item${sourceItems.length !== 1 ? "s" : ""} on this device.`,
      });
      setOpen(true);
    } catch (e) {
      toast({ title: "Couldn't save", description: e.message, variant: "destructive" });
    }
  }

  async function onAddStaples(template) {
    const missing = missingStapleItems(template, groceryItems);
    if (!missing.length) {
      toast({ title: "Already on the list", description: "Nothing new to add from this template." });
      return;
    }
    setBusy(true);
    try {
      const rows = stapleRowsToCreate(missing, { responsible_name: meName });
      const created = await entities.Item.bulkCreate(rows);
      const list = Array.isArray(created) ? created : [created];
      patchItemsCaches((prev) => [...list, ...(prev || [])]);
      await invalidateAll();
      toast({
        title: "Staples added",
        description: `Added ${list.length} missing item${list.length !== 1 ? "s" : ""}.`,
      });
    } catch (e) {
      toast({ title: "Couldn't add staples", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function onDelete(id) {
    deleteGroceryTemplate(id);
    toast({ title: "Template removed" });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium flex items-center gap-1.5">
            <PackagePlus className="h-4 w-4 text-primary" /> Staples
          </p>
          <p className="text-xs text-muted-foreground">
            Save incomplete groceries as a template. Stored in this browser only.
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-primary min-h-[36px] px-2"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide" : "Manage"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Template name"
          className="h-10 min-w-[140px] flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-[40px]"
          onClick={onSave}
          disabled={!sourceItems.length}
        >
          <BookmarkPlus className="h-4 w-4 mr-1.5" />
          Save{selectedItems?.length ? " selected" : " list"}
        </Button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-border pt-3">
          {!templates.length && (
            <p className="text-xs text-muted-foreground">No templates yet.</p>
          )}
          {templates.map((tpl) => {
            const missing = missingStapleItems(tpl, groceryItems).length;
            return (
              <div
                key={tpl.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-[6px] border border-border px-2.5 py-2"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{tpl.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {tpl.items?.length || 0} items
                    {missing > 0 ? ` · ${missing} missing` : " · all on list"}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="min-h-[36px]"
                  disabled={busy || missing === 0}
                  onClick={() => onAddStaples(tpl)}
                >
                  Add staples
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-[36px] min-w-[36px] px-2 text-muted-foreground"
                  onClick={() => onDelete(tpl.id)}
                  aria-label={`Delete ${tpl.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {!open && templates.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {templates.slice(0, 4).map((tpl) => (
            <Button
              key={tpl.id}
              type="button"
              variant="secondary"
              size="sm"
              className="min-h-[36px]"
              disabled={busy}
              onClick={() => onAddStaples(tpl)}
            >
              Add {tpl.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
