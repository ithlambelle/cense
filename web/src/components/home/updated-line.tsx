"use client";

import { calendarDaysBetween, useNow } from "@/lib/use-now";

// "Application updated today / yesterday / N days ago", counted in calendar
// days on the student's own clock (the server's clock and zone may differ).
export function UpdatedLine({ iso }: { iso: string }) {
  const now = useNow();
  if (!now) return <span>Application updated recently</span>;
  const days = calendarDaysBetween(new Date(iso), now);
  if (days <= 0) return <span>Application updated today</span>;
  if (days === 1) return <span>Application updated yesterday</span>;
  return <span>Application updated {days} days ago</span>;
}
