// Created with Claude Code (2026-11-21). The Calendar (Figma C1, 821:9293;
// change card 821:9473): every date Cense knows this month on one calendar,
// dots by type, today in Amethyst, a tapped day's list, and what is next below.
// Pure, so the page and the tests agree. Dates are the student's calendar
// dates (YYYY-MM-DD), read in their time zone as Home and the reminders read
// them.

import { type ComingUpCard, type ComingUpEvent } from "@/lib/home/coming-up";
import { moneyAmount } from "@/lib/money";
import { addDays } from "@/lib/reminders/schedule";
import { BILL_COPY } from "@/lib/safe-to-spend/copy";

// Dot colors (C1's FYI): Amethyst for card dates, Amber Flame for bills,
// Light Green for money in. The legend reads in this order, and so do a day's
// dots.
export type DotKind = "card" | "bill" | "money";
export const DOT_ORDER: readonly DotKind[] = ["card", "bill", "money"];

function parts(date: string): { year: number; month: number; day: number } {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function utc(date: string): Date {
  const { year, month, day } = parts(date);
  return new Date(Date.UTC(year, month - 1, day));
}

// The first and last date of the month `today` falls in.
export function monthRange(today: string): { first: string; last: string } {
  const { year, month } = parts(today);
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(next, -1) };
}

// "November".
export function monthName(today: string): string {
  return utc(today).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
}

// The month as weeks, Sunday first (the frame's S M T W T F S), with null for
// the blank days before the 1st and after the last.
export function monthWeeks(today: string): (string | null)[][] {
  const { first, last } = monthRange(today);
  const cells: (string | null)[] = Array.from({ length: utc(first).getUTCDay() }, () => null);
  for (let date = first; date <= last; date = addDays(date, 1)) cells.push(date);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export function dotKind(event: ComingUpEvent): DotKind {
  if (event.kind === "paycheck") return "money";
  if (event.kind === "bill") return "bill";
  return "card";
}

// Each date's dots, one per kind that falls on it, in legend order.
export function dotsByDate(events: readonly { date: string; dot: DotKind }[]): Map<string, DotKind[]> {
  const kinds = new Map<string, Set<DotKind>>();
  for (const event of events) {
    const set = kinds.get(event.date) ?? new Set<DotKind>();
    set.add(event.dot);
    kinds.set(event.date, set);
  }
  return new Map([...kinds].map(([date, set]) => [date, DOT_ORDER.filter((kind) => set.has(kind))]));
}

// "Today", "Tomorrow", or "Sun, Nov 15", as the frame's rows begin.
export function dayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return utc(date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

// "Sunday, November 15", for a day's button as a screen reader hears it.
export function longDay(date: string): string {
  return utc(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

export type CalendarEntry = {
  key: string;
  date: string;
  dot: DotKind;
  // What happens, without the date: "Payment due", "Rent".
  what: string;
  // "Discover · autopay is on", "$650 · you cover it".
  subtitle: string;
  // Shows the student's money: masked in session replay.
  sensitive: boolean;
};

const AUTOPAY: Record<ComingUpCard["autopayStatus"], string> = {
  on: "autopay is on",
  off: "autopay is off",
  // Never "off" when the student has not said.
  unknown: "turn on autopay",
};

// One event as the Calendar's row (C1: "Tomorrow · Payment due" over
// "Discover · ..."). The frame's payment row shows the statement balance;
// Cense does not read balances yet, so it says the card and its autopay, as
// Home's Coming up does.
export function calendarEntry(event: ComingUpEvent): CalendarEntry {
  const base = { date: event.date, dot: dotKind(event) };
  switch (event.kind) {
    case "payment_due":
      return {
        ...base,
        key: `due-${event.card.applicationId}-${event.date}`,
        what: "Payment due",
        subtitle: `${event.card.name} · ${AUTOPAY[event.card.autopayStatus]}`,
        sensitive: false,
      };
    case "statement_closes":
      return {
        ...base,
        key: `close-${event.card.applicationId}-${event.date}`,
        what: "Statement closes",
        subtitle:
          event.payDownToCents === null ? event.card.name : `${event.card.name} · pay down to ${moneyAmount(event.payDownToCents)}`,
        sensitive: event.payDownToCents !== null,
      };
    case "bill":
      return {
        ...base,
        key: `bill-${event.bill}-${event.date}`,
        what: BILL_COPY[event.bill].label,
        subtitle: `${moneyAmount(event.amountCents)} · ${event.share ? "your share" : "you cover it"}`,
        sensitive: true,
      };
    case "paycheck":
      return {
        ...base,
        key: `paycheck-${event.date}`,
        what: "Paycheck",
        subtitle: `${moneyAmount(event.amountCents)} · looks like pay`,
        sensitive: true,
      };
  }
}
