import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { YourMoneyView } from "@/components/your-money/your-money-view";
import { todayDay } from "@/lib/api/safe-to-spend";
import { loadBudget } from "@/lib/budget/store";
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
  let budget = null;
  if (tab === "month") {
    const read = await loadBudget(student, loaded.value.setAsideCents);
    if (!read.ok) throw new Error("Could not read the student's budget.");
    budget = read.value;
  }
  return <YourMoneyView tab={tab} data={loaded.value} budget={budget} today={todayDay()} />;
}
