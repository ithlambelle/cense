import { authenticatedStudent } from "@/lib/api/auth";
import { budgetLineKeySchema, saveBudgetLineSchema } from "@/lib/api/budget";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import type { LineKey } from "@/lib/budget/lines";
import { loadBudget, saveBudgetLine } from "@/lib/budget/store";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend } from "@/lib/plaid/store";

type Params = { params: Promise<{ line: string }> };

// The student's own number for one line of This month (US-12), in place of
// the bank's, then the budget with it.
export async function PUT(request: Request, context: Params): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  const { line } = await context.params;
  const key = budgetLineKeySchema.safeParse(line);
  if (!key.success) return apiError(400, "invalid_request", "Unknown budget line.");
  const parsed = saveBudgetLineSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const saved = await saveBudgetLine(student, key.data as LineKey, parsed.data.amountCents);
  if (!saved.ok) return databaseError("budget_line_save", saved.error);
  if (!saved.value) return notLinked();

  const link = await loadSafeToSpend(student);
  if (!link.ok) return databaseError("safe_to_spend_read", link.error);
  if (!link.value) return notLinked();
  const budget = await loadBudget(student, link.value.setAsideCents);
  if (!budget.ok) return databaseError("budget_read", budget.error);
  return Response.json(budget.value, { headers: NO_STORE });
}
