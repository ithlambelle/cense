import { authenticatedStudent } from "@/lib/api/auth";
import { budgetLineKeySchema, saveBudgetLineSchema } from "@/lib/api/budget";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import type { LineKey } from "@/lib/budget/lines";
import { deleteBudgetLine, loadBudget, saveBudgetLine } from "@/lib/budget/store";
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
  const budget = await loadBudget(student, link.value);
  if (!budget.ok) return databaseError("budget_read", budget.error);
  return Response.json(budget.value, { headers: NO_STORE });
}

// Back to the bank's number for one line of This month (US-12): the
// student's own number is deleted, then the budget without it.
export async function DELETE(_request: Request, context: Params): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  const { line } = await context.params;
  const key = budgetLineKeySchema.safeParse(line);
  if (!key.success) return apiError(400, "invalid_request", "Unknown budget line.");

  // Without a bank there is no row to delete and no budget to answer with.
  const link = await loadSafeToSpend(student);
  if (!link.ok) return databaseError("safe_to_spend_read", link.error);
  if (!link.value) return notLinked();
  const deleted = await deleteBudgetLine(student, key.data as LineKey);
  if (!deleted.ok) return databaseError("budget_line_delete", deleted.error);

  const budget = await loadBudget(student, link.value);
  if (!budget.ok) return databaseError("budget_read", budget.error);
  return Response.json(budget.value, { headers: NO_STORE });
}
