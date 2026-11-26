import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { loadBudget } from "@/lib/budget/store";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend } from "@/lib/plaid/store";

// Your money, This month (US-12): the last full month's income and spending
// by category from the student's stored transactions, their typed numbers,
// and what is left over or short. Never calls Plaid.
export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  const link = await loadSafeToSpend(student);
  if (!link.ok) return databaseError("safe_to_spend_read", link.error);
  if (!link.value) return notLinked();
  const budget = await loadBudget(student, link.value.setAsideCents, undefined, link.value.bills);
  if (!budget.ok) return databaseError("budget_read", budget.error);
  return Response.json(budget.value, { headers: NO_STORE });
}
