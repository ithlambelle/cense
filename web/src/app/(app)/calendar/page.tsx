import type { Metadata } from "next";

import { CalendarView } from "@/components/calendar/calendar-view";
import { calendarDate } from "@/lib/api/reminders";
import { calendarEntry, monthRange } from "@/lib/calendar/month";
import { datedEvents } from "@/lib/home/coming-up";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";
import { loadComingUpCards } from "@/lib/student-data";

export const metadata: Metadata = { title: "Calendar | CENSE" };

// Created with Claude Code (2026-11-21). The Calendar (Figma C1, 821:9293),
// read on the server like Home: the same cards and bills as Home's Coming up,
// over the whole month instead of the next four, so a date on one is always on
// the other. Paychecks join once detected income is wired to the student's
// data (US-16), as on Home. A failed read still shows the month, and says some
// dates did not load, so an empty day is never mistaken for nothing being due.
export default async function CalendarPage() {
  const student = await requireStudent(ROUTES.calendar);
  const [cards, safeToSpend] = await Promise.all([loadComingUpCards(student), plaidConfig() ? loadSafeToSpend(student) : null]);
  const today = cards?.today ?? calendarDate(new Date().toISOString(), "America/New_York");
  const linked = safeToSpend?.ok && safeToSpend.value ? safeToSpend.value : null;
  const { first, last } = monthRange(today);
  const entries = cards ? datedEvents({ from: first, last, cards: cards.cards, bills: linked?.bills ?? [] }).map((event) => calendarEntry(event, today)) : [];
  const incomplete = cards === null || safeToSpend?.ok === false;
  return <CalendarView today={today} entries={entries} incomplete={incomplete} />;
}
