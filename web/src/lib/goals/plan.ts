// Created with Claude Code (2026-11-26). The plan for a goal (Gap Plan slice
// 6, the simple slice of D42): the amount spread over the whole months left
// until its date, 6 months when it has none. Pure, shared by the server and
// the screen. Accepting the plan saves its monthly amount as the student's
// set-aside (D40), so safe to spend and This month use it through the math
// they already have; this file adds only the division.

import type { BillAnswer } from "@/lib/safe-to-spend/compute";

import type { GoalPreset } from "./presets";

// A goal with no date is planned over this many months (Gap Plan, cut item 1).
export const DEFAULT_MONTHS = 6;
// The latest date a goal can have, in years from today.
export const MAX_YEARS = 30;

const parse = (iso: string) => iso.split("-").map(Number) as [number, number, number];
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();
const iso = (year: number, month: number, day: number) =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

// Today on the app's calendar (Eastern, like safe to spend's day of the
// month; per-student time zones are SCOPE-20), as YYYY-MM-DD.
export function easternToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// A calendar date some months later, kept to the month's last day: August 31
// plus 6 months is the last day of February.
export function addMonthsIso(date: string, months: number): string {
  const [year, month, day] = parse(date);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  return iso(targetYear, targetMonth, Math.min(day, daysIn(targetYear, targetMonth)));
}

// Whole months from today until the goal's date, at least 1: a date this
// month, today or already past leaves one month to set it all aside. A month
// counts once its day comes round, and at a month's end its last day stands
// in for a later one (January 31 to February 28 is a month). No date: 6.
export function monthsLeft(today: string, targetDate: string | null): number {
  if (targetDate === null) return DEFAULT_MONTHS;
  const [fromYear, fromMonth, fromDay] = parse(today);
  const [toYear, toMonth, toDay] = parse(targetDate);
  let months = (toYear - fromYear) * 12 + (toMonth - fromMonth);
  if (toDay < Math.min(fromDay, daysIn(toYear, toMonth))) months -= 1;
  return Math.max(1, months);
}

// What to set aside each month: the amount over the months left, rounded up
// to the cent, so the goal is reached by its date and never a cent short.
export function monthlySetAside(amountCents: number, months: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new RangeError("amount must be a whole number of cents, more than 0");
  if (!Number.isInteger(months) || months < 1) throw new RangeError("months must be a whole number, 1 or more");
  return Math.ceil(amountCents / months);
}

// The plan, fixed when the goal is saved and kept until the student edits it,
// so the monthly amount never drifts as days pass: the date (the student's,
// or 6 months from the day it is saved) and the amount over the whole months
// left until then. Paying off a card sets nothing aside: safe to spend
// already holds the card's whole balance back (compute.ts), so a set-aside on
// top would count it twice. The step there is paying the statement in full.
export function planAtSave(
  { preset, amountCents, targetDate }: { preset: GoalPreset; amountCents: number; targetDate: string | null },
  today: string,
): { targetDate: string; monthlyCents: number } {
  const date = targetDate ?? addMonthsIso(today, DEFAULT_MONTHS);
  return { targetDate: date, monthlyCents: preset === "pay_off_card" ? 0 : monthlySetAside(amountCents, monthsLeft(today, date)) };
}

export type PlanSummary = {
  // A month's money in, or null when the bank has not shown any yet.
  incomeCents: number | null;
  billsCents: number;
  setAsideCents: number;
  // Money in less bills and the set-aside; null with no money in. Below zero is short.
  leftCents: number | null;
};

// Your plan's four lines, a month each: money in (last month, This month's
// income line), the bills the student pays all or part of (their saved
// monthly amounts, whatever the due day), the set-aside, and what is left for
// everything else.
export function planSummary({
  incomeCents,
  bills,
  setAsideCents,
}: {
  incomeCents: number | null;
  bills: readonly BillAnswer[];
  setAsideCents: number;
}): PlanSummary {
  const billsCents = bills
    .filter((answer) => answer.coveredBy === "me" || answer.coveredBy === "split")
    .reduce((sum, answer) => sum + (answer.monthlyCents ?? 0), 0);
  return { incomeCents, billsCents, setAsideCents, leftCents: incomeCents === null ? null : incomeCents - billsCents - setAsideCents };
}
