import { authenticatedStudent } from "@/lib/api/auth";
import { databaseError } from "@/lib/api/database";
import { apiError, parseJson, validationError } from "@/lib/api/errors";
import { saveSafeToSpendAnswersSchema } from "@/lib/api/safe-to-spend";
import { plaidConfig } from "@/lib/plaid/config";
import { NO_STORE, notLinked, safeToSpendOff } from "@/lib/plaid/responses";
import { loadSafeToSpend, saveAnswers } from "@/lib/plaid/store";

// Who covers each bill and the amount kept aside (US-12, Figma 222:2090),
// replaced together, then safe to spend with them.
export async function PUT(request: Request): Promise<Response> {
  const student = await authenticatedStudent();
  if (!student) return apiError(401, "unauthorized", "Sign in to continue.");
  if (!plaidConfig()) return safeToSpendOff();

  const parsed = saveSafeToSpendAnswersSchema.safeParse(await parseJson(request));
  if (!parsed.success) return validationError(parsed.error);

  const saved = await saveAnswers(student, parsed.data);
  if (!saved.ok) return databaseError("safe_to_spend_answers_save", saved.error);
  if (!saved.value) return notLinked();

  const loaded = await loadSafeToSpend(student);
  if (!loaded.ok) return databaseError("safe_to_spend_read", loaded.error);
  if (!loaded.value) return notLinked();
  return Response.json(loaded.value, { headers: NO_STORE });
}
