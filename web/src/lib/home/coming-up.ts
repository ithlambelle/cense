// Created with Claude Code (2026-11-19). Coming up on Home (Figma D1,
// 709:1482 to 709:1486): the dated things ahead in the next 30 days, soonest
// first, four rows at most. Pure, so the page and the tests agree.
//
// - Each approved card's statement closing and payment due dates, worked out
//   with the reminder emails' own helpers (lib/reminders/schedule.ts), so a
//   date here is always the date its email is about. A day of 29 to 31 falls
//   on a shorter month's last day, as issuers do.
// - Each bill the student pays some of, on the due day they typed when they
//   said who covers it (bill_coverage). Tuition has no due day, so it is never
//   listed. Groceries are never listed either: they are a day-to-day need,
//   not a dated bill, and sit outside safe to spend (Ben, 2026-11-14).
// - Paychecks, once detected income is wired to the student's data (US-16):
//   until then none are passed and none are shown.
//
// `today` is the student's calendar date (YYYY-MM-DD), read in their time
// zone the way the reminders read it.

import { moneyAmount } from "@/lib/money";
import { monthDay } from "@/lib/reminders/in-app";
import { addDays, nextOnDay, payDownTargetFor } from "@/lib/reminders/schedule";
import { autopayStepsPath, paymentRemindersPath, ROUTES } from "@/lib/routes";
import { BILL_COPY } from "@/lib/safe-to-spend/copy";
import { SPREAD_DAYS, type Bill, type BillAnswer } from "@/lib/safe-to-spend/compute";

// How many days ahead Coming up looks when no bank is linked. With a bank,
// Home passes the safe to spend response's own `days`, so the list and the
// number above it ("For the next 30 days") always cover the same days.
export const COMING_UP_DAYS = SPREAD_DAYS;
// Bills that are never a dated row: groceries are bought all month long.
const NOT_DATED: ReadonlySet<Bill> = new Set<Bill>(["groceries"]);
// The frame draws four rows; more would push the rest of Home away.
export const COMING_UP_MAX_ROWS = 4;

export type ComingUpCard = {
  applicationId: string;
  // What the rows call the card ("Discover"): see comingUpCardNames.
  name: string;
  creditLimitCents: number | null;
  // The monthly spend limit the student saved, or null (or left out).
  spendLimitCents?: number | null;
  statementClosingDay: number | null;
  paymentDueDay: number | null;
  autopayStatus: "on" | "off" | "unknown";
};

// One payday, already placed on the calendar by whatever detects income.
export type Paycheck = { date: string; amountCents: number };

export type ComingUpEvent =
  | { kind: "paycheck"; date: string; amountCents: number }
  // payDownToCents: the saved spend limit, else 30% of the credit limit
  // (payDownTargetFor); null with neither.
  | { kind: "statement_closes"; date: string; card: ComingUpCard; payDownToCents: number | null }
  | { kind: "payment_due"; date: string; card: ComingUpCard }
  | { kind: "bill"; date: string; bill: Bill; share: boolean; amountCents: number };

// On the same day: money in first, then the card's dates, then bills.
const KIND_ORDER: Record<ComingUpEvent["kind"], number> = { paycheck: 0, statement_closes: 1, payment_due: 2, bill: 3 };

const isDay = (day: number | null): day is number => day !== null && Number.isInteger(day) && day >= 1 && day <= 31;

// Every date from `first` to `last` (both included) that falls on a monthly
// day, the next one found the way the reminder job finds the next cycle.
function datesOnDay(day: number, first: string, last: string): string[] {
  const dates: string[] = [];
  for (let date = nextOnDay(day, first); date <= last; date = nextOnDay(day, addDays(date, 1))) dates.push(date);
  return dates;
}

function tieBreak(event: ComingUpEvent): string {
  if (event.kind === "statement_closes" || event.kind === "payment_due") return event.card.name;
  if (event.kind === "bill") return event.bill;
  return "";
}

