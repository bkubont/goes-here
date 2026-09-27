import { useEffect, useMemo, useState } from "react";
import { usePeople } from "@/lib/queries";

/** Settings “This device is” — stores a People row id; My Day resolves the current name. */
const KEY = "goeshere.devicePerson";
const CHANGE_EVENT = "goeshere-device-person";

export function loadDevicePerson() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

/** Persist a person id (or clear). Returns the stored value. */
export function saveDevicePerson(id) {
  const next = String(id || "").trim();
  try {
    if (next) localStorage.setItem(KEY, next);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore */
  }
  return next;
}

/**
 * Resolve the current person name from a stored id (or legacy name).
 * When `people` is loaded: migrate name → id, clear invalid ids (writes storage).
 * When `people` is still undefined (loading), do not clear storage.
 */
export function resolveDevicePersonName(people, stored = loadDevicePerson()) {
  const raw = String(stored || "").trim();
  if (!raw) return "";
  if (people === undefined || people === null) return "";

  const list = Array.isArray(people) ? people : [];
  const byId = list.find((p) => String(p.id) === raw);
  if (byId) return byId.name || "";

  // Legacy: name was stored before ids. Rewrite to id when we can match.
  const byName = list.find((p) => p.name === raw);
  if (byName?.id != null) {
    saveDevicePerson(byName.id);
    return byName.name || "";
  }

  // Loaded people list has no match — clear stale preference.
  saveDevicePerson("");
  return "";
}

/** Current device person id after migration against `people` (clears invalid). */
export function resolveDevicePersonId(people, stored = loadDevicePerson()) {
  resolveDevicePersonName(people, stored);
  return loadDevicePerson();
}

function nameForStoredId(people, stored) {
  if (!stored || people === undefined || people === null) return "";
  const byId = (Array.isArray(people) ? people : []).find((p) => String(p.id) === stored);
  return byId?.name || "";
}

/** Live name for My Day filters (resolves from people; migrates legacy name storage). */
export function useDevicePerson() {
  const { data: people } = usePeople();
  const [stored, setStored] = useState(loadDevicePerson);

  useEffect(() => {
    const sync = () => setStored(loadDevicePerson());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  // Migrate legacy name → id / clear invalid once people are loaded (not during render).
  useEffect(() => {
    if (people === undefined) return;
    const next = resolveDevicePersonId(people, stored);
    if (next !== stored) setStored(next);
  }, [people, stored]);

  return useMemo(() => nameForStoredId(people, stored), [people, stored]);
}

/** True when item is assigned to the device “me” person. */
export function isAssignedToMe(item, meName) {
  if (!meName) return false;
  return (item?.responsible_name || "") === meName;
}
