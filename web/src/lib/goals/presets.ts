// Created with Claude Code (2026-11-26). The goals a student can pick on Pick
// a goal (Gap Plan, "Goal presets"), and the amount each one suggests. Pure,
// shared by the server and the screen.
//
// Five presets and "Something else" (Ben, Nov 26). Start investing is left
// out for the demo: investing is education only. Three show first, the rest
// behind More goals.

import { MAX_AMOUNT_CENTS } from "@/lib/budget/amount";
import { SEMESTER_BILL, type BillAnswer } from "@/lib/safe-to-spend/compute";

export const GOAL_PRESETS = ["emergency_fund", "pay_off_card", "trip", "car", "home", "other"] as const;
export type GoalPreset = (typeof GOAL_PRESETS)[number];

export const FIRST_PRESETS: readonly GoalPreset[] = ["emergency_fund", "pay_off_card", "trip"];
export const MORE_PRESETS: readonly GoalPreset[] = ["car", "home", "other"];

// The most a goal can be: the budget's largest amount, $1,000,000.
export const MAX_GOAL_CENTS = MAX_AMOUNT_CENTS;
// An emergency fund is at least this much, even when a month costs less.
export const EMERGENCY_FLOOR_CENTS = 100_000;

// Where a suggested amount came from, so the screen can say so.
// essentials: one month of the student's rent, bills and groceries.
// starter: the $1,000 floor, when a month of essentials is less.
// card_balance: what the student's card owes today, from their bank.
export type SuggestionSource = "essentials" | "starter" | "card_balance";
export type Suggestion = { amountCents: number; source: SuggestionSource };

// One month of essentials: every bill the student pays all or part of (rent,
// phone, groceries, car), from their saved answers, which Penny's reading
// filled in. Tuition is left out: it is paid per semester, not monthly, and
// is not what an emergency fund covers.
export function essentialsCents(bills: readonly BillAnswer[]): number {
  return bills
    .filter((answer) => (answer.coveredBy === "me" || answer.coveredBy === "split") && answer.bill !== SEMESTER_BILL)
    .reduce((sum, answer) => sum + (answer.monthlyCents ?? 0), 0);
}

// The amount Pick a goal fills in for a preset, or null when the student
// types it: an emergency fund is the greater of $1,000 and one month of
// essentials; paying off a card is its balance today, when the bank shows
// one. Never more than a goal can be.
export function suggestedAmount(
  preset: GoalPreset,
  { bills, cardCents }: { bills: readonly BillAnswer[]; cardCents: number },
): Suggestion | null {
  if (preset === "emergency_fund") {
    const essentials = essentialsCents(bills);
    return essentials > EMERGENCY_FLOOR_CENTS
      ? { amountCents: Math.min(MAX_GOAL_CENTS, essentials), source: "essentials" }
      : { amountCents: EMERGENCY_FLOOR_CENTS, source: "starter" };
  }
  if (preset === "pay_off_card" && cardCents > 0) {
    return { amountCents: Math.min(MAX_GOAL_CENTS, cardCents), source: "card_balance" };
  }
  return null;
}
