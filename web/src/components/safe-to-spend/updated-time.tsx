"use client";

// Created with Claude Code (2026-11-19). "Updated 3:10 PM" on Home's safe to
// spend card (D1, 709:1479): when the bank's numbers were last read, on the
// student's own clock (as Your money's hero says it). A read from an earlier
// day says the day instead, so an old number never passes for today's.
// Nothing until the browser has the time, or when the bank was never read.

import { calendarDaysBetween, useNow } from "@/lib/use-now";

export function updatedLabel(refreshedAt: string, now: Date): string {
  const read = new Date(refreshedAt);
  return calendarDaysBetween(read, now) === 0
    ? `Updated ${read.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : `Updated ${read.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function UpdatedTime({ refreshedAt }: { refreshedAt: string | null }) {
  const now = useNow();
  if (!now || !refreshedAt) return null;
  return <span>{updatedLabel(refreshedAt, now)}</span>;
}
