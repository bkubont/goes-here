import React from "react";
import {
  Paperclip, Upload, Loader2, Trash2, ExternalLink, FileText, Image as ImageIcon, Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { useAttachments, invalidateAll, patchItemsCaches } from "@/lib/queries";
import {
  uploadItemAttachment,
  deleteItemAttachment,
  getAttachmentUrl,
  formatFileSize,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  isAllowedAttachment,
} from "@/lib/attachments";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

function FileGlyph({ mime }) {
  if (mime?.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-primary" />;
  return <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />;
}

/**
 * Attachments section for ItemDetailDrawer — upload, list, open, delete.
 * On mobile: separate Take photo (capture=environment) and Choose file actions.
 */
export default function ItemAttachments({ itemId, disabled }) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: rows, isLoading } = useAttachments(itemId);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef(null);
  const cameraRef = React.useRef(null);
  const list = rows || [];
  const atCap = list.length >= MAX_ATTACHMENTS_PER_ITEM;

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !itemId) return;
    const check = isAllowedAttachment(file);
    if (!check.ok) {
      toast({ title: "Can't attach", description: check.error, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await uploadItemAttachment(itemId, file);
      patchItemsCaches((items) =>
        items.map((i) =>
          i.id === itemId
            ? { ...i, attachment_count: (Number(i.attachment_count) || 0) + 1 }
            : i
        )
      );
      await invalidateAll();
      toast({ title: "Attached", description: file.name });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err.message || "Could not upload that file.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  async function openFile(att) {
    try {
      const url = await getAttachmentUrl(att.storage_path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast({ title: "Couldn't open", description: err.message, variant: "destructive" });
    }
  }

  async function remove(att) {
    if (!confirm(`Remove “${att.file_name}”?`)) return;
    setBusy(true);
    try {
      await deleteItemAttachment(att);
      patchItemsCaches((items) =>
        items.map((i) =>
          i.id === itemId
            ? { ...i, attachment_count: Math.max(0, (Number(i.attachment_count) || 1) - 1) }
            : i
        )
      );
      await invalidateAll();
      toast({ title: "Attachment removed" });
    } catch (err) {
      toast({ title: "Remove failed", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-[6px] border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-muted-foreground" />
          <Label className="mb-0">Attachments</Label>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {list.length}/{MAX_ATTACHMENTS_PER_ITEM} · images &amp; PDF · max {formatFileSize(MAX_ATTACHMENT_BYTES)}
        </span>
      </div>

      {isLoading ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
        </p>
      ) : list.length === 0 ? (
        <p className="text-xs text-muted-foreground">Receipts, homework photos, PDFs — attach them here.</p>
      ) : (
        <ul className="space-y-1.5">
          {list.map((att) => (
            <li
              key={att.id}
              className="flex items-center gap-2 rounded-[6px] border border-border bg-card px-2 py-1.5"
            >
              <FileGlyph mime={att.mime_type} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{att.file_name}</p>
                <p className="text-[11px] text-muted-foreground">{formatFileSize(att.size_bytes)}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0"
                disabled={busy || disabled}
                onClick={() => openFile(att)}
                aria-label={`Open ${att.file_name}`}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 w-9 p-0 text-destructive hover:text-destructive"
                disabled={busy || disabled}
                onClick={() => remove(att)}
                aria-label={`Delete ${att.file_name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {/* Desktop / library picker */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={onPick}
      />
      {/* Mobile camera — capture prefers rear camera when supported */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />

      {isMobile ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-h-[44px]")}
            disabled={busy || disabled || atCap}
            onClick={() => cameraRef.current?.click()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
            Take photo
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("min-h-[44px]")}
            disabled={busy || disabled || atCap}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1" />
            Choose file
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("min-h-[40px] w-full")}
          disabled={busy || disabled || atCap}
          onClick={() => fileRef.current?.click()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
          Add file
        </Button>
      )}
    </div>
  );
}
