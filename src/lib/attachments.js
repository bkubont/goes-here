import { supabase } from "@/api/supabaseClient";

export const ATTACHMENT_BUCKET = "item-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENTS_PER_ITEM = 20;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

export function isAllowedAttachment(file) {
  if (!file) return { ok: false, error: "No file selected." };
  const mime = (file.type || "").toLowerCase();
  if (!mime || (!mime.startsWith("image/") && mime !== "application/pdf")) {
    return { ok: false, error: "Only images and PDF files are allowed." };
  }
  if (!ALLOWED_MIME.has(mime) && !mime.startsWith("image/")) {
    return { ok: false, error: "That file type is not supported." };
  }
  // Accept other image/* that Storage might still reject — prefer allowlisted set when known.
  if (mime.startsWith("image/") && !ALLOWED_MIME.has(mime)) {
    // Still allow common camera types; Storage bucket may reject unknowns.
  }
  if (file.size <= 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "File is too large (max 10 MB)." };
  }
  return { ok: true };
}

function safeFileName(name) {
  const base = String(name || "file")
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return base || "file";
}

export function formatFileSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload a file for an item: storage object + attachments row.
 * @returns {Promise<object>} attachment row
 */
export async function uploadItemAttachment(itemId, file) {
  const check = isAllowedAttachment(file);
  if (!check.ok) throw new Error(check.error);

  const { count, error: countErr } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);
  if (countErr) throw new Error(countErr.message);
  if ((count || 0) >= MAX_ATTACHMENTS_PER_ITEM) {
    throw new Error(`Limit is ${MAX_ATTACHMENTS_PER_ITEM} attachments per item.`);
  }

  const id = crypto.randomUUID();
  const fileName = safeFileName(file.name);
  const path = `${itemId}/${id}-${fileName}`;
  const mime = file.type || "application/octet-stream";

  const { error: upErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(path, file, { contentType: mime, upsert: false });
  if (upErr) throw new Error(upErr.message || "Upload failed.");

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      id,
      item_id: itemId,
      storage_path: path,
      file_name: fileName,
      mime_type: mime,
      size_bytes: file.size,
    })
    .select()
    .single();

  if (error) {
    // Best-effort cleanup of orphaned storage object
    await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]).catch(() => {});
    throw new Error(error.message);
  }
  return data;
}

export async function deleteItemAttachment(attachment) {
  if (!attachment?.id || !attachment?.storage_path) {
    throw new Error("Missing attachment.");
  }
  const { error: dbErr } = await supabase.from("attachments").delete().eq("id", attachment.id);
  if (dbErr) throw new Error(dbErr.message);
  const { error: stErr } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([attachment.storage_path]);
  if (stErr) {
    // Row already gone; surface storage error so user can retry cleanup if needed
    throw new Error(stErr.message || "Removed from list but storage cleanup failed.");
  }
}

/** Signed URL for private bucket (open / download). */
export async function getAttachmentUrl(storagePath, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error) throw new Error(error.message);
  return data?.signedUrl;
}
