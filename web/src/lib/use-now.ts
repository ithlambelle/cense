"use client";

import { useSyncExternalStore } from "react";

// The current time to the minute, read in the browser (the student's own
// clock and time zone). It refreshes every minute and whenever the tab comes
// back into view, so a page left open overnight shows the new day. The server
// render gets null and the browser fills it in after hydration.
let current: number | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function minuteNow(): number {
  return Math.floor(Date.now() / 60_000) * 60_000;
}

function refresh() {
  const next = minuteNow();
  if (next !== current) {
    current = next;
    for (const listener of listeners) listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    // Nothing kept the time current while no screen was listening, so it is
    // read again now rather than at the next tick, up to 30 seconds later.
    refresh();
    timer = setInterval(refresh, 30_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    }
  };
}

function getSnapshot(): number {
  // With no screen listening the kept time may be hours old (a student who
  // left Home yesterday), so the first render reads the clock again.
  if (current === null || listeners.size === 0) current = minuteNow();
  return current;
}

export function useNow(): Date | null {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return value === null ? null : new Date(value);
}

// Whole calendar days between two dates on the student's clock (0 = same day).
export function calendarDaysBetween(earlier: Date, later: Date): number {
  const a = new Date(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  const b = new Date(later.getFullYear(), later.getMonth(), later.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
