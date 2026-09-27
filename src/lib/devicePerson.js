import { useEffect, useState } from "react";

/** Settings “This device is” — maps My Day filter to a People name. */
const KEY = "goeshere.devicePerson";
const CHANGE_EVENT = "goeshere-device-person";

export function loadDevicePerson() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function saveDevicePerson(name) {
  const next = String(name || "").trim();
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

export function useDevicePerson() {
  const [name, setName] = useState(loadDevicePerson);
  useEffect(() => {
    const sync = () => setName(loadDevicePerson());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return name;
}

/** True when item is assigned to the device “me” person. */
export function isAssignedToMe(item, meName) {
  if (!meName) return false;
  return (item?.responsible_name || "") === meName;
}
