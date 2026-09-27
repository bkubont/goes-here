import { useEffect, useState } from "react";

const KEY = "goeshere.weekStartsOn";
const CHANGE_EVENT = "goeshere-weekstart";

/** 0 = Sunday, 1 = Monday. Persisted per device in localStorage. */
export function loadWeekStartsOn() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === "1") return 1;
    if (raw === "0") return 0;
  } catch {
    /* ignore */
  }
  return 0;
}

export function saveWeekStartsOn(value) {
  const next = value === 1 || value === "1" ? 1 : 0;
  try {
    localStorage.setItem(KEY, String(next));
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

export function weekDayLabels(weekStartsOn = 0) {
  const all = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  if (weekStartsOn === 1) return [...all.slice(1), all[0]];
  return all;
}

/** Leading blank cells before day 1 in a month grid for the given week start. */
export function monthGridPad(year, month, weekStartsOn = 0) {
  const firstDow = new Date(year, month, 1).getDay();
  return (firstDow - weekStartsOn + 7) % 7;
}

/** Reactive week-start preference for Calendar views. */
export function useWeekStartsOn() {
  const [weekStartsOn, setWeekStartsOn] = useState(loadWeekStartsOn);
  useEffect(() => {
    const sync = () => setWeekStartsOn(loadWeekStartsOn());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return weekStartsOn;
}