export function comingUp({
  today,
  cards,
  bills,
  paychecks = [],
  days = COMING_UP_DAYS,
}: {
  today: string;
  // The student's approved cards.
  cards: ComingUpCard[];
  // Who covers each bill, as saved (empty with no bank linked).
  bills: BillAnswer[];
  paychecks?: Paycheck[];
  // How many days to look ahead, today included: safe to spend's `days`.
  days?: number;
}): ComingUpEvent[] {
  const last = addDays(today, days - 1);
  const events: ComingUpEvent[] = [];

  for (const card of cards) {
    if (isDay(card.statementClosingDay)) {
      const payDownToCents = payDownTargetFor(card.creditLimitCents, card.spendLimitCents ?? null);
      for (const date of datesOnDay(card.statementClosingDay, today, last)) {
        events.push({ kind: "statement_closes", date, card, payDownToCents });
      }
    }
    if (isDay(card.paymentDueDay)) {
      for (const date of datesOnDay(card.paymentDueDay, today, last)) events.push({ kind: "payment_due", date, card });
    }
  }

  for (const answer of bills) {
    if (answer.coveredBy !== "me" && answer.coveredBy !== "split") continue;
    if (NOT_DATED.has(answer.bill)) continue;
    // A bill with no amount to pay has nothing to remind about.
    if (!isDay(answer.dueDay) || !answer.monthlyCents || answer.monthlyCents <= 0) continue;
    for (const date of datesOnDay(answer.dueDay, today, last)) {
      events.push({ kind: "bill", date, bill: answer.bill, share: answer.coveredBy === "split", amountCents: answer.monthlyCents });
    }
  }

  for (const paycheck of paychecks) {
    if (paycheck.date >= today && paycheck.date <= last && paycheck.amountCents > 0) {
      events.push({ kind: "paycheck", date: paycheck.date, amountCents: paycheck.amountCents });
    }
  }

  return events
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || tieBreak(a).localeCompare(tieBreak(b), "en"),
    )
    .slice(0, COMING_UP_MAX_ROWS);
}

export type ComingUpRow = {
  key: string;
  // "Nov 13  Statement closes": the date, two spaces, then what happens (709:1483).
  title: string;
  subtitle: string;
  // Where the date comes from, so it can be acted on or changed there.
  href: string;
  // Shows the student's money: masked in session replay.
  sensitive: boolean;
};

const AUTOPAY_LINE: Record<ComingUpCard["autopayStatus"], string> = {
  on: "Autopay is on",
  off: "Autopay is off. Set it up",
  // Never "off" when the student has not said.
  unknown: "Turn on autopay",
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

// One event as a List row. `nameCards` is true when more than one card has
// dates, so a payment row says whose payment it is.
export function comingUpRow(event: ComingUpEvent, { nameCards }: { nameCards: boolean }): ComingUpRow {
  const day = monthDay(event.date);
  switch (event.kind) {
    case "paycheck":
      return {
        key: `paycheck-${event.date}`,
        title: `${day}  Paycheck, ${moneyAmount(event.amountCents)}`,
        subtitle: "Looks like pay · from your bank",
        href: ROUTES.safeToSpend,
        sensitive: true,
      };
    case "statement_closes":
      return {
        key: `close-${event.card.applicationId}-${event.date}`,
        title: `${day}  Statement closes`,
        subtitle: event.payDownToCents === null ? event.card.name : `${event.card.name} · pay down to ${moneyAmount(event.payDownToCents)}`,
        href: paymentRemindersPath(event.card.applicationId),
        sensitive: event.payDownToCents !== null,
      };
    case "payment_due": {
      const autopay = AUTOPAY_LINE[event.card.autopayStatus];
      return {
        key: `due-${event.card.applicationId}-${event.date}`,
        title: `${day}  Payment due`,
        subtitle: nameCards ? `${event.card.name} · ${lowerFirst(autopay)}` : autopay,
        // Autopay not on: the issuer's autopay steps, as "Set it up" says. On:
        // the card's dates.
        href: event.card.autopayStatus === "on" ? paymentRemindersPath(event.card.applicationId) : autopayStepsPath(event.card.applicationId),
        sensitive: false,
      };
    }
    case "bill":
      return {
        key: `bill-${event.bill}-${event.date}`,
        title: `${day}  ${BILL_COPY[event.bill].label}, ${moneyAmount(event.amountCents)}`,
        subtitle: event.share ? "Your share · you typed this" : "You cover it · you typed this",
        // Your money, where the amounts and due days are edited.
        href: ROUTES.safeToSpend,
        sensitive: true,
      };
  }
}

// Coming up's rows for Home, or none.
export function comingUpRows(input: Parameters<typeof comingUp>[0]): ComingUpRow[] {
  const nameCards = input.cards.filter((card) => isDay(card.statementClosingDay) || isDay(card.paymentDueDay)).length > 1;
  return comingUp(input).map((event) => comingUpRow(event, { nameCards }));
}

// What each card is called on its rows: the brand students know it by
// ("Discover", as the Cards tab groups them), or the card's own name when it
// is not in the catalog or another listed card has the same brand.
export function comingUpCardNames(cards: { applicationId: string; cardName: string; brand: string | null }[]): Map<string, string> {
  const brands = new Map<string, number>();
  for (const card of cards) if (card.brand) brands.set(card.brand, (brands.get(card.brand) ?? 0) + 1);
  return new Map(
    cards.map((card) => [card.applicationId, card.brand && brands.get(card.brand) === 1 ? card.brand : card.cardName]),
  );
}
