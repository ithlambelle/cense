import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { YourMoneyView } from "@/components/your-money/your-money-view";
import { todayDay } from "@/lib/api/safe-to-spend";
import { loadBudget } from "@/lib/budget/store";
import { loadGoal } from "@/lib/goals/store";
import { plaidConfig } from "@/lib/plaid/config";
import { loadSafeToSpend } from "@/lib/plaid/store";
import { ROUTES, safeToSpendSetupPath } from "@/lib/routes";
import { requireStudent } from "@/lib/session";

export const metadata: Metadata = { title: "Your money | CENSE" };

// Your money (US-12): Today (?tab absent) or This month (?tab=month). With no
// bank linked it sends to the consent screen; with the questions unanswered,
// to the questions.
export default async function YourMoneyPage({ searchParams }: PageProps<"/safe-to-spend">) {
  const student = await requireStudent(ROUTES.safeToSpend);
  if (!plaidConfig()) notFound();
  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) throw new Error("Could not read the student's bank link.");
  if (!loaded.value) redirect(ROUTES.safeToSpendConnect);
  if (!loaded.value.answered) redirect(safeToSpendSetupPath());
  const tab = (await searchParams).tab === "month" ? "month" : "today";
  // Both tabs come with the page, so switching tabs needs no reload. If the
  // budget cannot be read, Today still opens and This month fails on its own.
  const read = await loadBudget(student, loaded.value.setAsideCents);
  if (!read.ok && tab === "month") throw new Error("Could not read the student's budget.");
  const budget = read.ok ? read.value : null;
  // Whether the savings goal line says Change goal or Set a goal. Extra: a
  // failed read says Set a goal, which still opens the saved goal.
  const goal = await loadGoal(student);
  if (!goal.ok) console.warn(JSON.stringify({ event: "your_money_goal_read_failed" }));
  return <YourMoneyView tab={tab} data={loaded.value} budget={budget} today={todayDay()} hasGoal={goal.ok && goal.value !== null} />;
}
