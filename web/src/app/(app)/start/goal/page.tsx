import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { PickGoal } from "@/components/goals/pick-goal";
import { easternToday } from "@/lib/goals/plan";
import { suggestedAmount } from "@/lib/goals/presets";
import { loadGoal } from "@/lib/goals/store";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Pick a goal | CENSE" };

// Created with Claude Code (2026-11-26). Pick a goal (US-17, Demo Day step
// 4), right after "Looks right?". The plan it leads to saves a set-aside on
// the linked bank, so a student with no bank links one first. The suggested
// amounts come from the student's saved answers (which Penny's reading filled
// in) and their card balance.
export default async function StartGoalPage() {
  const student = await requireStudent(ROUTES.startGoal);
  if (!plaidConfig()) notFound();
  const today = easternToday();
  const [money, goal] = await Promise.all([loadSafeToSpend(student), loadGoal(student)]);
  if (!money.ok) throw new Error("Could not read the student's bank link.");
  if (!goal.ok) throw new Error("Could not read the student's goal.");
  if (!money.value) redirect(ROUTES.safeToSpendConnect);
  const from = { bills: money.value.bills, cardCents: money.value.cardCents };
  return (
    <PickGoal
      saved={goal.value}
      today={today}
      suggestions={{ emergency_fund: suggestedAmount("emergency_fund", from), pay_off_card: suggestedAmount("pay_off_card", from) }}
    />
  );
}
