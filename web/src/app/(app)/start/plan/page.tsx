import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { YourPlan } from "@/components/goals/your-plan";
import { loadBudget } from "@/lib/budget/store";
import { planSummary } from "@/lib/goals/plan";
import { autopayApplicationId, loadGoal } from "@/lib/goals/store";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { autopayStepsPath, ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your plan | CENSE" };

// Created with Claude Code (2026-11-26). Your plan (US-17, Demo Day step 5,
// Gap Plan slice 6): the saved goal's monthly set-aside beside a month's money
// in and bills, then Accept or Edit. Read from what is saved, so a reload
// shows the same plan. With no goal, Pick a goal; with no answers yet, the
// questions, since the plan needs the bills.
export default async function StartPlanPage() {
  const student = await requireStudent(ROUTES.startPlan);
  if (!plaidConfig()) notFound();
  const [money, goal] = await Promise.all([loadSafeToSpend(student), loadGoal(student)]);
  if (!money.ok) throw new Error("Could not read the student's bank link.");
  if (!goal.ok) throw new Error("Could not read the student's goal.");
  if (!money.value) redirect(ROUTES.safeToSpendConnect);
  if (!money.value.answered) redirect(safeToSpendSetupPath());
  if (!goal.value) redirect(ROUTES.startGoal);

  // A month's money in is last month's, as This month shows it. Left out
  // when it cannot be read or the bank has shown none and none was typed.
  const budget = await loadBudget(student, money.value.setAsideCents);
  if (!budget.ok) console.warn(JSON.stringify({ event: "goal_plan_budget_read_failed" }));
  const income = budget.ok && (budget.value.hasBankData || budget.value.income.typed) ? budget.value.income.amountCents : null;

  // Pay off my card links autopay on a card that has none yet. Extra: a failed
  // read leaves the link out.
  let autopayHref: string | null = null;
  if (goal.value.preset === "pay_off_card") {
    const autopay = await autopayApplicationId(student);
    if (!autopay.ok) console.warn(JSON.stringify({ event: "goal_plan_autopay_read_failed" }));
    else if (autopay.value) autopayHref = autopayStepsPath(autopay.value);
  }

  return (
    <YourPlan
      autopayHref={autopayHref}
      goal={goal.value}
      previousSetAsideCents={money.value.setAsideCents}
      summary={planSummary({ incomeCents: income, bills: money.value.bills, setAsideCents: goal.value.monthlyCents })}
    />
  );
}
