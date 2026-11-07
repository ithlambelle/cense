import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError } from "@/lib/api/errors";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend } from "@/lib/plaid/store";

// Safe to spend as last read (US-12): the balances, the student's answers
// and every step of the sum. Never calls Plaid; POST /bank-link/refresh does.
export async function GET(): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) return databaseError("safe_to_spend_read", loaded.error);
  if (!loaded.value) return notLinked();
  return Response.json(loaded.value, { headers: NO_STORE });
}
