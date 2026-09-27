import { useEffect, useState } from "react";

// Staple grocery templates — device-only localStorage (v1, no migration).

const KEY = "goeshere.grocery.templates";
const CHANGE_EVENT = "goeshere-grocery-templates";

function uid() {
  return `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
  return list;
}

export function loadGroceryTemplates() {
  return readAll();
}

export function saveGroceryTemplate({ name, items }) {
  const label = String(name || "").trim() || "Staples";
  const lines = (items || [])
    .filter((it) => it && !it.completed && !it.purchased)
    .map((it) => ({
      content: String(it.content || "").trim(),
      category: it.category || "Other",
      amount: it.amount ?? null,
      store: it.store || "",
      notes: it.notes || "",
    }))
    .filter((it) => it.content);
  if (!lines.length) {
    throw new Error("No incomplete grocery items to save.");
  }
  const list = readAll();
  const row = {
    id: uid(),
    name: label,
    created_at: new Date().toISOString(),
    items: lines,
  };
  return writeAll([row, ...list]);
}

export function deleteGroceryTemplate(id) {
  return writeAll(readAll().filter((t) => t.id !== id));
}

/**
 * Template lines that are not already present as an incomplete grocery
 * with the same content (case-insensitive). Type is always grocery.
 */
export function missingStapleItems(template, existingItems) {
  const open = new Set(
    (existingItems || [])
      .filter((i) => i.type === "grocery" && !i.completed && !i.purchased)
      .map((i) => String(i.content || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const missing = [];
  for (const line of template?.items || []) {
    const key = String(line.content || "").trim().toLowerCase();
    if (!key || open.has(key)) continue;
    // Dedupe identical template lines so two matching rows don't both create groceries.
    open.add(key);
    missing.push(line);
  }
  return missing;
}

/** Rows ready for entities.Item.bulkCreate. */
export function stapleRowsToCreate(lines) {
  return (lines || []).map((line) => ({
    content: line.content,
    type: "grocery",
    category: line.category || "Other",
    amount: line.amount ?? null,
    store: line.store || "",
    notes: line.notes || "",
    completed: false,
    purchased: false,
    board_status: "backlog",
    tags: [],
    inbox: false,
    priority: "medium",
  }));
}

export function useGroceryTemplates() {
  const [templates, setTemplates] = useState(loadGroceryTemplates);
  useEffect(() => {
    const sync = () => setTemplates(loadGroceryTemplates());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return templates;
}
