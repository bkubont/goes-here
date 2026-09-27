import { useEffect, useState } from "react";

const KEY = "goeshere.calendar.defaultView";
const CHANGE_EVENT = "goeshere-calendar-view";

export const CALENDAR_VIEWS = ["day", "week", "agenda", "month"];

/** @returns {"day"|"week"|"agenda"|"month"|null} */
export function loadDefaultCalendarView() {
  try {
    const raw = localStorage.getItem(KEY);
    if (CALENDAR_VIEWS.includes(raw)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

/** @param {"day"|"week"|"agenda"|"month"} value */
export function saveDefaultCalendarView(value) {
  const next = CALENDAR_VIEWS.includes(value) ? value : "day";
  try {
    localStorage.setItem(KEY, next);
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
 * Resolve the calendar view to open with.
 * URL ?view= wins; otherwise saved preference; otherwise device default.
 */
export function resolveCalendarView(viewParam, { isMobile = false } = {}) {
  if (CALENDAR_VIEWS.includes(viewParam)) return viewParam;
  const saved = loadDefaultCalendarView();
  if (saved) return saved;
  return isMobile ? "agenda" : "day";
}

/** Reactive default calendar view preference. */
export function useDefaultCalendarView() {
  const [view, setView] = useState(loadDefaultCalendarView);
  useEffect(() => {
    const sync = () => setView(loadDefaultCalendarView());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return view;
}
